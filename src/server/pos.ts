import "server-only";
import { z } from "zod";
import { computeBill } from "@/lib/domain/billing";
import { businessDate, fiscalYear } from "@/lib/domain/dates";
import type { PayMethod } from "@/lib/domain/types";
import type { Device, StaffActor } from "./actors";
import { need } from "./actors";
import { many, one, tx, type Db } from "./db";
import { bad, conflict, notFound } from "./errors";

// Server versions of the commands in src/lib/data/api.ts. Same rules, same messages, now in
// one transaction each, with row locks, idempotency keys, an audit trail and a change event.

export interface Ctx {
  device: Device;
  staff: StaffActor;
  idempotencyKey: string | null;
}

const id = z.uuid();
const reason = z.string().trim().min(1, "Give a reason.").max(200);

export const schemas = {
  openOrder: z.object({ type: z.enum(["dine_in", "takeaway", "delivery"]), tableId: id.optional(), pax: z.number().int().min(1).max(99).optional() }),
  addItem: z.object({
    orderId: id,
    itemId: id,
    variationId: id.nullish(),
    addonIds: z.array(id).max(20).optional(),
    qty: z.number().int().min(1).max(99).optional(),
    note: z.string().trim().max(120).nullish(),
  }),
  setQty: z.object({ orderItemId: id, qty: z.number().int().min(0).max(99) }),
  sendKot: z.object({ orderId: id }),
  voidItem: z.object({ orderItemId: id, qty: z.number().int().min(1).max(99), reason }),
  printBill: z.object({ orderId: id }),
  reopenOrder: z.object({ orderId: id, reason }),
  addPayment: z.object({
    billId: id,
    method: z.enum(["cash", "card", "upi", "wallet", "due"]),
    amountPaise: z.number().int().positive().max(100_000_000),
    tenderedPaise: z.number().int().positive().max(100_000_000).optional(),
    reference: z.string().trim().max(60).optional(),
  }),
  cancelOrder: z.object({ orderId: id, reason }),
} as const;

export type CommandName = keyof typeof schemas;

/* ---------------- helpers ---------------- */

async function outletRow(c: Db, outletId: string) {
  return (await one<{ timezone: string; day_starts_at: string; price_includes_tax: boolean; round_off: boolean }>(
    c,
    "select timezone, to_char(day_starts_at, 'HH24:MI') as day_starts_at, price_includes_tax, round_off from outlets where id = $1",
    [outletId],
  ))!;
}

async function bizDate(c: Db, outletId: string) {
  const o = await outletRow(c, outletId);
  return businessDate(new Date(), o.timezone, o.day_starts_at);
}

const nextNumber = async (c: Db, outletId: string, kind: string, series: string, period: string) =>
  (await one<{ n: number }>(c, "select app.next_number($1, $2, $3, $4) as n", [outletId, kind, series, period]))!.n;

async function audit(c: Db, ctx: Ctx, action: string, entity: string, entityId: string, o: { reason?: string; flagged?: boolean; detail?: string } = {}) {
  await c.query(
    `insert into audit_log (org_id, outlet_id, actor_kind, actor_id, device_id, action, entity, entity_id, reason, flagged, after)
     values ($1, $2, 'staff', $3, $4, $5, $6, $7, $8, $9, $10)`,
    [ctx.device.orgId, ctx.device.outletId, ctx.staff.staffId, ctx.device.deviceId, action, entity, entityId, o.reason ?? null, o.flagged ?? false, o.detail ? JSON.stringify({ detail: o.detail }) : null],
  );
}

/** Lock the order row so concurrent commands on one order run one at a time. */
async function lockOrder(c: Db, ctx: Ctx, orderId: string) {
  const o = await one<{ id: string; status: string; order_no: string }>(
    c,
    "select id, status, order_no from orders where id = $1 and outlet_id = $2 for update",
    [orderId, ctx.device.outletId],
  );
  if (!o) throw notFound("Order not found.");
  return o;
}

async function lineWithOrder(c: Db, ctx: Ctx, orderItemId: string) {
  const l = await one<{ id: string; order_id: string; status: string; qty: number; name: string }>(
    c,
    "select id, order_id, status, qty, name from order_items where id = $1 and outlet_id = $2",
    [orderItemId, ctx.device.outletId],
  );
  if (!l) throw notFound("Line not found.");
  const order = await lockOrder(c, ctx, l.order_id);
  return { line: l, order };
}

const sentQty = async (c: Db, orderItemId: string) =>
  (await one<{ s: number }>(c, "select coalesce(sum(qty), 0)::float8 as s from kot_items where order_item_id = $1", [orderItemId]))!.s;

function detailOf(variationName: string | null, addons: { name: string }[]) {
  const parts = [variationName, ...addons.map((a) => a.name)].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

/* ---------------- commands ---------------- */

async function openOrder(c: Db, ctx: Ctx, input: z.infer<typeof schemas.openOrder>) {
  need(ctx.staff, "order.create");
  if (input.type === "dine_in" && !input.tableId) throw bad("Pick a table for a dine-in order.");
  if (input.tableId) {
    const t = await one(c, "select 1 from tables where id = $1 and outlet_id = $2 and active", [input.tableId, ctx.device.outletId]);
    if (!t) throw notFound("Table not found.");
    const running = await one<{ order_id: string }>(c, "select order_id from order_tables where table_id = $1 and released_at is null", [input.tableId]);
    if (running) return { result: running.order_id };
  }
  const bd = await bizDate(c, ctx.device.outletId);
  const orderNo = await nextNumber(c, ctx.device.outletId, "order", ctx.device.seriesCode, bd);
  const order = await one<{ id: string }>(
    c,
    `insert into orders (id, org_id, outlet_id, business_date, order_no, type, source, created_by_staff_id, device_id, pax)
     values (gen_random_uuid(), $1, $2, $3, $4, $5, 'pos', $6, $7, $8) returning id`,
    [ctx.device.orgId, ctx.device.outletId, bd, `${ctx.device.seriesCode}-${orderNo}`, input.type, ctx.staff.staffId, ctx.device.deviceId, input.pax ?? null],
  );
  if (input.tableId) {
    await c.query("savepoint seat");
    try {
      await c.query("insert into order_tables (org_id, outlet_id, order_id, table_id) values ($1, $2, $3, $4)", [ctx.device.orgId, ctx.device.outletId, order!.id, input.tableId]);
    } catch (e) {
      // Another till seated this table a moment ago: use that order (the unique index decided).
      if ((e as { code?: string }).code !== "23505") throw e;
      await c.query("rollback to savepoint seat");
      await c.query("delete from orders where id = $1", [order!.id]);
      const running = await one<{ order_id: string }>(c, "select order_id from order_tables where table_id = $1 and released_at is null", [input.tableId]);
      return { result: running!.order_id };
    }
  }
  return { result: order!.id };
}

async function addItem(c: Db, ctx: Ctx, input: z.infer<typeof schemas.addItem>) {
  need(ctx.staff, "order.create");
  const order = await lockOrder(c, ctx, input.orderId);
  if (order.status !== "open") throw conflict("This order is already billed. Reopen it to add items.");
  const item = await one<{ id: string; name: string; in_stock: boolean; price_paise: number; station_id: string | null; category_station: string | null }>(
    c,
    `select i.id, i.name, i.in_stock, i.price_paise, i.station_id, c.station_id as category_station
     from items i join categories c on c.id = i.category_id where i.id = $1 and i.outlet_id = $2 and i.active`,
    [input.itemId, ctx.device.outletId],
  );
  if (!item) throw notFound("Item not found.");
  if (!item.in_stock) throw conflict(`${item.name} is sold out.`);
  const variations = await many<{ id: string; name: string; price_paise: number }>(c, "select id, name, price_paise from variations where item_id = $1", [item.id]);
  const variation = input.variationId ? variations.find((v) => v.id === input.variationId) ?? null : null;
  if (input.variationId && !variation) throw bad("That size isn’t available for this item.");
  if (variations.length && !variation) throw bad(`Pick a size for ${item.name}.`);
  const groups = await many<{ id: string; name: string; min_select: number; max_select: number | null }>(
    c,
    "select g.id, g.name, g.min_select, g.max_select from item_addon_groups ig join addon_groups g on g.id = ig.group_id where ig.item_id = $1 order by ig.sort",
    [item.id],
  );
  const addonRows = await many<{ id: string; group_id: string; name: string; price_paise: number }>(
    c,
    "select id, group_id, name, price_paise from addons where group_id = any($1::uuid[]) and in_stock",
    [groups.map((g) => g.id)],
  );
  const picked = input.addonIds ?? [];
  const addons = picked.map((aid) => {
    const a = addonRows.find((x) => x.id === aid);
    if (!a) throw bad("That add-on isn’t available for this item.");
    return { addonId: a.id, name: a.name, pricePaise: a.price_paise };
  });
  for (const g of groups) {
    const n = addonRows.filter((a) => a.group_id === g.id && picked.includes(a.id)).length;
    if (n < g.min_select) throw bad(`Choose ${g.name.toLowerCase()} for ${item.name}.`);
    if (g.max_select != null && n > g.max_select) throw bad(`Pick at most ${g.max_select} from ${g.name}.`);
  }
  const unit = (variation?.price_paise ?? item.price_paise) + addons.reduce((s, a) => s + a.pricePaise, 0);
  const note = input.note?.trim() || null;
  const qty = input.qty ?? 1;
  const addonKey = JSON.stringify(addons.map((a) => a.addonId).sort());

  // Same dish, same options, nothing sent yet: bump quantity instead of a new line.
  const same = await one<{ id: string }>(
    c,
    `select oi.id from order_items oi
     where oi.order_id = $1 and oi.item_id = $2 and oi.status = 'active'
       and oi.variation_id is not distinct from $3 and oi.note is not distinct from $4
       and (select coalesce(jsonb_agg(a->>'addonId' order by a->>'addonId'), '[]'::jsonb) from jsonb_array_elements(oi.addons) a) = $5::jsonb
       and not exists (select 1 from kot_items k where k.order_item_id = oi.id)
     limit 1`,
    [order.id, item.id, variation?.id ?? null, note, addonKey],
  );
  if (same) {
    await c.query("update order_items set qty = qty + $2 where id = $1", [same.id, qty]);
    return { result: same.id };
  }
  const taxIds = (await many<{ tax_id: string }>(c, "select tax_id from item_taxes where item_id = $1", [item.id])).map((r) => r.tax_id);
  const line = await one<{ id: string }>(
    c,
    `insert into order_items (id, org_id, outlet_id, order_id, item_id, variation_id, station_id, name, variation_name, addons, qty, unit_price_paise, tax_ids, note, added_by_staff_id)
     values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) returning id`,
    [ctx.device.orgId, ctx.device.outletId, order.id, item.id, variation?.id ?? null, item.station_id ?? item.category_station, item.name, variation?.name ?? null, JSON.stringify(addons), qty, unit, taxIds, note, ctx.staff.staffId],
  );
  return { result: line!.id };
}

async function setQty(c: Db, ctx: Ctx, input: z.infer<typeof schemas.setQty>) {
  need(ctx.staff, "order.create");
  const { line, order } = await lineWithOrder(c, ctx, input.orderItemId);
  if (order.status !== "open") throw conflict("This order is already billed.");
  if (line.status !== "active") throw conflict("That line was voided.");
  const sent = await sentQty(c, line.id);
  if (input.qty < sent) throw conflict("That much has gone to the kitchen already. Void it instead.");
  if (input.qty === 0) await c.query("delete from order_items where id = $1", [line.id]);
  else await c.query("update order_items set qty = $2 where id = $1", [line.id, input.qty]);
  return { result: null };
}

async function sendKot(c: Db, ctx: Ctx, input: z.infer<typeof schemas.sendKot>) {
  need(ctx.staff, "order.create");
  const order = await lockOrder(c, ctx, input.orderId);
  if (order.status !== "open") throw conflict("This order is already billed.");
  const pending = await many<{ id: string; station_id: string | null; pending: number }>(
    c,
    `select oi.id, oi.station_id, oi.qty - coalesce((select sum(k.qty) from kot_items k where k.order_item_id = oi.id), 0) as pending
     from order_items oi where oi.order_id = $1 and oi.status = 'active' order by oi.created_at`,
    [order.id],
  );
  const groups = new Map<string | null, typeof pending>();
  for (const p of pending.filter((p) => p.pending > 0)) groups.set(p.station_id, [...(groups.get(p.station_id) ?? []), p]);
  if (!groups.size) throw conflict("Nothing new to send to the kitchen.");
  const bd = await bizDate(c, ctx.device.outletId);
  const made: { id: string; kotNo: string; stationId: string | null }[] = [];
  for (const [stationId, lines] of groups) {
    const kotNo = String(await nextNumber(c, ctx.device.outletId, "kot", "ALL", bd)).padStart(4, "0");
    const kot = await one<{ id: string }>(
      c,
      `insert into kots (id, org_id, outlet_id, order_id, station_id, business_date, kot_no, kind, created_by_staff_id)
       values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, 'new', $7) returning id`,
      [ctx.device.orgId, ctx.device.outletId, order.id, stationId, bd, kotNo, ctx.staff.staffId],
    );
    for (const l of lines)
      await c.query("insert into kot_items (org_id, outlet_id, kot_id, order_item_id, qty) values ($1, $2, $3, $4, $5)", [ctx.device.orgId, ctx.device.outletId, kot!.id, l.id, l.pending]);
    made.push({ id: kot!.id, kotNo, stationId });
  }
  return { result: made };
}

async function voidItem(c: Db, ctx: Ctx, input: z.infer<typeof schemas.voidItem>) {
  need(ctx.staff, "kot.cancel");
  const { line, order } = await lineWithOrder(c, ctx, input.orderItemId);
  if (line.status !== "active") throw notFound("Line not found.");
  if (order.status !== "open") throw conflict("This order is already billed.");
  const sent = await sentQty(c, line.id);
  const n = Math.min(input.qty, sent);
  if (n <= 0) throw conflict("Nothing on this line has gone to the kitchen. Change the quantity instead.");
  const full = await one<{ station_id: string | null; variation_name: string | null; addons: { name: string }[] }>(c, "select station_id, variation_name, addons from order_items where id = $1", [line.id]);
  const bd = await bizDate(c, ctx.device.outletId);
  const kotNo = String(await nextNumber(c, ctx.device.outletId, "kot", "ALL", bd)).padStart(4, "0");
  const kot = await one<{ id: string }>(
    c,
    `insert into kots (id, org_id, outlet_id, order_id, station_id, business_date, kot_no, kind, created_by_staff_id)
     values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, 'void', $7) returning id`,
    [ctx.device.orgId, ctx.device.outletId, order.id, full!.station_id, bd, kotNo, ctx.staff.staffId],
  );
  await c.query("insert into kot_items (org_id, outlet_id, kot_id, order_item_id, qty) values ($1, $2, $3, $4, $5)", [ctx.device.orgId, ctx.device.outletId, kot!.id, line.id, -n]);
  if (line.qty - n === 0) {
    await c.query("update order_items set status = 'void', void_reason = $2, voided_by_staff_id = $3 where id = $1", [line.id, input.reason, ctx.staff.staffId]);
  } else {
    await c.query("update order_items set qty = qty - $2 where id = $1", [line.id, n]);
    await c.query(
      `insert into order_items (id, org_id, outlet_id, order_id, item_id, variation_id, station_id, name, variation_name, addons, qty, unit_price_paise, tax_ids, note, status, void_reason, voided_by_staff_id, added_by_staff_id)
       select gen_random_uuid(), org_id, outlet_id, order_id, item_id, variation_id, station_id, name, variation_name, addons, $2, unit_price_paise, tax_ids, note, 'void', $3, $4, added_by_staff_id
       from order_items where id = $1`,
      [line.id, n, input.reason, ctx.staff.staffId],
    );
  }
  await audit(c, ctx, "kot.void", "order_item", line.id, { reason: input.reason, flagged: true, detail: `${n} × ${line.name}${detailOf(full!.variation_name, full!.addons) ? ` (${detailOf(full!.variation_name, full!.addons)})` : ""}` });
  return { result: null };
}

async function printBill(c: Db, ctx: Ctx, input: z.infer<typeof schemas.printBill>) {
  need(ctx.staff, "bill.print");
  const order = await lockOrder(c, ctx, input.orderId);
  const existing = await one<{ id: string; print_count: number; bill_no: number }>(
    c,
    "select id, print_count, bill_no from bills where order_id = $1 and status <> 'cancelled' for update",
    [order.id],
  );
  if (existing) {
    if (existing.print_count > 0) {
      need(ctx.staff, "bill.reprint");
      await audit(c, ctx, "bill.reprint", "bill", existing.id, { flagged: true, detail: `Bill ${existing.bill_no}` });
    }
    await c.query("update bills set print_count = print_count + 1 where id = $1", [existing.id]);
    return { result: existing.id };
  }
  if (order.status !== "open") throw conflict("This order can’t be billed.");
  const lines = await many<{ id: string; qty: number; unit_price_paise: number; tax_ids: string[]; sent: number }>(
    c,
    `select oi.id, oi.qty, oi.unit_price_paise, oi.tax_ids, coalesce((select sum(k.qty) from kot_items k where k.order_item_id = oi.id), 0) as sent
     from order_items oi where oi.order_id = $1 and oi.status = 'active'`,
    [order.id],
  );
  if (!lines.length) throw conflict("Add items before printing the bill.");
  if (lines.some((l) => l.sent < l.qty)) throw conflict("Send everything to the kitchen before billing.");
  const outlet = await outletRow(c, ctx.device.outletId);
  const taxes = await many<{ id: string; name: string; kind: string; rate_bp: number }>(c, "select id, name, kind, rate_bp from taxes where outlet_id = $1 and active and rate_bp is not null order by name", [ctx.device.outletId]);
  const totals = computeBill(
    lines.map((l) => ({ grossPaise: l.unit_price_paise * l.qty, taxIds: l.tax_ids })),
    { taxes: taxes.map((t) => ({ id: t.id, name: t.name, kind: t.kind as never, rateBp: t.rate_bp })), priceIncludesTax: outlet.price_includes_tax, roundOff: outlet.round_off },
  );
  const bd = await bizDate(c, ctx.device.outletId);
  const fy = fiscalYear(bd);
  const billNo = await nextNumber(c, ctx.device.outletId, "bill", ctx.device.seriesCode, fy);
  const bill = await one<{ id: string }>(
    c,
    `insert into bills (id, org_id, outlet_id, order_id, business_date, series_code, fiscal_year, bill_no, subtotal_paise, discount_paise, charges_paise, tax_paise, round_off_paise, total_paise, print_count, created_by_staff_id)
     values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 1, $14) returning id`,
    [ctx.device.orgId, ctx.device.outletId, order.id, bd, ctx.device.seriesCode, fy, billNo, totals.subtotalPaise, totals.discountPaise, totals.chargesPaise, totals.taxPaise, totals.roundOffPaise, totals.totalPaise, ctx.staff.staffId],
  );
  for (const l of lines)
    await c.query("insert into bill_lines (org_id, outlet_id, bill_id, order_item_id, qty, amount_paise) values ($1,$2,$3,$4,$5,$6)", [ctx.device.orgId, ctx.device.outletId, bill!.id, l.id, l.qty, l.qty * l.unit_price_paise]);
  for (const t of totals.taxLines) {
    const kind = taxes.find((x) => x.id === t.taxId)!.kind;
    await c.query(
      "insert into bill_taxes (org_id, outlet_id, bill_id, tax_id, name, kind, rate_bp, taxable_paise, amount_paise) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [ctx.device.orgId, ctx.device.outletId, bill!.id, t.taxId, t.name, kind, t.rateBp, t.taxablePaise, t.amountPaise],
    );
  }
  await c.query("update orders set status = 'billed' where id = $1", [order.id]);
  return { result: bill!.id };
}

async function reopenOrder(c: Db, ctx: Ctx, input: z.infer<typeof schemas.reopenOrder>) {
  need(ctx.staff, "bill.cancel");
  const order = await lockOrder(c, ctx, input.orderId);
  const bill = await one<{ id: string; bill_no: number; status: string }>(c, "select id, bill_no, status from bills where order_id = $1 and status <> 'cancelled'", [order.id]);
  if (!bill || bill.status !== "open") throw conflict("Only an unpaid bill can be reopened.");
  if (await one(c, "select 1 from payments where bill_id = $1", [bill.id])) throw conflict("This bill has payments. Refund them first.");
  await c.query("update bills set status = 'cancelled', cancelled_reason = $2 where id = $1", [bill.id, input.reason]);
  await c.query("update orders set status = 'open' where id = $1", [order.id]);
  await audit(c, ctx, "bill.reopen", "bill", bill.id, { reason: input.reason, flagged: true, detail: `Bill ${bill.bill_no}` });
  return { result: null };
}

async function addPayment(c: Db, ctx: Ctx, input: z.infer<typeof schemas.addPayment>) {
  need(ctx.staff, "bill.settle");
  if (input.method === "wallet" || input.method === "due") throw bad("Wallet and pay-later need a customer account (coming soon).");
  const bill = await one<{ id: string; order_id: string; status: string; total_paise: number; business_date: string }>(
    c,
    "select id, order_id, status, total_paise, to_char(business_date, 'YYYY-MM-DD') as business_date from bills where id = $1 and outlet_id = $2",
    [input.billId, ctx.device.outletId],
  );
  if (!bill) throw notFound("Bill not found.");
  await lockOrder(c, ctx, bill.order_id);
  if (bill.status !== "open") throw conflict("This bill isn’t open for payment.");
  const paid = (await one<{ s: number }>(c, "select coalesce(sum(amount_paise), 0) as s from payments where bill_id = $1", [bill.id]))!.s;
  if (input.amountPaise > bill.total_paise - paid) throw bad("That’s more than what’s due.");
  if (input.method === "cash" && input.tenderedPaise != null && input.tenderedPaise < input.amountPaise) throw bad("Cash received is less than the amount.");
  await c.query(
    `insert into payments (id, org_id, outlet_id, bill_id, business_date, method, amount_paise, tendered_paise, reference, received_by_staff_id)
     values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [ctx.device.orgId, ctx.device.outletId, bill.id, bill.business_date, input.method as PayMethod, input.amountPaise, input.method === "cash" ? input.tenderedPaise ?? null : null, input.method === "cash" ? null : input.reference || null, ctx.staff.staffId],
  );
  if (paid + input.amountPaise >= bill.total_paise) {
    await c.query("update bills set status = 'settled', settled_at = now() where id = $1", [bill.id]);
    await c.query("update orders set status = 'settled' where id = $1", [bill.order_id]);
    await c.query("update order_tables set released_at = now() where order_id = $1 and released_at is null", [bill.order_id]);
    return { result: "settled" };
  }
  return { result: "open" };
}

async function cancelOrder(c: Db, ctx: Ctx, input: z.infer<typeof schemas.cancelOrder>) {
  need(ctx.staff, "order.cancel");
  const order = await lockOrder(c, ctx, input.orderId);
  if (order.status !== "open") throw conflict("Only an unbilled order can be cancelled.");
  const sent = await one(c, "select 1 from order_items oi join kot_items k on k.order_item_id = oi.id where oi.order_id = $1 and oi.status = 'active' group by oi.id having sum(k.qty) > 0", [order.id]);
  if (sent) throw conflict("Void the items sent to the kitchen first.");
  await c.query("update orders set status = 'cancelled', cancel_reason = $2 where id = $1", [order.id, input.reason]);
  await c.query("update order_tables set released_at = now() where order_id = $1 and released_at is null", [order.id]);
  await audit(c, ctx, "order.cancel", "order", order.id, { reason: input.reason, flagged: true });
  return { result: null };
}

const handlers: { [K in CommandName]: (c: Db, ctx: Ctx, input: z.infer<(typeof schemas)[K]>) => Promise<{ result: unknown }> } = {
  openOrder, addItem, setQty, sendKot, voidItem, printBill, reopenOrder, addPayment, cancelOrder,
};

export const channelFor = (outletId: string) => `kk_outlet_${outletId.replace(/-/g, "")}`;

/** Run one command in a transaction. Replaying an idempotency key returns the first answer. */
export async function runCommand(name: CommandName, raw: unknown, ctx: Ctx): Promise<unknown> {
  const input = schemas[name].parse(raw);
  return tx(async (c) => {
    const key = ctx.idempotencyKey ? `${ctx.device.deviceId}:${ctx.idempotencyKey}` : null;
    if (key) {
      const fresh = await one(c, "insert into idempotency_keys (key, org_id, command, response) values ($1, $2, $3, 'null') on conflict (key) do nothing returning key", [key, ctx.device.orgId, name]);
      if (!fresh) {
        const prev = await one<{ response: unknown; command: string }>(c, "select response, command from idempotency_keys where key = $1", [key]);
        if (prev!.command !== name) throw conflict("That request id was already used for something else.");
        return prev!.response;
      }
    }
    const { result } = await (handlers[name] as (c: Db, ctx: Ctx, i: unknown) => Promise<{ result: unknown }>)(c, ctx, input);
    if (key) await c.query("update idempotency_keys set response = $2 where key = $1", [key, JSON.stringify(result)]);
    await c.query("select pg_notify($1, $2)", [channelFor(ctx.device.outletId), JSON.stringify({ command: name })]);
    return result;
  });
}
