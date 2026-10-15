// F01 New restaurant signs up and is ready to bill.
import { a11y, count, db, emailLink, expect, noHorizontalScroll, post, test } from "./fixtures";

const uniq = () => `f01-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.test`;

async function signUpUi(page: import("@playwright/test").Page, email: string, name = "Asha Patel") {
  await page.goto("/login");
  await page.getByRole("radio", { name: "New account" }).click();
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("a long enough password");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
}

async function onboardUi(page: import("@playwright/test").Page, restaurant = "Khana Test Kitchen") {
  await page.getByLabel("Restaurant name").fill(restaurant);
  await page.getByLabel(/^State/).selectOption({ label: "Gujarat" });
  await page.getByLabel(/^GSTIN/).fill("24abcde1234f1z5");
  await page.getByLabel(/^Your till PIN/).fill("1111");
}

test.describe("F01 sign up and onboarding", () => {
  test("F01-H1 sign up → verify → onboard → first bill-ready till @mobile", async ({ page, problems }) => {
    void problems;
    const email = uniq();
    await page.goto("/dashboard");
    await page.waitForURL("**/login");
    await a11y(page);
    await noHorizontalScroll(page);
    await signUpUi(page, email);
    await page.goto(await emailLink(email));
    await page.waitForURL("**/onboarding");
    await a11y(page);
    await onboardUi(page);
    await expect(page.getByLabel(/^GSTIN/)).toHaveValue("24ABCDE1234F1Z5"); // typed lower case, stored upper
    await noHorizontalScroll(page);
    await page.getByRole("button", { name: "Create restaurant" }).click();
    await page.waitForURL("**/dashboard**");
    await expect(page.getByText("No sales yet today")).toBeVisible();
    await page.goto("/pos");
    await page.waitForURL("**/pos/login");
    await expect(page.getByRole("radio", { name: /Asha Patel/ })).toBeVisible();
  });

  test("F01-E1 very long, accented and emoji names are kept intact", async ({ page, problems }) => {
    void problems;
    const email = uniq();
    const name = "Śrīnivās Ñúñez 🍛 " + "x".repeat(40);
    await signUpUi(page, email, name);
    await page.goto(await emailLink(email));
    await page.waitForURL("**/onboarding");
    const restaurant = "बढ़िया ढाबा & Café 🍽️ " + "R".repeat(50); // 80 chars max
    await onboardUi(page, restaurant.slice(0, 80));
    await page.getByRole("button", { name: "Create restaurant" }).click();
    await page.waitForURL("**/dashboard**");
    const row = (await db.query("select o.name from organizations o join org_members m on m.org_id = o.id join \"user\" u on u.id = m.user_id where u.email = $1", [email])).rows[0];
    expect(row.name).toBe(restaurant.slice(0, 80));
    await noHorizontalScroll(page);
  });

  test("F01-E2 double-clicking Create restaurant makes one restaurant", async ({ page, problems }) => {
    void problems;
    const email = uniq();
    await signUpUi(page, email);
    await page.goto(await emailLink(email));
    await page.waitForURL("**/onboarding");
    await onboardUi(page);
    await page.getByRole("button", { name: "Create restaurant" }).dblclick();
    await page.waitForURL("**/dashboard**");
    expect(await count("select count(*) as n from org_members m join \"user\" u on u.id = m.user_id where u.email = $1", [email])).toBe(1);
    expect(await count("select count(*) as n from devices d join org_members m on m.org_id = d.org_id join \"user\" u on u.id = m.user_id where u.email = $1", [email])).toBe(1);
  });

  test("F01-E3 refresh on onboarding keeps you signed in", async ({ page, problems }) => {
    void problems;
    const email = uniq();
    await signUpUi(page, email);
    await page.goto(await emailLink(email));
    await page.waitForURL("**/onboarding");
    await page.reload();
    await expect(page.getByRole("heading", { name: "Set up your restaurant" })).toBeVisible();
  });

  test("F01-E4 keyboard only: sign up form", async ({ page, problems }) => {
    void problems;
    await page.goto("/login", { waitUntil: "networkidle" }); // keyboard handlers attach on hydration
    await page.getByRole("radio", { name: "Sign in" }).focus();
    await page.keyboard.press("ArrowRight"); // radiogroup: focus moves to New account
    await expect(page.getByRole("radio", { name: "New account" })).toBeFocused();
    await page.keyboard.press("Space");
    await expect(page.getByLabel("Your name")).toBeVisible();
    await page.keyboard.press("Tab");
    await page.keyboard.type("Key Board");
    await page.keyboard.press("Tab");
    await page.keyboard.type(uniq());
    await page.keyboard.press("Tab");
    await page.keyboard.type("a long enough password");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  });

  test("F01-N1 GSTIN required for a registered restaurant, explained clearly", async ({ page, problems }) => {
    void problems;
    const email = uniq();
    await signUpUi(page, email);
    await page.goto(await emailLink(email));
    await page.waitForURL("**/onboarding");
    const r = await post(page.request, "/api/v1/orgs", { restaurantName: "No GSTIN", outletName: "Main", stateCode: "24", gstScheme: "regular", gstin: "", ownerName: "A", ownerPin: "1111" });
    expect(r.status()).toBe(409);
    expect((await r.json()).error).toMatch(/GSTIN/);
  });

  test("F01-N2 wrong password, unknown email and unverified email", async ({ page, owner, problems }) => {
    void problems;
    const o = await owner({ till: false });
    await page.context().clearCookies();
    await page.goto("/login");
    await page.getByLabel("Email").fill(o.email);
    await page.getByLabel("Password").fill("not the password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator("form, main, [role=dialog], section").getByRole("alert").first()).toContainText("don’t match");
    // unverified
    const email = uniq();
    await post(page.request, "/api/auth/sign-up/email", { name: "U", email, password: "a long enough password", callbackURL: "/onboarding" });
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("a long enough password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator("form, main, [role=dialog], section").getByRole("alert").first()).toContainText(/Confirm your email/);
  });

  test("F01-N3 signing up twice with the same email", async ({ page, owner, problems }) => {
    void problems;
    const o = await owner({ till: false });
    await page.context().clearCookies();
    await page.goto("/login");
    await page.getByRole("radio", { name: "New account" }).click();
    await page.getByLabel("Your name").fill("Copycat");
    await page.getByLabel("Email").fill(o.email);
    await page.getByLabel("Password").fill("another long password");
    await page.getByRole("button", { name: "Create account" }).click();
    // Either a clear message, or the neutral "check your email" (no account enumeration). Never a crash.
    await expect(page.locator("form, main, [role=dialog], section").getByRole("alert").first().or(page.getByRole("heading", { name: "Check your email" }))).toBeVisible();
    expect(await count('select count(*) as n from "user" where email = $1', [o.email])).toBe(1);
  });

  test("F01-H2 forgot password → reset → sign in with the new one", async ({ page, owner, problems }) => {
    void problems;
    const o = await owner({ till: false });
    await page.context().clearCookies();
    await page.goto("/login");
    await page.getByRole("button", { name: "Forgot your password?" }).click();
    await page.getByLabel("Email").fill(o.email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
    await page.goto(await emailLink(o.email, /Reset/));
    await page.waitForURL("**/reset-password**");
    await page.getByLabel("New password").fill("a brand new password");
    await page.getByRole("button", { name: "Save password" }).click();
    await expect(page.getByRole("heading", { name: "Password changed" })).toBeVisible();
    await page.goto("/login");
    await page.getByLabel("Email").fill(o.email);
    await page.getByLabel("Password").fill("a brand new password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/dashboard");
  });

  test("F01-N4 a used or fake reset link says it expired", async ({ page, problems }) => {
    void problems;
    await page.goto("/reset-password?error=INVALID_TOKEN");
    await expect(page.getByRole("heading", { name: "This link has expired" })).toBeVisible();
  });
});
