// F02 Dine-in order, fired to the kitchen, billed and settled. Plus F08-adjacent table rules.
import { a11y, addByShortcode, count, db, expect, noHorizontalScroll, openTable, pinLogin, post, test } from "./fixtures";

test.describe("F02 dine-in core loop", () => {
  test("F02-H1 order → KOT per station → bill with GST → split payment → table free @mobile", async ({ page, owner, problems }) => {
    void problems;
    const o = await owner();
    await pinLogin(page, /Asha Patel/, o.pin);
    await a11y(page);
    const aside = await openTable(page, "M2");
    await addByShortcode(page, "DM");
    await addByShortcode(page, "BN", 2);
    await expect(aside.getByText("Butter naan")).toHaveCount(1);
    await a11y(page);
    await noHorizontalScroll(page);
    await aside.getByRole("button", { name: "Send to kitchen" }).click();
    await expect(aside.getByRole("status").filter({ hasText: "Sent to" })).toContainText(/Kitchen.*Tandoor|Tandoor.*Kitchen/);
    await aside.getByRole("button", { name: "Print bill" }).click();
    // 250 + 120 = 370; GST 18.50; 388.50 → 389 (round off +0.50)
    await expect(aside.locator("dd").last()).toHaveText("₹389.00");
    await aside.getByRole("button", { name: /^Settle/ }).click();
    const d = page.getByRole("dialog");
    await d.getByRole("radio", { name: /Card/ }).click();
    await d.getByRole("textbox", { name: "Amount", exact: true }).fill("89");
    await d.getByRole("button", { name: /^Take/ }).click();
    await expect(d.getByText("Card ₹89.00")).toBeVisible();
    await d.getByRole("radio", { name: /Cash/ }).click();
    await d.getByRole("button", { name: /^Take/ }).click();
    await expect(aside.getByText("Paid in full")).toBeVisible();
    await page.goto("/pos");
    await expect(page.getByRole("button", { name: /^Table M2, Free/ })).toBeVisible();
  });

  test("F02-E1 double-click Send to kitchen sends once, no error", async ({ page, owner, problems }) => {
    void problems;
    const o = await owner();
    await pinLogin(page, /Asha Patel/, o.pin);
    const aside = await openTable(page, "M3");
    await addByShortcode(page, "CH");
    await aside.getByRole("button", { name: "Send to kitchen" }).dblclick();
    await expect(aside.getByRole("button", { name: "Print bill" })).toBeVisible();
    await page.waitForTimeout(500);
    await expect(aside.getByRole("alert")).toHaveCount(0);
    expect(await count("select count(*) as n from kots k join orders o on o.id = k.order_id where o.org_id = $1", [o.orgId])).toBe(1);
  });

  test("F02-E2 double-click Take payment records one payment", async ({ page, owner, problems }) => {
    void problems;
    const o = await owner();
    await pinLogin(page, /Asha Patel/, o.pin);
    const aside = await openTable(page, "M4");
    await addByShortcode(page, "CH");
    await aside.getByRole("button", { name: "Send to kitchen" }).click();
    await aside.getByRole("button", { name: "Print bill" }).click();
    await aside.getByRole("button", { name: /^Settle/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: /^Take/ }).dblclick();
    await expect(aside.getByText("Paid in full")).toBeVisible();
    expect(await count("select count(*) as n from payments where org_id = $1", [o.orgId])).toBe(1);
  });

  test("F02-E3 two tabs on one till: the second sees the table busy and shares the order", async ({ page, owner, problems }) => {
    void problems;
    const o = await owner();
    await pinLogin(page, /Asha Patel/, o.pin);
    const tab2 = await page.context().newPage();
    await tab2.goto("/pos");
    const aside = await openTable(page, "A1");
    await addByShortcode(page, "CH");
    await expect(tab2.getByRole("button", { name: /^Table A1, Seated/ })).toBeVisible();
    await tab2.getByRole("button", { name: /^Table A1/ }).click();
    await expect(tab2.getByRole("complementary", { name: "Current order" }).getByText("Masala chai")).toBeVisible();
    void aside;
  });

  test("F02-E4 refresh and back button mid-order keep the order", async ({ page, owner, problems }) => {
    void problems;
    const o = await owner();
    await pinLogin(page, /Asha Patel/, o.pin);
    const aside = await openTable(page, "A2");
    await addByShortcode(page, "PT".toLowerCase() === "pt" ? "MP" : "MP");
    await expect(aside.getByText("Masala papad")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("complementary", { name: "Current order" }).getByText("Masala papad")).toBeVisible();
    await page.goBack();
    await page.goto("/pos");
    await expect(page.getByRole("button", { name: /^Table A2, Seated/ })).toBeVisible();
  });

  test("F02-E5 note with emoji and a very long note", async ({ page, owner, problems }) => {
    void problems;
    const o = await owner();
    await pinLogin(page, /Asha Patel/, o.pin);
    const aside = await openTable(page, "A3");
    await page.getByRole("tab", { name: /Starters/ }).locator("visible=true").click();
    await page.getByRole("button", { name: /^Chilli paneer,/ }).click();
    const dlg = page.getByRole("dialog");
    await dlg.getByText("Medium", { exact: true }).click();
    const note = "🌶️ Jain, no onion no garlic, please! " + "very ".repeat(30);
    await dlg.getByLabel("Note for the kitchen").fill(note);
    await expect(dlg.getByLabel("Note for the kitchen")).toHaveValue(note.slice(0, 120));
    await dlg.getByRole("button", { name: /^Add/ }).click();
    await expect(aside.getByText(/Jain, no onion/)).toBeVisible();
    await noHorizontalScroll(page);
  });

  test("F02-E8 offline: banner shows, a tap fails loudly (nothing silently lost), recovers online", async ({ page, owner, problems }) => {
    void problems;
    const o = await owner();
    await pinLogin(page, /Asha Patel/, o.pin);
    const aside = await openTable(page, "T3");
    await page.context().setOffline(true);
    await expect(page.getByRole("status").filter({ hasText: "Offline" })).toBeVisible();
    await addByShortcode(page, "CH");
    await expect(aside.getByRole("alert")).toContainText(/Can’t reach the server/, { timeout: 10_000 });
    expect(await count("select count(*) as n from order_items where org_id = $1", [o.orgId])).toBe(0);
    await page.context().setOffline(false);
    await expect(page.getByRole("status").filter({ hasText: "Offline" })).toHaveCount(0);
    await addByShortcode(page, "CH");
    await expect(aside.getByText("Masala chai")).toBeVisible();
  });

  test("F02-N1 sold-out items can't be added", async ({ page, owner, problems }) => {
    void problems;
    const o = await owner();
    await pinLogin(page, /Asha Patel/, o.pin);
    await openTable(page, "A4");
    await page.getByRole("tab", { name: /Tandoor/ }).locator("visible=true").click();
    const fish = page.getByRole("button", { name: /^Fish tikka,.*sold out/ });
    await expect(fish).toHaveAttribute("aria-disabled", "true");
    await fish.click({ force: true });
    await expect(page.getByRole("complementary", { name: "Current order" }).getByText("Fish tikka")).toHaveCount(0);
  });

  test("F02-N2 void after KOT needs a reason; captain sees no void button", async ({ page, owner, problems }) => {
    void problems;
    const o = await owner();
    await pinLogin(page, /Asha Patel/, o.pin);
    const aside = await openTable(page, "A5");
    await addByShortcode(page, "DM");
    await aside.getByRole("button", { name: "Send to kitchen" }).click();
    await aside.getByRole("button", { name: "Void Dal makhani" }).click();
    const dlg = page.getByRole("dialog");
    await expect(dlg.getByRole("button", { name: "Void 1" })).toBeDisabled();
    await dlg.getByText("Wrong item").click();
    await dlg.getByRole("button", { name: "Void 1" }).click();
    await expect(aside.getByText(/Void · Wrong item/)).toBeVisible();
    // A captain on the same till
    await db.query("insert into staff (org_id, role_id, name) select org_id, id, 'Imran Captain' from roles where org_id = $1 and name = 'Captain'", [o.orgId]);
    const sid = (await db.query("select id from staff where org_id = $1 and name = 'Imran Captain'", [o.orgId])).rows[0].id;
    const ownerHash = (await db.query("select pin_hash from staff_secrets ss join staff s on s.id = ss.staff_id where s.org_id = $1 and s.name = 'Asha Patel'", [o.orgId])).rows[0].pin_hash;
    await db.query("insert into staff_secrets (staff_id, org_id, pin_hash) values ($1, $2, $3)", [sid, o.orgId, ownerHash]);
    await page.getByRole("button", { name: "Switch user" }).click();
    await page.waitForURL("**/pos/login");
    await pinLogin(page, /Imran Captain/, o.pin);
    const a2 = await openTable(page, "A6");
    await addByShortcode(page, "CH");
    await a2.getByRole("button", { name: "Send to kitchen" }).click();
    await expect(a2.getByRole("button", { name: /^Void/ })).toHaveCount(0);
  });

  test("F02-N3 PIN session ended elsewhere: the next action sends you back to the PIN screen", async ({ page, owner, problems }) => {
    void problems;
    const o = await owner();
    await pinLogin(page, /Asha Patel/, o.pin);
    const aside = await openTable(page, "T1");
    await db.query("update staff_sessions set ended_at = now() where org_id = $1", [o.orgId]);
    // Any next action (or the app noticing first) must land on the PIN screen, not a dead end.
    await addByShortcode(page, "CH").catch(() => {});
    await page.waitForURL("**/pos/login", { timeout: 7000 });
    await expect(page.getByRole("heading", { name: "Who’s on the till?" })).toBeVisible();
    void aside;
  });

  test("F02-N4 another restaurant's order and bill links show nothing", async ({ page, owner, browser, problems }) => {
    void problems;
    const a = await owner();
    await pinLogin(page, /Asha Patel/, a.pin);
    const aside = await openTable(page, "T2");
    await addByShortcode(page, "CH");
    await aside.getByRole("button", { name: "Send to kitchen" }).click();
    await aside.getByRole("button", { name: "Print bill" }).click();
    const orderUrl = page.url();
    const billHref = await aside.getByRole("link", { name: "Open the bill to print" }).getAttribute("href");
    // Restaurant B on a different browser
    const ctxB = await browser.newContext({ baseURL: new URL(orderUrl).origin, extraHTTPHeaders: { "x-forwarded-for": "10.200.1.9" } });
    const pB = await ctxB.newPage();
    const email = `f02b-${Date.now()}@example.test`;
    await post(pB.request, "/api/auth/sign-up/email", { name: "Bea", email, password: "a long enough password", callbackURL: "/onboarding" });
    const { emailLink } = await import("./fixtures");
    await pB.goto(await emailLink(email));
    const r = await post(pB.request, "/api/v1/orgs", { restaurantName: "Bea’s Place", outletName: "Main", stateCode: "24", gstScheme: "unregistered", gstin: "", ownerName: "Bea", ownerPin: "2222", sampleMenu: true });
    await post(pB.request, "/api/v1/devices/pair-this", { outletId: (await r.json()).outletId });
    await pinLogin(pB, /Bea/, "2222");
    await pB.goto(orderUrl.replace(/^https?:\/\/[^/]+/, ""));
    await expect(pB.getByText("Order not found")).toBeVisible();
    await pB.goto(billHref!);
    await expect(pB.getByText("Nothing to print")).toBeVisible();
    await ctxB.close();
  });
});
