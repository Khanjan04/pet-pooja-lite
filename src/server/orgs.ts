import "server-only";
import { z } from "zod";
import * as sample from "@/lib/data/seed";
import type { Right } from "@/lib/domain/types";
import { hashPin } from "./crypto";
import { one, tx, type Db } from "./db";
import { conflict } from "./errors";

export const CreateOrgInput = z.object({
  restaurantName: z.string().trim().min(2).max(80),
  outletName: z.string().trim().min(2).max(80),
  address: z.string().trim().max(200).default(""),
  city: z.string().trim().max(60).default(""),
  stateCode: z.string().regex(/^\d{2}$/, "Pick a state"),
  gstScheme: z.enum(["regular", "composition", "unregistered"]),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[0-9]{2}[A-Z0-9]{13}$/, "A GSTIN is 15 characters")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  ownerName: z.string().trim().min(1).max(60),
  ownerPin: z.string().regex(/^\d{4}$/, "PIN is 4 digits"),
  sampleMenu: z.boolean().default(true),
});
export type CreateOrgInput = z.infer<typeof CreateOrgInput>;

const ALL_RIGHTS: Right[] = ["order.create", "kot.cancel", "bill.print", "bill.reprint", "bill.settle", "bill.cancel", "discount.give", "order.cancel", "table.shift", "day_end", "reports.view"];
const DEFAULT_ROLES: { name: string; rights: Right[] }[] = [
  { name: "Manager", rights: ALL_RIGHTS },
  { name: "Cashier", rights: ["order.create", "bill.print", "bill.settle", "table.shift", "day_end"] },
  { name: "Captain", rights: ["order.create", "bill.print"] },
];

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "outlet";
}

/** Signup step 2: one org, its first outlet, the owner as member and as till staff, roles, GST. */
export async function createOrg(userId: string, input: CreateOrgInput) {
  if (input.gstScheme === "regular" && !input.gstin) throw conflict("A GST-registered restaurant needs its GSTIN.");
  return tx(async (c) => {
    // Serialise per user: two simultaneous requests (double click) must not both pass the check below.
    await c.query("select pg_advisory_xact_lock(hashtextextended('create-org:' || $1, 0))", [userId]);
    const existing = await one(c, "select 1 from org_members where user_id = $1", [userId]);
    if (existing) throw conflict("You already have a restaurant set up.");
    const org = await one<{ id: string }>(c, "insert into organizations (name) values ($1) returning id", [input.restaurantName]);
    const orgId = org!.id;
    const slug = `${slugify(input.restaurantName)}-${Math.random().toString(36).slice(2, 7)}`;
    const outlet = await one<{ id: string }>(
      c,
      `insert into outlets (org_id, name, slug, address, city, state_code, gstin, gst_scheme, bill_header, bill_footer)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'Thank you. Visit again!') returning id`,
      [orgId, input.outletName, slug, input.address, input.city, input.stateCode, input.gstin ?? null, input.gstScheme, input.restaurantName],
    );
    const outletId = outlet!.id;
    await c.query("insert into org_members (org_id, user_id, role, all_outlets) values ($1, $2, 'owner', true)", [orgId, userId]);

    const roleIds: Record<string, string> = {};
    for (const r of DEFAULT_ROLES) {
      const row = await one<{ id: string }>(c, "insert into roles (org_id, name, rights, is_system) values ($1, $2, $3, true) returning id", [orgId, r.name, r.rights]);
      roleIds[r.name] = row!.id;
    }
    const staff = await one<{ id: string }>(c, "insert into staff (org_id, role_id, name) values ($1, $2, $3) returning id", [orgId, roleIds.Manager, input.ownerName]);
    await c.query("insert into staff_secrets (staff_id, org_id, pin_hash) values ($1, $2, $3)", [staff!.id, orgId, await hashPin(input.ownerPin)]);

    // Restaurants under the regular scheme charge 5% GST (CGST + SGST within the state).
    const taxIds: string[] = [];
    if (input.gstScheme === "regular") {
      for (const [name, kind] of [["CGST 2.5%", "cgst"], ["SGST 2.5%", "sgst"]] as const) {
        const t = await one<{ id: string }>(c, "insert into taxes (org_id, outlet_id, name, kind, rate_bp) values ($1, $2, $3, $4, 250) returning id", [orgId, outletId, name, kind]);
        taxIds.push(t!.id);
      }
    }
    if (input.sampleMenu) await addSampleMenu(c, orgId, outletId, taxIds);
    else await c.query("insert into stations (org_id, outlet_id, name) values ($1, $2, 'Kitchen')", [orgId, outletId]);
    return { orgId, outletId };
  });
}

/** The demo menu, floor and extra staff from lib/data/seed.ts, with fresh ids. */
async function addSampleMenu(c: Db, orgId: string, outletId: string, taxIds: string[]) {
  const ids = new Map<string, string>();
  const ins = async (sql: string, params: unknown[], key: string) => {
    const r = await one<{ id: string }>(c, sql, params);
    ids.set(key, r!.id);
  };
  for (const s of sample.stations) await ins("insert into stations (org_id, outlet_id, name) values ($1,$2,$3) returning id", [orgId, outletId, s.name], s.id);
  for (const cat of sample.categories)
    await ins("insert into categories (org_id, outlet_id, name, station_id, sort) values ($1,$2,$3,$4,$5) returning id", [orgId, outletId, cat.name, cat.stationId ? ids.get(cat.stationId) : null, cat.sort], cat.id);
  for (const g of sample.addonGroups) {
    await ins("insert into addon_groups (org_id, outlet_id, name, min_select, max_select) values ($1,$2,$3,$4,$5) returning id", [orgId, outletId, g.name, g.minSelect, g.maxSelect], g.id);
    for (const [i, a] of g.addons.entries())
      await ins("insert into addons (org_id, outlet_id, group_id, name, price_paise, sort) values ($1,$2,$3,$4,$5,$6) returning id", [orgId, outletId, ids.get(g.id), a.name, a.pricePaise, i], a.id);
  }
  for (const it of sample.items) {
    await ins(
      `insert into items (org_id, outlet_id, category_id, station_id, name, shortcode, food_type, price_paise, in_stock, sort)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
      [orgId, outletId, ids.get(it.categoryId), it.stationId ? ids.get(it.stationId) : null, it.name, it.shortcode, it.foodType, it.pricePaise, it.inStock, it.sort],
      it.id,
    );
    const itemId = ids.get(it.id);
    if (it.taxIds.length) for (const t of taxIds) await c.query("insert into item_taxes (item_id, tax_id, org_id) values ($1,$2,$3)", [itemId, t, orgId]);
    for (const [i, v] of it.variations.entries())
      await c.query("insert into variations (org_id, outlet_id, item_id, name, price_paise, sort) values ($1,$2,$3,$4,$5,$6)", [orgId, outletId, itemId, v.name, v.pricePaise, i]);
    for (const [i, g] of it.addonGroupIds.entries())
      await c.query("insert into item_addon_groups (item_id, group_id, org_id, sort) values ($1,$2,$3,$4)", [itemId, ids.get(g), orgId, i]);
  }
  for (const a of sample.areas) await ins("insert into areas (org_id, outlet_id, name, sort) values ($1,$2,$3,$4) returning id", [orgId, outletId, a.name, a.sort], a.id);
  for (const [i, t] of sample.tables.entries())
    await c.query("insert into tables (org_id, outlet_id, area_id, name, seats, sort) values ($1,$2,$3,$4,$5,$6)", [orgId, outletId, ids.get(t.areaId), t.name, t.seats, i]);
}

/** Demo staff for a sample restaurant: a cashier and a captain with known PINs. Dev/seed only. */
export async function addDemoStaff(orgId: string) {
  return tx(async (c) => {
    const roles = (await c.query("select id, name from roles where org_id = $1", [orgId])).rows as { id: string; name: string }[];
    const role = (n: string) => roles.find((r) => r.name === n)!.id;
    for (const [name, r, pin] of [["Ravi (Cashier)", "Cashier", "2222"], ["Imran (Captain)", "Captain", "3333"]] as const) {
      const s = await one<{ id: string }>(c, "insert into staff (org_id, role_id, name) values ($1,$2,$3) returning id", [orgId, role(r), name]);
      await c.query("insert into staff_secrets (staff_id, org_id, pin_hash) values ($1,$2,$3)", [s!.id, orgId, await hashPin(pin)]);
    }
  });
}
