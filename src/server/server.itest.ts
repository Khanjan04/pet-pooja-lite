import { createHmac } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import * as authRoute from "@/app/api/auth/[...all]/route";
import * as orgsRoute from "@/app/api/v1/orgs/route";
import * as pairThis from "@/app/api/v1/devices/pair-this/route";
import * as pairingCode from "@/app/api/v1/devices/pairing-code/route";
import * as pair from "@/app/api/v1/devices/pair/route";
import * as revoke from "@/app/api/v1/devices/[id]/revoke/route";
import * as staffLogin from "@/app/api/v1/staff/login/route";
import * as snapshot from "@/app/api/v1/pos/snapshot/route";
import * as command from "@/app/api/v1/pos/[command]/route";
import * as webhook from "@/app/api/webhooks/razorpay/route";
import * as cron from "@/app/api/cron/tick/route";
import * as billing from "@/app/api/v1/billing/checkout/route";
import { addDemoStaff } from "@/server/orgs";
import { asReader, pool } from "@/server/db";
import { Browser, lastEmailTo, linkIn } from "./test/helpers";

afterAll(async () => {
  await pool().end();
  (globalThis as { __kkPool?: unknown }).__kkPool = undefined;
});

let n = 0;
async function newRestaurant(opts: { regular?: boolean } = {}) {
  const email = `owner${++n}-${Date.now()}@example.test`;
  const b = new Browser();
  const up = await b.call(authRoute.POST, "/api/auth/sign-up/email", { body: { name: "Owner", email, password: "correct horse battery" } });
  expect(up.status).toBe(200);
  // Unverified users can't create a restaurant.
  expect((await b.call(orgsRoute.POST, "/api/v1/orgs", { body: {} })).status).toBe(401);
  const mail = await lastEmailTo(email);
  expect(mail.subject).toMatch(/Confirm your email/);
  const link = new URL(linkIn(mail.text));
  const verify = await b.call(authRoute.GET, link.pathname + link.search);
  expect([200, 302]).toContain(verify.status);
  const org = await b.call(orgsRoute.POST, "/api/v1/orgs", {
    body: {
      restaurantName: "Test Dhaba", outletName: "Main", stateCode: "24", gstScheme: opts.regular === false ? "unregistered" : "regular",
      gstin: opts.regular === false ? "" : "24ABCDE1234F1Z5", ownerName: "Owner", ownerPin: "1111", sampleMenu: true,
    },
  });
  expect(org.status, JSON.stringify(org.data)).toBe(201);
  const { orgId, outletId } = org.data;
  const paired = await b.call(pairThis.POST, "/api/v1/devices/pair-this", { body: { outletId } });
  expect(paired.status).toBe(201);
  const roster = await b.call(snapshot.GET, "/api/v1/pos/snapshot");
  expect(roster.data.items).toEqual([]); // no PIN session yet: roster only
  const owner = roster.data.staff.find((s: { name: string }) => s.name === "Owner");
  const login = await b.call(staffLogin.POST, "/api/v1/staff/login", { body: { staffId: owner.id, pin: "1111" } });
  expect(login.status).toBe(200);
  return { b, email, orgId, outletId, ownerStaffId: owner.id };
}

const snap = async (b: Browser) => (await b.call(snapshot.GET, "/api/v1/pos/snapshot")).data;
const cmd = (b: Browser, name: string, input: unknown, key?: string) =>
  b.call(command.POST, `/api/v1/pos/${name}`, { body: input, params: { command: name }, headers: key ? { "idempotency-key": key } : {} });

describe("signup to a settled bill", () => {
  it("runs the core loop on the real database with exact GST", async () => {
    const { b } = await newRestaurant();
    const s = await snap(b);
    expect(s.items.length).toBeGreaterThan(20);
    const byName = (n: string) => s.items.find((i: { name: string }) => i.name === n);
    const table = s.tables[0];
    const opened = await cmd(b, "openOrder", { type: "dine_in", tableId: table.id });
    expect(opened.status).toBe(200);
    const orderId = opened.data.result;
    expect((await cmd(b, "openOrder", { type: "dine_in", tableId: table.id })).data.result).toBe(orderId);

    const pt = byName("Paneer tikka");
    const hot = s.addonGroups.flatMap((g: { addons: { id: string; name: string }[] }) => g.addons).find((a: { name: string }) => a.name === "Hot");
    expect((await cmd(b, "addItem", { orderId, itemId: pt.id })).data.error).toMatch(/spice level/);
    await cmd(b, "addItem", { orderId, itemId: pt.id, addonIds: [hot.id], qty: 2 });
    await cmd(b, "addItem", { orderId, itemId: byName("Butter naan").id, qty: 3 });
    await cmd(b, "addItem", { orderId, itemId: byName("Butter naan").id });
    const fls = byName("Fresh lime soda");
    await cmd(b, "addItem", { orderId, itemId: fls.id, variationId: fls.variations[1].id });
    const kots = await cmd(b, "sendKot", { orderId });
    expect(kots.data.result).toHaveLength(3);
    expect((await cmd(b, "sendKot", { orderId })).data.error).toMatch(/Nothing new/);

    const billId = (await cmd(b, "printBill", { orderId })).data.result;
    const s2 = await snap(b);
    const bill = s2.bills.find((x: { id: string }) => x.id === billId);
    expect(bill).toMatchObject({ subtotalPaise: 81000, taxPaise: 4050, roundOffPaise: 50, totalPaise: 85100, billNo: 1, seriesCode: "T1" });
    expect(bill.taxLines.map((t: { amountPaise: number }) => t.amountPaise)).toEqual([2025, 2025]);

    // Retry with the same idempotency key: one payment, same answer.
    const p1 = await cmd(b, "addPayment", { billId, method: "upi", amountPaise: 50000 }, "pay-key-0001");
    const p1again = await cmd(b, "addPayment", { billId, method: "upi", amountPaise: 50000 }, "pay-key-0001");
    expect(p1.data.result).toBe("open");
    expect(p1again.data.result).toBe("open");
    expect((await cmd(b, "addPayment", { billId, method: "cash", amountPaise: 99999 })).data.error).toMatch(/more than/);
    expect((await cmd(b, "addPayment", { billId, method: "cash", amountPaise: 35100, tenderedPaise: 40000 })).data.result).toBe("settled");
    const s3 = await snap(b);
    expect(s3.payments.filter((p: { billId: string }) => p.billId === billId)).toHaveLength(2);
    expect(s3.orders.find((o: { id: string }) => o.id === orderId).status).toBe("settled");
    expect((await cmd(b, "openOrder", { type: "dine_in", tableId: table.id })).data.result).not.toBe(orderId);
  });

  it("voids after KOT with a reason and an audit entry", async () => {
    const { b } = await newRestaurant();
    const s = await snap(b);
    const dm = s.items.find((i: { name: string }) => i.name === "Dal makhani");
    const orderId = (await cmd(b, "openOrder", { type: "takeaway" })).data.result;
    const line = (await cmd(b, "addItem", { orderId, itemId: dm.id, qty: 2 })).data.result;
    await cmd(b, "sendKot", { orderId });
    expect((await cmd(b, "setQty", { orderItemId: line, qty: 1 })).data.error).toMatch(/Void it instead/);
    expect((await cmd(b, "voidItem", { orderItemId: line, qty: 1, reason: " " })).status).toBe(400);
    expect((await cmd(b, "voidItem", { orderItemId: line, qty: 1, reason: "Guest changed mind" })).status).toBe(200);
    const s2 = await snap(b);
    expect(s2.kots.find((k: { kind: string }) => k.kind === "void").lines[0].qty).toBe(-1);
    expect(s2.audit.some((a: { action: string; flagged: boolean }) => a.action === "kot.void" && a.flagged)).toBe(true);
    const billId = (await cmd(b, "printBill", { orderId })).data.result;
    expect((await snap(b)).bills.find((x: { id: string }) => x.id === billId).subtotalPaise).toBe(25000);
  });

  it("unregistered restaurants bill without GST", async () => {
    const { b } = await newRestaurant({ regular: false });
    const s = await snap(b);
    expect(s.taxes).toEqual([]);
    const orderId = (await cmd(b, "openOrder", { type: "takeaway" })).data.result;
    await cmd(b, "addItem", { orderId, itemId: s.items.find((i: { name: string }) => i.name === "Masala chai").id });
    await cmd(b, "sendKot", { orderId });
    const billId = (await cmd(b, "printBill", { orderId })).data.result;
    expect((await snap(b)).bills.find((x: { id: string }) => x.id === billId)).toMatchObject({ taxPaise: 0, totalPaise: 5000 });
  });
});

describe("rate limits", () => {
  it("allows only a few sign-ups per address", async () => {
    const b = new Browser();
    const codes: number[] = [];
    for (let i = 0; i < 4; i++) {
      const r = await b.call(authRoute.POST, "/api/auth/sign-up/email", { body: { name: "X", email: `rl${i}-${Date.now()}@example.test`, password: "correct horse battery" } });
      codes.push(r.status);
    }
    expect(codes.slice(0, 3)).toEqual([200, 200, 200]);
    expect(codes[3]).toBe(429);
  });

  it("refuses cross-site writes", async () => {
    const b = new Browser();
    const r = await b.call(pair.POST, "/api/v1/devices/pair", { body: { code: "123456" }, headers: { origin: "https://evil.example" } });
    expect(r.status).toBe(403);
  });

  it("limits pairing-code guesses per address", async () => {
    const b = new Browser();
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) codes.push((await b.call(pair.POST, "/api/v1/devices/pair", { body: { code: String(100000 + i) } })).status);
    expect(codes.slice(0, 10).every((c) => c === 401)).toBe(true);
    expect(codes[10]).toBe(429);
  });
});

describe("permissions and sessions", () => {
  it("captains can't void or reprint; commands need a PIN session", async () => {
    const { b, orgId } = await newRestaurant();
    await addDemoStaff(orgId);
    const s = await snap(b);
    const captain = s.staff.find((x: { name: string }) => x.name.includes("Captain"));
    expect((await b.call(staffLogin.POST, "/api/v1/staff/login", { body: { staffId: captain.id, pin: "3333" } })).status).toBe(200);
    const orderId = (await cmd(b, "openOrder", { type: "takeaway" })).data.result;
    const line = (await cmd(b, "addItem", { orderId, itemId: s.items.find((i: { name: string }) => i.name === "Masala chai").id })).data.result;
    await cmd(b, "sendKot", { orderId });
    expect((await cmd(b, "voidItem", { orderItemId: line, qty: 1, reason: "x" })).status).toBe(403);
    expect((await cmd(b, "printBill", { orderId })).status).toBe(200);
    expect((await cmd(b, "printBill", { orderId })).status).toBe(403);
    b.cookies.delete("kk_staff");
    expect((await cmd(b, "openOrder", { type: "takeaway" })).data.code).toBe("pin_required");
  });

  it("locks a PIN after 5 wrong tries", async () => {
    const { b, ownerStaffId } = await newRestaurant();
    for (let i = 1; i <= 4; i++) {
      const r = await b.call(staffLogin.POST, "/api/v1/staff/login", { body: { staffId: ownerStaffId, pin: "0000" } });
      expect(r.data.error).toMatch(new RegExp(`${5 - i} tr`));
    }
    expect((await b.call(staffLogin.POST, "/api/v1/staff/login", { body: { staffId: ownerStaffId, pin: "0000" } })).status).toBe(423);
    expect((await b.call(staffLogin.POST, "/api/v1/staff/login", { body: { staffId: ownerStaffId, pin: "1111" } })).status).toBe(423);
  });

  it("pairs a second till by code, gives it series T2, and revokes it", async () => {
    const { b, outletId } = await newRestaurant();
    const code = (await b.call(pairingCode.POST, "/api/v1/devices/pairing-code", { body: { outletId, kind: "pos", name: "Bar till" } })).data.code;
    const till2 = new Browser();
    expect((await till2.call(pair.POST, "/api/v1/devices/pair", { body: { code: "000000" } })).status).toBe(401);
    const paired = await till2.call(pair.POST, "/api/v1/devices/pair", { body: { code } });
    expect(paired.data.device.seriesCode).toBe("T2");
    expect((await till2.call(pair.POST, "/api/v1/devices/pair", { body: { code } })).status).toBe(401); // single use
    expect((await till2.call(snapshot.GET, "/api/v1/pos/snapshot")).status).toBe(200);
    await b.call(revoke.POST, `/api/v1/devices/${paired.data.device.id}/revoke`, { body: {}, params: { id: paired.data.device.id } });
    expect((await till2.call(snapshot.GET, "/api/v1/pos/snapshot")).data.code).toBe("device_required");
  });
});

describe("concurrency", () => {
  it("BUG-001: two simultaneous 'create restaurant' requests make one restaurant", async () => {
    const email = `race-${Date.now()}@example.test`;
    const b = new Browser();
    await b.call(authRoute.POST, "/api/auth/sign-up/email", { body: { name: "Racer", email, password: "correct horse battery" } });
    const link = new URL(linkIn((await lastEmailTo(email)).text));
    await b.call(authRoute.GET, link.pathname + link.search);
    const body = { restaurantName: "Twice", outletName: "Main", stateCode: "24", gstScheme: "unregistered", gstin: "", ownerName: "R", ownerPin: "1111", sampleMenu: false };
    const [r1, r2] = await Promise.all([b.call(orgsRoute.POST, "/api/v1/orgs", { body }), b.call(orgsRoute.POST, "/api/v1/orgs", { body })]);
    expect([r1.status, r2.status].sort()).toEqual([201, 409]);
    const n = await pool().query('select count(*)::int as n from org_members m join "user" u on u.id = m.user_id where u.email = $1', [email]);
    expect(n.rows[0].n).toBe(1);
  });

  it("two tills seating the same table get the same order; parallel bills get distinct numbers", async () => {
    const { b, outletId } = await newRestaurant();
    const code = (await b.call(pairingCode.POST, "/api/v1/devices/pairing-code", { body: { outletId, kind: "pos", name: "Till 2" } })).data.code;
    const t2 = new Browser();
    await t2.call(pair.POST, "/api/v1/devices/pair", { body: { code } });
    const s = await snap(b);
    await t2.call(staffLogin.POST, "/api/v1/staff/login", { body: { staffId: s.staff[0].id, pin: "1111" } });
    const table = s.tables[3];
    const [a, c] = await Promise.all([cmd(b, "openOrder", { type: "dine_in", tableId: table.id }), cmd(t2, "openOrder", { type: "dine_in", tableId: table.id })]);
    expect(a.data.result).toBe(c.data.result);

    const chai = s.items.find((i: { name: string }) => i.name === "Masala chai").id;
    const orders: string[] = [];
    for (const t of [b, b, b, t2, t2, t2]) {
      const id = (await cmd(t, "openOrder", { type: "takeaway" })).data.result;
      await cmd(t, "addItem", { orderId: id, itemId: chai });
      await cmd(t, "sendKot", { orderId: id });
      orders.push(id);
    }
    const bills = await Promise.all(orders.map((id, i) => cmd(i < 3 ? b : t2, "printBill", { orderId: id })));
    expect(bills.every((r) => r.status === 200)).toBe(true);
    const s2 = await snap(b);
    const nums = s2.bills.map((x: { seriesCode: string; billNo: number }) => `${x.seriesCode}/${x.billNo}`).sort();
    expect(nums).toEqual(["T1/1", "T1/2", "T1/3", "T2/1", "T2/2", "T2/3"]);
  });
});

describe("tenant isolation (row level security)", () => {
  it("a second restaurant sees nothing of the first", async () => {
    const A = await newRestaurant();
    const B = await newRestaurant();
    const orderA = (await cmd(A.b, "openOrder", { type: "takeaway" })).data.result;
    // B's member asking for A's outlet is refused before any query.
    const asMember = await B.b.call(snapshot.GET, `/api/v1/pos/snapshot?as-member=1&outlet=${A.outletId}`);
    expect(asMember.status).toBe(403);
    // Even a direct query under B's claims returns none of A's rows.
    const rows = await asReader({ org_id: B.orgId, outlet_ids: [B.outletId], all_outlets: false }, async (c) => ({
      orders: (await c.query("select id from orders where id = $1", [orderA])).rowCount,
      outlets: (await c.query("select id from outlets where id = $1", [A.outletId])).rowCount,
      items: (await c.query("select id from items where outlet_id = $1", [A.outletId])).rowCount,
      staff: (await c.query("select id from staff where org_id = $1", [A.orgId])).rowCount,
    }));
    expect(rows).toEqual({ orders: 0, outlets: 0, items: 0, staff: 0 });
    // And B's till can't touch A's order.
    expect((await cmd(B.b, "addItem", { orderId: orderA, itemId: (await snap(B.b)).items[0].id })).status).toBe(404);
    // app_reader can't read auth tables at all.
    await expect(asReader({ org_id: B.orgId, outlet_ids: [], all_outlets: false }, (c) => c.query('select * from "user"'))).rejects.toThrow(/permission denied/);
  });
});

describe("payments (Razorpay webhooks) and jobs", () => {
  const sign = (raw: string) => createHmac("sha256", "whsec_test_only").update(raw).digest("hex");
  const hook = (b: Browser, raw: string, id: string, sig = sign(raw)) =>
    b.call(webhook.POST, "/api/webhooks/razorpay", { method: "POST", headers: { "content-type": "application/json", "x-razorpay-signature": sig, "x-razorpay-event-id": id }, body: JSON.parse(raw) });

  it("checkout says clearly when keys are missing", async () => {
    const { b } = await newRestaurant();
    const r = await b.call(billing.POST, "/api/v1/billing/checkout", { body: { plan: "core" } });
    expect(r.status).toBe(503);
    expect(r.data.code).toBe("payments_off");
  });

  it("verifies signatures, applies events once and in order", async () => {
    const { orgId } = await newRestaurant();
    await pool().query("insert into subscriptions (org_id, provider, provider_subscription_id, plan, status) values ($1, 'razorpay', 'sub_TEST1', 'core', 'incomplete')", [orgId]);
    const evt = (status: string, at: number) => JSON.stringify({ event: `subscription.${status}`, created_at: at, payload: { subscription: { entity: { id: "sub_TEST1", status, current_end: 1893456000, quantity: 1 } } } });
    const x = new Browser();
    expect((await hook(x, evt("activated", 1000), "evt_1", "bad")).status).toBe(401);
    // Body re-serialised by the helper must match what we signed.
    const active = JSON.stringify(JSON.parse(evt("active", 1000)));
    expect((await hook(x, active, "evt_1")).data.result).toBe("applied");
    expect((await hook(x, active, "evt_1")).data.result).toBe("duplicate");
    const status = async () => (await pool().query("select o.status as org, s.status as sub from organizations o join subscriptions s on s.org_id = o.id where o.id = $1", [orgId])).rows[0];
    expect(await status()).toEqual({ org: "active", sub: "active" });
    const halted = JSON.stringify(JSON.parse(evt("halted", 3000)));
    expect((await hook(x, halted, "evt_3")).data.result).toBe("applied");
    const lateActive = JSON.stringify(JSON.parse(evt("active", 2000)));
    expect((await hook(x, lateActive, "evt_2")).data.result).toBe("stale");
    expect(await status()).toEqual({ org: "past_due", sub: "past_due" });
    // The failed-payment email job was queued for the owner.
    expect((await pool().query("select 1 from jobs where kind = 'billing.payment_failed' and payload->>'orgId' = $1", [orgId])).rowCount).toBe(1);
  });

  it("BUG-003: cron closes orders left empty for 2 hours and frees their table", async () => {
    const { b } = await newRestaurant();
    const s = await snap(b);
    const empty = (await cmd(b, "openOrder", { type: "dine_in", tableId: s.tables[5].id })).data.result;
    const used = (await cmd(b, "openOrder", { type: "takeaway" })).data.result;
    await cmd(b, "addItem", { orderId: used, itemId: s.items[0].id });
    await pool().query("update orders set created_at = now() - interval '3 hours' where id = any($1::uuid[])", [[empty, used]]);
    const x = new Browser();
    await x.call(cron.GET, "/api/cron/tick", { headers: { authorization: "Bearer cron-secret-for-tests-only-123456" } });
    const st = (await pool().query("select id, status from orders where id = any($1::uuid[])", [[empty, used]])).rows;
    expect(st.find((r) => r.id === empty).status).toBe("cancelled");
    expect(st.find((r) => r.id === used).status).toBe("open");
    expect((await cmd(b, "openOrder", { type: "dine_in", tableId: s.tables[5].id })).data.result).not.toBe(empty);
  });

  it("cron needs its secret and runs due jobs with retries", async () => {
    const x = new Browser();
    expect((await x.call(cron.GET, "/api/cron/tick")).status).toBe(401);
    await pool().query("insert into jobs (kind, payload, max_attempts) values ('does.not.exist', '{}', 2)");
    const ok = await x.call(cron.GET, "/api/cron/tick", { headers: { authorization: "Bearer cron-secret-for-tests-only-123456" } });
    expect(ok.status).toBe(200);
    const j = (await pool().query("select status, attempts, last_error from jobs where kind = 'does.not.exist'")).rows[0];
    expect(j).toMatchObject({ status: "queued", attempts: 1 });
    expect(j.last_error).toMatch(/no handler/);
    await pool().query("update jobs set run_at = now() where kind = 'does.not.exist'");
    await x.call(cron.GET, "/api/cron/tick", { headers: { authorization: "Bearer cron-secret-for-tests-only-123456" } });
    expect((await pool().query("select status from jobs where kind = 'does.not.exist'")).rows[0].status).toBe("dead");
  });
});

describe("account deletion", () => {
  it("removes the person, closes their restaurant, erases customers, keeps bills", async () => {
    const { b, orgId, email } = await newRestaurant();
    const s = await snap(b);
    const orderId = (await cmd(b, "openOrder", { type: "takeaway" })).data.result;
    await cmd(b, "addItem", { orderId, itemId: s.items.find((i: { name: string }) => i.name === "Masala chai").id });
    await cmd(b, "sendKot", { orderId });
    await cmd(b, "printBill", { orderId });
    await pool().query("insert into customers (org_id, phone, name) values ($1, '+919999999999', 'A Guest')", [orgId]);
    const del = await b.call(authRoute.POST, "/api/auth/delete-user", { body: { password: "correct horse battery" } });
    expect(del.status, JSON.stringify(del.data)).toBe(200);
    const q = (sql: string) => pool().query(sql, [orgId]).then((r) => r.rows);
    expect(await pool().query('select 1 from "user" where email = $1', [email]).then((r) => r.rowCount)).toBe(0);
    expect((await q("select status from organizations where id = $1"))[0].status).toBe("cancelled");
    expect((await q("select name, phone from customers where org_id = $1"))[0]).toMatchObject({ name: null });
    expect((await q("select count(*)::int as n from bills where org_id = $1"))[0].n).toBe(1);
    expect((await b.call(snapshot.GET, "/api/v1/pos/snapshot")).data.code).toBe("device_required");
  });
});
