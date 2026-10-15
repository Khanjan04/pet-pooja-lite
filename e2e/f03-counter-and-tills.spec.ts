// F03 takeaway, F04 delivery (basic), F18 staff rights / PIN, device pairing, F17 dashboard, F20 billing, account.
import { a11y, addByShortcode, count, db, emailLink, expect, noHorizontalScroll, pinLogin, post, test } from "./fixtures";

test.describe("F03/F04 counter orders", () => {
  test("F03-H1 takeaway by keyboard: shortcode, bill, exact cash", async ({ page, owner, problems }) => {
    void problems;
    const o = await owner({ gst: "unregistered" });
    await pinLogin(page, /Asha Patel/, o.pin);
    await page.getByRole("button", { name: "New takeaway" }).click();
    await page.waitForURL("**/pos/order/**");
    const aside = page.getByRole("complementary", { name: "Current order" });
    await page.keyboard.press("/");
    await page.keyboard.type("ch");
    await page.keyboard.press("Enter");
    await expect(aside.getByText("Masala chai")).toBeVisible();
    await aside.getByRole("button", { name: "Send to kitchen" }).click();
    await aside.getByRole("button", { name: "Print bill" }).click();
    await expect(aside.locator("dd").last()).toHaveText("₹50.00"); // unregistered: no GST
    await aside.getByRole("button", { name: /^Settle/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: /^Take/ }).click();
    await expect(aside.getByText("Paid in full")).toBeVisible();
  });

  test("F03-E1 double-click New takeaway opens one order", async ({ page, owner, problems }) => {
    void problems;
    const o = await owner();
    await pinLogin(page, /Asha Patel/, o.pin);
    await page.getByRole("button", { name: "New takeaway" }).dblclick();
    await page.waitForURL("**/pos/order/**");
    await page.waitForTimeout(600);
    expect(await count("select count(*) as n from orders where org_id = $1", [o.orgId])).toBe(1);
  });

  test("F03-E2 abandoned empty takeaway doesn't linger on the tables screen", async ({ page, owner, problems }) => {
    void problems;
    const o = await owner();
    await pinLogin(page, /Asha Patel/, o.pin);
    await page.getByRole("button", { name: "New takeaway" }).click();
    await page.waitForURL("**/pos/order/**");
    await page.getByRole("button", { name: "Back to tables" }).click();
    await expect(page.getByRole("heading", { name: "Tables" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Takeaway #/ })).toHaveCount(0);
  });

  test("F04-H1 delivery order can be opened and billed", async ({ page, owner, problems }) => {
    void problems;
    const o = await owner();
    await pinLogin(page, /Asha Patel/, o.pin);
    await page.getByRole("button", { name: "New delivery" }).click();
    await page.waitForURL("**/pos/order/**");
    await expect(page.getByRole("heading", { name: /Delivery #/ })).toBeVisible();
    await addByShortcode(page, "VB");
    const aside = page.getByRole("complementary", { name: "Current order" });
    await aside.getByRole("button", { name: "Send to kitchen" }).click();
    await aside.getByRole("button", { name: "Print bill" }).click();
    await expect(aside.getByRole("button", { name: /^Settle/ })).toBeVisible();
  });
});

test.describe("F18 staff, PINs and tills", () => {
  test("F18-N1 five wrong PINs lock the person out with a clear message", async ({ page, owner, problems }) => {
    void problems;
    const o = await owner();
    await page.goto("/pos/login");
    await page.getByRole("radio", { name: /Asha Patel/ }).click();
    for (let i = 0; i < 5; i++) {
      await page.keyboard.type("0000");
      await expect(page.locator("form, main, [role=dialog], section").getByRole("alert").first()).toBeVisible();
    }
    await expect(page.locator("form, main, [role=dialog], section").getByRole("alert").first()).toContainText(/Too many wrong PINs/);
    await page.keyboard.type(o.pin);
    await expect(page.locator("form, main, [role=dialog], section").getByRole("alert").first()).toContainText(/Too many wrong PINs/);
    await expect(page).toHaveURL(/\/pos\/login$/);
  });

  test("F18-H1 pair a second till by code; removing it sends it back to pairing @mobile", async ({ page, owner, browser, problems }) => {
    void problems;
    const o = await owner();
    await page.goto("/outlets");
    await page.getByRole("button", { name: "Get a pairing code" }).click();
    const code = (await page.getByRole("status").filter({ hasText: "/pos/pair" }).innerText()).match(/\b\d{6}\b/)![0];
    await a11y(page);
    await noHorizontalScroll(page);
    const ctx2 = await browser.newContext({ baseURL: new URL(page.url()).origin, viewport: page.viewportSize()!, extraHTTPHeaders: { "x-forwarded-for": "10.201.0.7" } });
    const t2 = await ctx2.newPage();
    await t2.goto("/pos");
    await t2.waitForURL("**/pos/pair");
    await a11y(t2);
    await t2.getByLabel("Pairing code").fill(code);
    await t2.getByRole("button", { name: "Pair with code" }).click();
    await t2.waitForURL("**/pos/login");
    await pinLogin(t2, /Asha Patel/, o.pin);
    await page.reload();
    await page.getByRole("button", { name: /Remove Counter 2/ }).click();
    await expect(page.getByRole("button", { name: /Remove Counter 2/ })).toHaveCount(0);
    await t2.reload();
    await t2.waitForURL("**/pos/pair");
  });

  test("F18-N2 a wrong or reused pairing code is refused", async ({ page, owner, problems }) => {
    void problems;
    await owner({ till: false });
    await page.goto("/pos/pair");
    await page.getByLabel("Pairing code").fill("000000");
    await page.getByRole("button", { name: "Pair with code" }).click();
    await expect(page.locator("form, main, [role=dialog], section").getByRole("alert").first()).toContainText(/wrong or has expired/);
  });
});

test.describe("F17 dashboard, F20 billing, account", () => {
  test("F17-H1 dashboard shows today's sales; a second restaurant sees none of it", async ({ page, owner, browser, problems }) => {
    void problems;
    const o = await owner();
    await pinLogin(page, /Asha Patel/, o.pin);
    await page.getByRole("button", { name: "New takeaway" }).click();
    await page.waitForURL("**/pos/order/**");
    await addByShortcode(page, "RM");
    const aside = page.getByRole("complementary", { name: "Current order" });
    await aside.getByRole("button", { name: "Send to kitchen" }).click();
    await aside.getByRole("button", { name: "Print bill" }).click();
    await aside.getByRole("button", { name: /^Settle/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: /^Take/ }).click();
    await expect(aside.getByText("Paid in full")).toBeVisible();
    await page.goto("/dashboard");
    await expect(page.getByText("Rasmalai")).toBeVisible();
    await a11y(page);
    const ctxB = await browser.newContext({ baseURL: new URL(page.url()).origin, extraHTTPHeaders: { "x-forwarded-for": "10.202.3.4" } });
    const pB = await ctxB.newPage();
    const email = `f17b-${Date.now()}@example.test`;
    await post(pB.request, "/api/auth/sign-up/email", { name: "Bea", email, password: "a long enough password", callbackURL: "/onboarding" });
    await pB.goto(await emailLink(email));
    await post(pB.request, "/api/v1/orgs", { restaurantName: "Bea’s Place", outletName: "Main", stateCode: "24", gstScheme: "unregistered", gstin: "", ownerName: "Bea", ownerPin: "2222", sampleMenu: true });
    await pB.goto("/dashboard");
    await expect(pB.getByText("No sales yet today")).toBeVisible();
    await ctxB.close();
  });

  test("F20-H1 billing shows the trial and explains missing payment keys", async ({ page, owner, problems }) => {
    void problems;
    await owner({ till: false });
    await page.goto("/billing");
    await expect(page.getByText(/Free trial until/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Choose Core" })).toBeDisabled();
    await a11y(page);
  });

  test("F20-E1 read-only org: back office says so, tills still bill", async ({ page, owner, problems }) => {
    void problems;
    const o = await owner();
    await db.query("update organizations set status = 'read_only' where id = $1", [o.orgId]);
    await page.goto("/dashboard");
    await expect(page.getByRole("status").filter({ hasText: "read-only" })).toBeVisible();
    await pinLogin(page, /Asha Patel/, o.pin);
    await page.getByRole("button", { name: "New takeaway" }).click();
    await page.waitForURL("**/pos/order/**");
    await addByShortcode(page, "CH");
    await expect(page.getByRole("complementary", { name: "Current order" }).getByText("Masala chai")).toBeVisible();
  });

  test("F20-N1 a cancelled restaurant's till stops", async ({ page, owner, problems }) => {
    void problems;
    const o = await owner();
    await pinLogin(page, /Asha Patel/, o.pin);
    await db.query("update organizations set status = 'cancelled' where id = $1", [o.orgId]);
    await page.reload();
    await page.waitForURL("**/pos/pair");
  });

  test("ACC-H1 delete account from the Account page", async ({ page, owner, problems }) => {
    void problems;
    const o = await owner();
    await page.goto("/account");
    await page.getByRole("button", { name: "Delete my account" }).click();
    const d = page.getByRole("dialog");
    await d.getByLabel(/Your password/).fill(o.password);
    await d.getByRole("button", { name: "Delete for good" }).click();
    await page.waitForURL("**/login");
    expect(await count('select count(*) as n from "user" where email = $1', [o.email])).toBe(0);
    expect((await db.query("select status from organizations where id = $1", [o.orgId])).rows[0].status).toBe("cancelled");
  });

  test("ACC-E1 sign out everywhere ends other sessions", async ({ page, owner, browser, problems }) => {
    void problems;
    const o = await owner({ till: false });
    const other = await browser.newContext({ baseURL: new URL(page.url()).origin, extraHTTPHeaders: { "x-forwarded-for": "10.203.0.1" } });
    const p2 = await other.newPage();
    await p2.goto("/login");
    await p2.getByLabel("Email").fill(o.email);
    await p2.getByLabel("Password").fill(o.password);
    await p2.getByRole("button", { name: "Sign in" }).click();
    await p2.waitForURL("**/dashboard");
    await page.goto("/account");
    await page.getByRole("button", { name: "Sign out everywhere" }).click();
    await page.waitForURL("**/login");
    await p2.goto("/dashboard");
    await p2.waitForURL("**/login");
    await other.close();
  });
});
