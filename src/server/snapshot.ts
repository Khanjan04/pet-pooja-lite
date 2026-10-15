import "server-only";
import type { Db as Snapshot } from "@/lib/data/store";
import { businessDate } from "@/lib/domain/dates";
import { lineDetail } from "@/lib/domain/kot";
import type { Kot, OrderItem } from "@/lib/domain/types";
import { asReader, many, one, type Claims } from "./db";
import { notFound } from "./errors";

/**
 * Everything one outlet's screens need for today, in the same shape as the client store.
 * Runs under RLS (asReader), so a bug here still can't leak another tenant's rows.
 */
export async function outletSnapshot(
  claims: Claims,
  outletId: string,
  opts: { device?: { id: string; seriesCode: string }; session?: { staffId: string; expiresAt: string } | null; rosterOnly?: boolean },
): Promise<Snapshot> {
  return asReader(claims, async (c) => {
    const o = await one<Record<string, unknown>>(
      c,
      `select id, name, coalesce(address, '') as address, gstin, fssai_no, coalesce(state_code, '') as state_code, timezone,
              to_char(day_starts_at, 'HH24:MI') as day_starts_at, price_includes_tax, round_off,
              coalesce(bill_header, name) as bill_header, coalesce(bill_footer, '') as bill_footer
       from outlets where id = $1`,
      [outletId],
    );
    if (!o) throw notFound("Outlet not found.");
    const outlet = {
      id: o.id as string, name: o.name as string, address: o.address as string, gstin: o.gstin as string | null, fssaiNo: o.fssai_no as string | null,
      stateCode: o.state_code as string, timezone: o.timezone as string, dayStartsAt: o.day_starts_at as string,
      priceIncludesTax: o.price_includes_tax as boolean, roundOff: o.round_off as boolean, billHeader: o.bill_header as string, billFooter: o.bill_footer as string,
    };
    const roles = await many<{ id: string; name: string; rights: string[] }>(c, "select id, name, rights from roles order by name");
    const staff = (await many<{ id: string; name: string; role_id: string }>(
      c,
      "select id, name, role_id from staff where active and (cardinality(outlet_ids) = 0 or $1 = any(outlet_ids)) order by created_at",
      [outletId],
    )).map((s) => ({ id: s.id, name: s.name, roleId: s.role_id }));

    const empty: Snapshot = {
      version: 1, outlet, taxes: [], stations: [], categories: [], addonGroups: [], items: [], areas: [], tables: [],
      roles: roles.map((r) => ({ id: r.id, name: r.name, rights: r.rights as never })), staff,
      orders: [], orderItems: [], kots: [], bills: [], payments: [], audit: [], counters: {},
      device: opts.device ?? { id: "", seriesCode: "" }, session: opts.session ?? null,
    };
    if (opts.rosterOnly) return empty;

    const today = businessDate(new Date(), outlet.timezone, outlet.dayStartsAt);
    const [taxes, stations, categories, groups, addons, items, itemTaxes, variations, itemGroups, areas, tables] = await Promise.all([
      many<{ id: string; name: string; kind: string; rate_bp: number }>(c, "select id, name, kind, rate_bp from taxes where outlet_id = $1 and active and rate_bp is not null order by name", [outletId]),
      many<{ id: string; name: string }>(c, "select id, name from stations where outlet_id = $1 order by name", [outletId]),
      many<{ id: string; name: string; station_id: string | null; sort: number }>(c, "select id, name, station_id, sort from categories where outlet_id = $1 and active order by sort, name", [outletId]),
      many<{ id: string; name: string; min_select: number; max_select: number | null }>(c, "select id, name, min_select, max_select from addon_groups where outlet_id = $1", [outletId]),
      many<{ id: string; group_id: string; name: string; price_paise: number }>(c, "select id, group_id, name, price_paise from addons where outlet_id = $1 and in_stock order by sort", [outletId]),
      many<{ id: string; category_id: string; station_id: string | null; name: string; shortcode: string | null; food_type: string; price_paise: number; in_stock: boolean; sort: number }>(
        c, "select id, category_id, station_id, name, shortcode, food_type, price_paise, in_stock, sort from items where outlet_id = $1 and active order by sort", [outletId]),
      many<{ item_id: string; tax_id: string }>(c, "select it.item_id, it.tax_id from item_taxes it join items i on i.id = it.item_id where i.outlet_id = $1", [outletId]),
      many<{ id: string; item_id: string; name: string; price_paise: number }>(c, "select id, item_id, name, price_paise from variations where outlet_id = $1 order by sort", [outletId]),
      many<{ item_id: string; group_id: string }>(c, "select ig.item_id, ig.group_id from item_addon_groups ig join items i on i.id = ig.item_id where i.outlet_id = $1 order by ig.sort", [outletId]),
      many<{ id: string; name: string; sort: number }>(c, "select id, name, sort from areas where outlet_id = $1 order by sort", [outletId]),
      many<{ id: string; area_id: string; name: string; seats: number }>(c, "select id, area_id, name, seats from tables where outlet_id = $1 and active order by sort", [outletId]),
    ]);

    // Today's orders plus anything still running from earlier.
    const orders = await many<{ id: string; order_no: string; business_date: string; type: string; pax: number | null; status: string; created_by_staff_id: string; created_at: Date; cancel_reason: string | null; table_ids: string[] }>(
      c,
      `select o.id, o.order_no, to_char(o.business_date, 'YYYY-MM-DD') as business_date, o.type, o.pax, o.status, o.created_by_staff_id, o.created_at, o.cancel_reason,
              coalesce((select array_agg(ot.table_id) from order_tables ot where ot.order_id = o.id and (ot.released_at is null or o.status in ('settled','cancelled'))), '{}') as table_ids
       from orders o where o.outlet_id = $1 and (o.business_date = $2 or o.status in ('open','billed')) order by o.created_at`,
      [outletId, today],
    );
    const orderIds = orders.map((o) => o.id);
    const [lines, kotRows, kotItems, bills, billTaxes, payments, audit] = await Promise.all([
      many<{ id: string; order_id: string; item_id: string; variation_id: string | null; station_id: string | null; name: string; variation_name: string | null; addons: OrderItem["addons"]; qty: number; unit_price_paise: number; tax_ids: string[]; note: string | null; status: "active" | "void"; void_reason: string | null; created_at: Date; sent: number }>(
        c,
        `select oi.*, coalesce((select sum(k.qty) from kot_items k where k.order_item_id = oi.id), 0)::float8 as sent
         from order_items oi where oi.order_id = any($1::uuid[]) order by oi.created_at`,
        [orderIds],
      ),
      many<{ id: string; order_id: string; station_id: string | null; kot_no: string; business_date: string; kind: "new" | "void"; kds_status: string; created_by_staff_id: string; created_at: Date }>(
        c, "select id, order_id, station_id, kot_no, to_char(business_date, 'YYYY-MM-DD') as business_date, kind, kds_status, created_by_staff_id, created_at from kots where order_id = any($1::uuid[]) order by created_at", [orderIds]),
      many<{ kot_id: string; order_item_id: string; qty: number }>(c, "select ki.kot_id, ki.order_item_id, ki.qty from kot_items ki join kots k on k.id = ki.kot_id where k.order_id = any($1::uuid[])", [orderIds]),
      many<Record<string, unknown>>(c, "select *, to_char(business_date, 'YYYY-MM-DD') as bd from bills where order_id = any($1::uuid[]) order by created_at", [orderIds]),
      many<{ bill_id: string; tax_id: string; name: string; rate_bp: number; taxable_paise: number; amount_paise: number }>(c, "select bt.* from bill_taxes bt join bills b on b.id = bt.bill_id where b.order_id = any($1::uuid[]) order by bt.name", [orderIds]),
      many<{ id: string; bill_id: string; business_date: string; method: string; amount_paise: number; tendered_paise: number | null; reference: string | null; received_by_staff_id: string; created_at: Date }>(
        c, "select p.id, p.bill_id, to_char(p.business_date, 'YYYY-MM-DD') as business_date, p.method, p.amount_paise, p.tendered_paise, p.reference, p.received_by_staff_id, p.created_at from payments p join bills b on b.id = p.bill_id where b.order_id = any($1::uuid[]) order by p.created_at", [orderIds]),
      many<{ id: string; created_at: Date; actor_id: string | null; action: string; entity: string; entity_id: string; reason: string | null; flagged: boolean; after: { detail?: string } | null }>(
        c, "select id::text, created_at, actor_id, action, entity, entity_id, reason, flagged, after from audit_log where outlet_id = $1 and created_at > now() - interval '36 hours' order by id", [outletId]),
    ]);

    const orderItems: OrderItem[] = lines.map((l) => ({
      id: l.id, orderId: l.order_id, itemId: l.item_id, variationId: l.variation_id, stationId: l.station_id, name: l.name, variationName: l.variation_name,
      addons: l.addons, qty: l.qty, unitPricePaise: l.unit_price_paise, taxIds: l.tax_ids, note: l.note, sentQty: l.sent, status: l.status,
      voidReason: l.void_reason, createdAt: l.created_at.toISOString(),
    }));
    const byLine = new Map(orderItems.map((l) => [l.id, l]));
    const kots: Kot[] = kotRows.map((k) => ({
      id: k.id, orderId: k.order_id, stationId: k.station_id, kotNo: k.kot_no, businessDate: k.business_date, kind: k.kind,
      status: (k.kds_status === "ready" || k.kds_status === "preparing" ? k.kds_status : "new") as Kot["status"],
      createdByStaffId: k.created_by_staff_id, createdAt: k.created_at.toISOString(),
      lines: kotItems.filter((ki) => ki.kot_id === k.id).map((ki) => {
        const l = byLine.get(ki.order_item_id)!;
        return { orderItemId: ki.order_item_id, name: l.name, detail: lineDetail(l), note: l.note, qty: ki.qty };
      }),
    }));

    return {
      ...empty,
      taxes: taxes.map((t) => ({ id: t.id, name: t.name, kind: t.kind as never, rateBp: t.rate_bp })),
      stations,
      categories: categories.map((x) => ({ id: x.id, name: x.name, stationId: x.station_id, sort: x.sort })),
      addonGroups: groups.map((g) => ({
        id: g.id, name: g.name, minSelect: g.min_select, maxSelect: g.max_select,
        addons: addons.filter((a) => a.group_id === g.id).map((a) => ({ id: a.id, name: a.name, pricePaise: a.price_paise })),
      })),
      items: items.map((i) => ({
        id: i.id, categoryId: i.category_id, stationId: i.station_id, name: i.name, shortcode: i.shortcode, foodType: i.food_type as never,
        pricePaise: i.price_paise, inStock: i.in_stock, sort: i.sort,
        taxIds: itemTaxes.filter((t) => t.item_id === i.id).map((t) => t.tax_id),
        variations: variations.filter((v) => v.item_id === i.id).map((v) => ({ id: v.id, name: v.name, pricePaise: v.price_paise })),
        addonGroupIds: itemGroups.filter((g) => g.item_id === i.id).map((g) => g.group_id),
      })),
      areas,
      tables: tables.map((t) => ({ id: t.id, areaId: t.area_id, name: t.name, seats: t.seats })),
      orders: orders.map((x) => ({
        id: x.id, orderNo: x.order_no, businessDate: x.business_date, type: x.type as never, tableIds: x.table_ids, pax: x.pax,
        status: x.status as never, createdByStaffId: x.created_by_staff_id, createdAt: x.created_at.toISOString(), cancelReason: x.cancel_reason,
      })),
      orderItems,
      kots,
      bills: bills.map((b) => ({
        id: b.id as string, orderId: b.order_id as string, seriesCode: b.series_code as string, fiscalYear: b.fiscal_year as string, billNo: b.bill_no as number,
        businessDate: b.bd as string, status: b.status as never, printCount: b.print_count as number, createdByStaffId: b.created_by_staff_id as string,
        createdAt: (b.created_at as Date).toISOString(), settledAt: b.settled_at ? (b.settled_at as Date).toISOString() : null,
        subtotalPaise: b.subtotal_paise as number, discountPaise: b.discount_paise as number, chargesPaise: b.charges_paise as number,
        taxPaise: b.tax_paise as number, roundOffPaise: b.round_off_paise as number, totalPaise: b.total_paise as number,
        taxLines: billTaxes.filter((t) => t.bill_id === b.id).map((t) => ({ taxId: t.tax_id, name: t.name, rateBp: t.rate_bp, taxablePaise: t.taxable_paise, amountPaise: t.amount_paise })),
      })),
      payments: payments.map((p) => ({
        id: p.id, billId: p.bill_id, businessDate: p.business_date, method: p.method as never, amountPaise: p.amount_paise, tenderedPaise: p.tendered_paise,
        reference: p.reference, receivedByStaffId: p.received_by_staff_id, createdAt: p.created_at.toISOString(),
      })),
      audit: audit.map((a) => ({
        id: a.id, at: a.created_at.toISOString(), staffId: a.actor_id, action: a.action, entity: a.entity, entityId: a.entity_id,
        reason: a.reason, flagged: a.flagged, detail: a.after?.detail ?? null,
      })),
    };
  });
}
