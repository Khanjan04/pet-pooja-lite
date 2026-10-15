// Commands. Each one mirrors a route in architecture.md "API" and does the same checks the
// server will: who is acting, do they have the right, is the state valid. Async so the
// signatures don't change when they become fetch() calls.

import { computeBill } from "@/lib/domain/billing";
import { businessDate, fiscalYear } from "@/lib/domain/dates";
import { lineDetail, pendingKotLines } from "@/lib/domain/kot";
import type { Bill, BillTotals, Id, Kot, Order, OrderItem, OrderType, PayMethod, Right } from "@/lib/domain/types";
import { demoPins } from "./seed";
import { commit, getDb, resetDb, type Db } from "./store";

export class DomainError extends Error {}

const SESSION_HOURS = 12;

function uuid() {
  return crypto.randomUUID();
}

function now() {
  return new Date();
}

function actor(d: Db, right?: Right) {
  const s = d.session;
  if (!s || Date.parse(s.expiresAt) < Date.now()) throw new DomainError("Your session has ended. Log in with your PIN again.");
  const staff = d.staff.find((x) => x.id === s.staffId);
  if (!staff) throw new DomainError("Staff member not found.");
  const role = d.roles.find((r) => r.id === staff.roleId);
  if (right && !role?.rights.includes(right)) throw new DomainError("You don’t have permission to do that. Ask a manager.");
  return staff;
}

function audit(d: Db, action: string, entity: string, entityId: Id, opts: { reason?: string; flagged?: boolean; detail?: string } = {}) {
  d.audit.push({
    id: uuid(),
    at: now().toISOString(),
    staffId: d.session?.staffId ?? null,
    action,
    entity,
    entityId,
    reason: opts.reason ?? null,
    flagged: opts.flagged ?? false,
    detail: opts.detail ?? null,
  });
}

function nextNumber(d: Db, kind: string, series: string, period: string) {
  const key = `${kind}:${series}:${period}`;
  const n = (d.counters[key] ?? 0) + 1;
  d.counters[key] = n;
  return n;
}

function bizDate(d: Db) {
  return businessDate(now(), d.outlet.timezone, d.outlet.dayStartsAt);
}

function getOrder(d: Db, id: Id) {
  const o = d.orders.find((x) => x.id === id);
  if (!o) throw new DomainError("Order not found.");
  return o;
}

function openBill(d: Db, orderId: Id) {
  return d.bills.find((b) => b.orderId === orderId && b.status !== "cancelled") ?? null;
}

/* ---------------- staff session (S17) ---------------- */

export async function loginWithPin(staffId: Id, pin: string) {
  return commit((d) => {
    if (demoPins[staffId] !== pin) throw new DomainError("Wrong PIN. Try again.");
    d.session = { staffId, expiresAt: new Date(Date.now() + SESSION_HOURS * 3600_000).toISOString() };
    audit(d, "staff.login", "staff", staffId);
  });
}

export async function logout() {
  commit((d) => {
    d.session = null;
  });
}

/* ---------------- orders (S18, S19) ---------------- */

export async function openOrder(input: { type: OrderType; tableId?: Id; pax?: number }): Promise<Id> {
  return commit((d) => {
    const staff = actor(d, "order.create");
    if (input.type === "dine_in" && !input.tableId) throw new DomainError("Pick a table for a dine-in order.");
    if (input.tableId) {
      const busy = d.orders.find((o) => (o.status === "open" || o.status === "billed") && o.tableIds.includes(input.tableId!));
      if (busy) return busy.id; // one running order per table: reopen it
    }
    const bd = bizDate(d);
    const order: Order = {
      id: uuid(),
      orderNo: String(nextNumber(d, "order", d.device.seriesCode, bd)),
      businessDate: bd,
      type: input.type,
      tableIds: input.tableId ? [input.tableId] : [],
      pax: input.pax ?? null,
      status: "open",
      createdByStaffId: staff.id,
      createdAt: now().toISOString(),
      cancelReason: null,
    };
    d.orders.push(order);
    return order.id;
  });
}

export async function addItem(orderId: Id, input: { itemId: Id; variationId?: Id | null; addonIds?: Id[]; qty?: number; note?: string | null }) {
  return commit((d) => {
    actor(d, "order.create");
    const order = getOrder(d, orderId);
    if (order.status !== "open") throw new DomainError("This order is already billed. Reopen it to add items.");
    const item = d.items.find((i) => i.id === input.itemId);
    if (!item) throw new DomainError("Item not found.");
    if (!item.inStock) throw new DomainError(`${item.name} is sold out.`);
    const variation = input.variationId ? item.variations.find((v) => v.id === input.variationId) ?? null : null;
    if (item.variations.length && !variation) throw new DomainError(`Pick a size for ${item.name}.`);
    const allAddons = d.addonGroups.filter((g) => item.addonGroupIds.includes(g.id));
    const addons = (input.addonIds ?? []).map((id) => {
      for (const g of allAddons) {
        const a = g.addons.find((x) => x.id === id);
        if (a) return { addonId: a.id, name: a.name, pricePaise: a.pricePaise };
      }
      throw new DomainError("That add-on isn’t available for this item.");
    });
    for (const g of allAddons) {
      const picked = g.addons.filter((a) => input.addonIds?.includes(a.id)).length;
      if (picked < g.minSelect) throw new DomainError(`Choose ${g.name.toLowerCase()} for ${item.name}.`);
      if (g.maxSelect != null && picked > g.maxSelect) throw new DomainError(`Pick at most ${g.maxSelect} from ${g.name}.`);
    }
    const unit = (variation?.pricePaise ?? item.pricePaise) + addons.reduce((a, x) => a + x.pricePaise, 0);
    const note = input.note?.trim() || null;
    const stationId = item.stationId ?? d.categories.find((c) => c.id === item.categoryId)?.stationId ?? null;

    // Same dish, same options, not yet sent: bump the quantity instead of adding a line.
    const same = d.orderItems.find(
      (oi) =>
        oi.orderId === orderId && oi.itemId === item.id && oi.status === "active" && oi.sentQty === 0 &&
        oi.variationId === (variation?.id ?? null) && oi.note === note &&
        JSON.stringify(oi.addons.map((a) => a.addonId).sort()) === JSON.stringify(addons.map((a) => a.addonId).sort()),
    );
    if (same) {
      same.qty += input.qty ?? 1;
      return same.id;
    }
    const line: OrderItem = {
      id: uuid(),
      orderId,
      itemId: item.id,
      variationId: variation?.id ?? null,
      stationId,
      name: item.name,
      variationName: variation?.name ?? null,
      addons,
      qty: input.qty ?? 1,
      unitPricePaise: unit,
      taxIds: item.taxIds,
      note,
      sentQty: 0,
      status: "active",
      voidReason: null,
      createdAt: now().toISOString(),
    };
    d.orderItems.push(line);
    return line.id;
  });
}

/** Change quantity of a line before it goes to the kitchen. 0 removes it. */
export async function setQty(orderItemId: Id, qty: number) {
  commit((d) => {
    actor(d, "order.create");
    const oi = d.orderItems.find((x) => x.id === orderItemId);
    if (!oi) throw new DomainError("Line not found.");
    if (getOrder(d, oi.orderId).status !== "open") throw new DomainError("This order is already billed.");
    if (qty < oi.sentQty) throw new DomainError("That much has gone to the kitchen already. Void it instead.");
    if (qty <= 0) d.orderItems = d.orderItems.filter((x) => x.id !== orderItemId);
    else oi.qty = qty;
  });
}

export async function sendKot(orderId: Id): Promise<Kot[]> {
  return commit((d) => {
    const staff = actor(d, "order.create");
    const order = getOrder(d, orderId);
    if (order.status !== "open") throw new DomainError("This order is already billed.");
    const lines = d.orderItems.filter((oi) => oi.orderId === orderId);
    const groups = pendingKotLines(lines);
    if (!groups.size) throw new DomainError("Nothing new to send to the kitchen.");
    const bd = bizDate(d);
    const made: Kot[] = [];
    for (const [stationId, kotLines] of groups) {
      const kot: Kot = {
        id: uuid(),
        orderId,
        stationId,
        kotNo: String(nextNumber(d, "kot", "ALL", bd)).padStart(4, "0"),
        businessDate: bd,
        kind: "new",
        lines: kotLines,
        status: "new",
        createdByStaffId: staff.id,
        createdAt: now().toISOString(),
      };
      d.kots.push(kot);
      made.push(kot);
      for (const l of kotLines) {
        const oi = lines.find((x) => x.id === l.orderItemId)!;
        oi.sentQty += l.qty;
      }
    }
    return made;
  });
}

/** Void a line (or part of it) that already went to the kitchen: prints a cancellation ticket. */
export async function voidItem(orderItemId: Id, qty: number, reason: string) {
  return commit((d) => {
    const staff = actor(d, "kot.cancel");
    if (!reason.trim()) throw new DomainError("Give a reason for the void.");
    const oi = d.orderItems.find((x) => x.id === orderItemId);
    if (!oi || oi.status !== "active") throw new DomainError("Line not found.");
    if (getOrder(d, oi.orderId).status !== "open") throw new DomainError("This order is already billed.");
    const n = Math.min(qty, oi.sentQty);
    if (n <= 0) throw new DomainError("Nothing on this line has gone to the kitchen. Change the quantity instead.");
    const bd = bizDate(d);
    d.kots.push({
      id: uuid(),
      orderId: oi.orderId,
      stationId: oi.stationId,
      kotNo: String(nextNumber(d, "kot", "ALL", bd)).padStart(4, "0"),
      businessDate: bd,
      kind: "void",
      lines: [{ orderItemId: oi.id, name: oi.name, detail: lineDetail(oi), note: null, qty: -n }],
      status: "new",
      createdByStaffId: staff.id,
      createdAt: now().toISOString(),
    });
    oi.qty -= n;
    oi.sentQty -= n;
    if (oi.qty === 0) {
      oi.qty = n; // keep the line visible as void, with what was voided
      oi.status = "void";
      oi.voidReason = reason.trim();
    } else {
      d.orderItems.push({ ...oi, id: uuid(), qty: n, sentQty: 0, status: "void", voidReason: reason.trim() });
    }
    audit(d, "kot.void", "order_item", oi.id, { reason, flagged: true, detail: `${n} × ${oi.name}` });
  });
}

/* ---------------- billing (S19, S21, S25) ---------------- */

export function orderTotals(d: Db, orderId: Id): BillTotals {
  const lines = d.orderItems.filter((oi) => oi.orderId === orderId && oi.status === "active");
  return computeBill(
    lines.map((l) => ({ grossPaise: l.unitPricePaise * l.qty, taxIds: l.taxIds })),
    { taxes: d.taxes, priceIncludesTax: d.outlet.priceIncludesTax, roundOff: d.outlet.roundOff },
  );
}

/** Freeze the bill and print it. Printing again is a reprint and is audited. */
export async function printBill(orderId: Id): Promise<Id> {
  return commit((d) => {
    const staff = actor(d, "bill.print");
    const order = getOrder(d, orderId);
    const existing = openBill(d, orderId);
    if (existing) {
      if (existing.printCount > 0) {
        actor(d, "bill.reprint");
        audit(d, "bill.reprint", "bill", existing.id, { flagged: true, detail: `Bill ${existing.billNo}` });
      }
      existing.printCount++;
      return existing.id;
    }
    if (order.status !== "open") throw new DomainError("This order can’t be billed.");
    const active = d.orderItems.filter((oi) => oi.orderId === orderId && oi.status === "active");
    if (!active.length) throw new DomainError("Add items before printing the bill.");
    if (active.some((oi) => oi.sentQty < oi.qty)) throw new DomainError("Send everything to the kitchen before billing.");
    const bd = bizDate(d);
    const fy = fiscalYear(bd);
    const bill: Bill = {
      id: uuid(),
      orderId,
      seriesCode: d.device.seriesCode,
      fiscalYear: fy,
      billNo: nextNumber(d, "bill", d.device.seriesCode, fy),
      businessDate: bd,
      status: "open",
      printCount: 1,
      createdByStaffId: staff.id,
      createdAt: now().toISOString(),
      settledAt: null,
      ...orderTotals(d, orderId),
    };
    d.bills.push(bill);
    order.status = "billed";
    return bill.id;
  });
}

/** Unlock a printed, unpaid bill to add or change items. Audited. */
export async function reopenOrder(orderId: Id, reason: string) {
  commit((d) => {
    actor(d, "bill.cancel");
    const order = getOrder(d, orderId);
    const bill = openBill(d, orderId);
    if (!bill || bill.status !== "open") throw new DomainError("Only an unpaid bill can be reopened.");
    if (d.payments.some((p) => p.billId === bill.id)) throw new DomainError("This bill has payments. Refund them first.");
    bill.status = "cancelled";
    order.status = "open";
    audit(d, "bill.reopen", "bill", bill.id, { reason, flagged: true, detail: `Bill ${bill.billNo}` });
  });
}

export function paidPaise(d: Db, billId: Id) {
  return d.payments.filter((p) => p.billId === billId).reduce((a, p) => a + p.amountPaise, 0);
}

export async function addPayment(billId: Id, input: { method: PayMethod; amountPaise: number; tenderedPaise?: number; reference?: string }) {
  return commit((d) => {
    const staff = actor(d, "bill.settle");
    const bill = d.bills.find((b) => b.id === billId);
    if (!bill || bill.status !== "open") throw new DomainError("This bill isn’t open for payment.");
    if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0) throw new DomainError("Enter an amount.");
    const due = bill.totalPaise - paidPaise(d, billId);
    if (input.amountPaise > due) throw new DomainError("That’s more than what’s due.");
    d.payments.push({
      id: uuid(),
      billId,
      businessDate: bill.businessDate,
      method: input.method,
      amountPaise: input.amountPaise,
      tenderedPaise: input.tenderedPaise ?? null,
      reference: input.reference?.trim() || null,
      receivedByStaffId: staff.id,
      createdAt: now().toISOString(),
    });
    if (paidPaise(d, billId) >= bill.totalPaise) {
      bill.status = "settled";
      bill.settledAt = now().toISOString();
      getOrder(d, bill.orderId).status = "settled"; // frees the table
    }
    return bill.status;
  });
}

export async function cancelOrder(orderId: Id, reason: string) {
  commit((d) => {
    actor(d, "order.cancel");
    if (!reason.trim()) throw new DomainError("Give a reason for cancelling.");
    const order = getOrder(d, orderId);
    if (order.status !== "open") throw new DomainError("Only an unbilled order can be cancelled.");
    const sent = d.orderItems.some((oi) => oi.orderId === orderId && oi.status === "active" && oi.sentQty > 0);
    if (sent) throw new DomainError("Void the items sent to the kitchen first.");
    order.status = "cancelled";
    order.cancelReason = reason.trim();
    audit(d, "order.cancel", "order", orderId, { reason, flagged: true });
  });
}

/* ---------------- demo ---------------- */

export async function resetDemo() {
  resetDb();
}

export { getDb };
