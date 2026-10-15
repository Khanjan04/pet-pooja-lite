// Shared fixtures: every test fails on console errors and 5xx responses, gets its own client
// address (so per-IP rate limits behave like separate customers), and has helpers to make an owner
// with a restaurant and a logged-in till without clicking through sign-up each time.
import { test as base, expect, type APIRequestContext, type Page } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import pg from "pg";

export const db = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://postgres@localhost:5499/kk_e2e" });

let ipSeed = Math.floor(Math.random() * 60000);
const nextIp = () => `10.${(ipSeed >> 8) & 255}.${ipSeed++ & 255}.${Math.floor(Math.random() * 250)}`;

export interface Owner {
  email: string;
  password: string;
  name: string;
  orgId: string;
  outletId: string;
  pin: string;
}

type Fixtures = {
  problems: string[];
  owner: (opts?: { gst?: "regular" | "unregistered"; name?: string; restaurant?: string; till?: boolean; pin?: string }) => Promise<Owner>;
};

export const test = base.extend<Fixtures>({
  context: async ({ browser, baseURL, viewport, hasTouch }, use) => {
    const ctx = await browser.newContext({ baseURL, viewport, hasTouch, extraHTTPHeaders: { "x-forwarded-for": nextIp() } });
    await use(ctx);
    await ctx.close();
  },
  problems: async ({ page }, use, info) => {
    const problems: string[] = [];
    const watch = (p: Page) => {
      p.on("console", (m) => {
        if (m.type() !== "error") return;
        // Handled 4xx answers (signed out, wrong PIN, locked, conflict) are shown to the user by the app;
        // the browser still logs them. Only 5xx and real script errors count as problems.
        if (/Failed to load resource: the server responded with a status of 4\d\d/.test(m.text())) return;
        // Expected only when a test switches the network off.
        if (/net::ERR_INTERNET_DISCONNECTED/.test(m.text())) return;
        problems.push(`console: ${m.text()}`);
      });
      p.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
      p.on("response", (r) => {
        if (r.status() >= 500) problems.push(`${r.status()} ${r.request().method()} ${r.url()}`);
      });
    };
    watch(page);
    page.context().on("page", watch);
    await use(problems);
    if (info.status === "passed") expect(problems, "console errors / 5xx during the test").toEqual([]);
  },
  owner: async ({ page }, use) => {
    await use(async (opts = {}) => {
      const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.test`;
      const o = { email, password: "a long enough password", name: opts.name ?? "Asha Patel", pin: opts.pin ?? "1111" };
      const req = page.request;
      const up = await post(req, "/api/auth/sign-up/email", { name: o.name, email, password: o.password, callbackURL: "/onboarding" });
      expect(up.ok(), `sign-up ${up.status()} ${await up.text()}`).toBe(true);
      await page.goto(await emailLink(email));
      await page.waitForURL("**/onboarding");
      const gst = opts.gst ?? "regular";
      const r = await post(req, "/api/v1/orgs", {
        restaurantName: opts.restaurant ?? "E2E Kitchen", outletName: "Main", stateCode: "24", gstScheme: gst,
        gstin: gst === "regular" ? "24ABCDE1234F1Z5" : "", ownerName: o.name, ownerPin: o.pin, sampleMenu: true,
      });
      expect(r.status(), await r.text()).toBe(201);
      const { orgId, outletId } = await r.json();
      if (opts.till !== false) {
        expect((await post(req, "/api/v1/devices/pair-this", { outletId })).ok()).toBe(true);
      }
      return { ...o, orgId, outletId };
    });
  },
});

export { expect };

export function post(req: APIRequestContext, path: string, data: unknown, headers: Record<string, string> = {}) {
  return req.post(path, { data, headers: { origin: new URL(process.env.E2E_BASE_URL ?? "http://localhost:3123").origin, ...headers } });
}

export async function emailLink(to: string, subject?: RegExp): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const r = await db.query("select payload from jobs where kind = 'email.send' and payload->>'to' = $1 order by created_at desc limit 1", [to]);
    const p = r.rows[0]?.payload;
    if (p && (!subject || subject.test(p.subject))) return p.text.match(/https?:\/\/\S+/)[0];
    await new Promise((s) => setTimeout(s, 150));
  }
  throw new Error(`no email to ${to}`);
}

/** PIN-login the given staff member on this (paired) browser through the real screen. */
export async function pinLogin(page: Page, name: RegExp | string, pin: string) {
  await page.goto("/pos/login");
  await page.getByRole("radio", { name }).click();
  for (const d of pin) await page.getByRole("button", { name: d, exact: true }).click();
  await page.waitForURL(/\/pos$/);
}

export async function a11y(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`)).toEqual([]);
}

export async function noHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
}

/** Open a dine-in order on a free table and return the order page. */
export async function openTable(page: Page, table = "M1") {
  await page.goto("/pos");
  await page.getByRole("button", { name: new RegExp(`^Table ${table}, Free`) }).click();
  await page.waitForURL("**/pos/order/**");
  return page.getByRole("complementary", { name: "Current order" });
}

export async function addByShortcode(page: Page, code: string, times = 1) {
  for (let i = 0; i < times; i++) {
    await page.getByPlaceholder(/Search or type a shortcode/).fill(code);
    await page.getByPlaceholder(/Search or type a shortcode/).press("Enter");
  }
}

export const count = async (sql: string, params: unknown[] = []) => Number((await db.query(sql, params)).rows[0].n);
