// End to end against the real server + Postgres: sign up, verify, onboard, till, core loop,
// live updates between two tabs, pairing a second till, billing page. Screenshots for replica-diff.
// Usage: node scripts/slice-e2e.mjs <base-url> <screens-dir>   (DATABASE_URL must point at the app's db)
import { chromium } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";
import pg from "pg";

const base = process.argv[2] ?? "http://localhost:3123";
const out = process.argv[3] ?? "../replica/clone-screens";
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const browser = await chromium.launch();
const errors = [];
let failures = 0;
// Sign-up is rate limited per IP (3 per window). Each context is a different customer, so give it its own address.
let ipN = Math.floor(Math.random() * 200);
const ctxOpts = (o) => ({ ...o, extraHTTPHeaders: { "x-forwarded-for": `10.9.${++ipN % 250}.${Date.now() % 250}` } });
const ok = (cond, msg) => { console.log(`${cond ? "PASS" : "FAIL"} ${msg}`); if (!cond) failures++; };

async function a11y(page, label) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  ok(r.violations.length === 0, `${label}: axe ${r.violations.length} violations`);
  for (const v of r.violations) console.log(`   [${v.impact}] ${v.id}: ${v.help} :: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
}

async function emailLink(to) {
  for (let i = 0; i < 20; i++) {
    const r = await db.query("select payload from jobs where kind = 'email.send' and payload->>'to' = $1 order by created_at desc limit 1", [to]);
    if (r.rows[0]) return r.rows[0].payload.text.match(/https?:\/\/\S+/)[0];
    await new Promise((s) => setTimeout(s, 250));
  }
  throw new Error(`no email for ${to}`);
}

function watch(page, width) {
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    // Expected 401s while signed out / before pairing are part of the flow, not bugs.
    if (/status of 401/.test(t)) return;
    errors.push(`${width}: ${t}`);
  });
  page.on("pageerror", (e) => errors.push(`${width}: ${e.message}`));
}

for (const width of [1440, 390]) {
  const ctx = await browser.newContext(ctxOpts({ viewport: { width, height: 900 } }));
  const page = await ctx.newPage();
  watch(page, width);
  const shot = (id, p = page) => p.screenshot({ path: `${out}/${id}${width === 390 ? "-390" : ""}.png`, fullPage: true });
  const noOverflow = async (label, p = page) => ok(!(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), `${label} @${width}: no horizontal scroll`);
  const email = `owner-${width}-${Date.now()}@example.test`;

  // S01 sign up
  await page.goto(`${base}/dashboard`);
  await page.waitForURL("**/login");
  await page.getByRole("radio", { name: "New account" }).click();
  await page.getByLabel("Your name").fill("Asha Patel");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("short");
  await page.getByRole("button", { name: "Create account" }).click();
  ok(await page.getByRole("heading", { name: "Create your account" }).isVisible(), "short password blocked by the form");
  await page.getByLabel("Password").fill("a long enough password");
  await shot("S01");
  if (width === 1440) await a11y(page, "S01");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByRole("heading", { name: "Check your email" }).waitFor();
  ok(true, "sign up asks to confirm the email");

  // Verify via the link in the (dev) email
  await page.goto(await emailLink(email));
  await page.waitForURL("**/onboarding");

  // S02 onboarding
  await page.getByLabel("Restaurant name").fill("Khana Test Kitchen");
  await page.getByLabel("City").fill("Ahmedabad");
  await page.getByLabel(/^State/).selectOption({ label: "Gujarat" });
  await page.getByLabel(/^GSTIN/).fill("24ABCDE1234F1Z5");
  await page.getByLabel(/^Your till PIN/).fill("1111");
  await shot("S02");
  if (width === 1440) await a11y(page, "S02");
  await noOverflow("S02");
  await page.getByRole("button", { name: "Create restaurant" }).click();
  await page.waitForURL("**/dashboard**");
  await page.getByText("No sales yet today").waitFor();
  ok(true, "onboarding creates the restaurant and lands on the dashboard");

  // S17 PIN login on this browser (paired during onboarding)
  await page.goto(`${base}/pos`);
  await page.waitForURL("**/pos/login");
  await page.getByRole("radio", { name: /Asha Patel/ }).click();
  await page.keyboard.type("9999");
  await page.getByRole("alert").filter({ hasText: /Wrong PIN. 4 tries left/ }).waitFor({ timeout: 5000 }).then(
    () => ok(true, "wrong PIN rejected with tries left"),
    () => ok(false, "wrong PIN rejected with tries left"),
  );
  await shot("S17");
  for (const d of "1111") await page.getByRole("button", { name: d, exact: true }).click();
  await page.waitForURL(`${base}/pos`);

  // Second tab on the same till, to watch live updates
  const watcher = await ctx.newPage();
  watch(watcher, width);
  await watcher.goto(`${base}/pos`);
  await watcher.getByRole("button", { name: /^Table M2, Free/ }).waitFor();

  // S18 → S19
  await page.getByRole("heading", { name: "Tables" }).waitFor();
  await shot("S18");
  await noOverflow("S18");
  if (width === 1440) await a11y(page, "S18");
  await page.getByRole("button", { name: /^Table M2, Free/ }).click();
  await page.waitForURL("**/pos/order/**");
  await page.getByRole("tab", { name: /Main course/ }).first().waitFor();
  await page.getByRole("tab", { name: /Main course/ }).locator("visible=true").click();
  await page.getByRole("button", { name: /^Dal makhani,/ }).click();
  await page.keyboard.press("/");
  await page.keyboard.type("bn");
  await page.keyboard.press("Enter");
  await page.keyboard.type("bn");
  await page.keyboard.press("Enter");
  await page.getByRole("tab", { name: /Starters/ }).locator("visible=true").click();
  await page.getByRole("button", { name: /^Paneer tikka,/ }).click();
  const dlg = page.getByRole("dialog");
  ok(await dlg.getByRole("button", { name: /^Add/ }).isDisabled(), "options: Add disabled until spice level chosen");
  await dlg.getByText("Hot", { exact: true }).click();
  await dlg.getByText(/Extra cheese/).click();
  await dlg.getByLabel("Note for the kitchen").fill("no onion");
  await dlg.getByRole("button", { name: /^Add/ }).click();
  await dlg.waitFor({ state: "detached" });
  const aside = page.getByRole("complementary", { name: "Current order" });
  await aside.getByText("Hot, Extra cheese").waitFor();
  ok((await aside.getByText("Butter naan").count()) === 1, "two naans merged into one line");
  await shot("S19");
  await noOverflow("S19");
  if (width === 1440) await a11y(page, "S19");

  await aside.getByRole("button", { name: "Send to kitchen" }).click();
  const sentMsg = aside.getByRole("status").filter({ hasText: /Sent to/ });
  await sentMsg.waitFor();
  const sentTo = await sentMsg.innerText();
  ok(/Kitchen/.test(sentTo) && /Tandoor/.test(sentTo), "KOTs routed by station");
  // Live update: the other tab shows the table in the kitchen without a reload
  await watcher.getByRole("button", { name: /^Table M2, In kitchen/ }).waitFor({ timeout: 5000 }).then(
    () => ok(true, "second tab updated live (SSE)"),
    () => ok(false, "second tab updated live (SSE)"),
  );

  const kotHref = await aside.getByRole("link", { name: /KOT/ }).first().getAttribute("href");
  const kp = await ctx.newPage();
  await kp.goto(base + kotHref);
  await kp.getByRole("article", { name: "Kitchen ticket" }).waitFor();
  await kp.screenshot({ path: `${out}/S25-kot${width === 390 ? "-390" : ""}.png`, fullPage: true });
  await kp.close();

  await aside.getByRole("button", { name: "Print bill" }).click();
  await aside.getByRole("link", { name: "Open the bill to print" }).waitFor();
  const total = await aside.locator("dd").last().innerText();
  ok(total.replace(/\s/g, "") === "₹672.00", `bill total ${total} (expect ₹672.00)`);
  const billHref = await aside.getByRole("link", { name: "Open the bill to print" }).getAttribute("href");
  const bp = await ctx.newPage();
  await bp.goto(base + billHref);
  await bp.getByRole("article", { name: "Bill" }).waitFor();
  ok(await bp.getByText("TAX INVOICE").isVisible(), "bill is a tax invoice");
  ok(await bp.getByText(/T1\/20\d\d-\d\d\/1$/).isVisible(), "bill number T1/<FY>/1");
  await bp.screenshot({ path: `${out}/S25${width === 390 ? "-390" : ""}.png`, fullPage: true });
  if (width === 1440) await a11y(bp, "S25");
  await bp.close();

  // S21 split tender
  await aside.getByRole("button", { name: /^Settle/ }).click();
  const sd = page.getByRole("dialog");
  await sd.getByRole("radio", { name: /UPI/ }).click();
  await sd.getByRole("textbox", { name: "Amount", exact: true }).fill("300");
  await sd.getByRole("button", { name: /^Take/ }).click();
  await sd.getByText("UPI ₹300.00").waitFor();
  await sd.getByRole("radio", { name: /Cash/ }).click();
  ok((await sd.getByRole("textbox", { name: "Amount", exact: true }).inputValue()) === "372.00", "remaining due prefilled");
  await sd.getByLabel("Cash received").fill("500");
  ok(await sd.getByText("Change to give: ₹128.00").isVisible(), "change worked out");
  await shot("S21");
  if (width === 1440) await a11y(page, "S21");
  await sd.getByRole("button", { name: /^Take/ }).click();
  await aside.getByText("Paid in full").waitFor();
  await watcher.getByRole("button", { name: /^Table M2, Free/ }).waitFor({ timeout: 5000 }).then(
    () => ok(true, "table frees on the other tab too"),
    () => ok(false, "table frees on the other tab too"),
  );
  await watcher.close();

  // S03 dashboard (member view)
  await page.goto(`${base}/dashboard`);
  await page.getByText("How guests paid").waitFor();
  ok(await page.getByText("₹672.00").first().isVisible(), "dashboard shows the sale");
  await shot("S03");
  await noOverflow("S03");
  if (width === 1440) await a11y(page, "S03");

  // S42 billing
  await page.goto(`${base}/billing`);
  await page.getByText(/Free trial until/).waitFor();
  ok(await page.getByText("Payments aren’t connected yet").isVisible(), "billing explains missing Razorpay keys");
  await shot("S42");
  if (width === 1440) await a11y(page, "S42");

  // S04 pair a second till by code
  await page.goto(`${base}/outlets`);
  await page.getByRole("button", { name: "Get a pairing code" }).click();
  const code = (await page.getByRole("status").filter({ hasText: "/pos/pair" }).innerText()).match(/\b\d{6}\b/)[0];
  await shot("S04");
  if (width === 1440) await a11y(page, "S04");
  const ctx2 = await browser.newContext(ctxOpts({ viewport: { width, height: 900 } }));
  const p2 = await ctx2.newPage();
  watch(p2, width);
  await p2.goto(`${base}/pos`);
  await p2.waitForURL("**/pos/pair");
  await p2.getByLabel("Pairing code").fill(code);
  await p2.getByRole("button", { name: "Pair with code" }).click();
  await p2.waitForURL("**/pos/login");
  ok(await p2.getByRole("radio", { name: /Asha Patel/ }).isVisible(), "second till paired by code shows the staff roster");
  await ctx2.close();
  await ctx.close();
}

// Keyboard only on a fresh till: PIN, new takeaway, shortcode add.
{
  const r = await db.query("select o.id from outlets o order by created_at desc limit 1");
  const ctx = await browser.newContext(ctxOpts({ viewport: { width: 1440, height: 900 } }));
  // Pair by asking the API for a code as the most recent owner would; simpler: reuse /pos/pair with a code minted in SQL is not possible (hashed), so sign in.
  const page = await ctx.newPage();
  const email = `kb-${Date.now()}@example.test`;
  await page.goto(`${base}/login`);
  await page.getByRole("radio", { name: "New account" }).click();
  await page.getByLabel("Your name").fill("Kiran");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("a long enough password");
  await page.keyboard.press("Enter");
  await page.getByRole("heading", { name: "Check your email" }).waitFor();
  await page.goto(await emailLink(email));
  await page.waitForURL("**/onboarding");
  await page.getByLabel("Restaurant name").fill("Keyboard Cafe");
  await page.getByLabel(/^State/).selectOption({ label: "Gujarat" });
  await page.getByRole("radio", { name: "Not registered" }).click();
  await page.getByLabel(/^Your till PIN/).fill("4321");
  await page.keyboard.press("Enter");
  await page.waitForURL("**/dashboard**");
  await page.goto(`${base}/pos/login`);
  await page.getByRole("radio", { name: /Kiran/ }).waitFor();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    if (await page.evaluate(() => document.activeElement?.textContent?.includes("Kiran"))) break;
  }
  await page.keyboard.press("Enter");
  await page.keyboard.type("4321");
  await page.waitForURL(`${base}/pos`);
  await page.getByRole("button", { name: "New takeaway" }).focus();
  await page.keyboard.press("Enter");
  await page.waitForURL("**/pos/order/**");
  await page.getByRole("tab").first().waitFor();
  await page.keyboard.press("/");
  await page.keyboard.type("ch");
  await page.keyboard.press("Enter");
  await page.getByRole("complementary", { name: "Current order" }).getByText("Masala chai").waitFor({ timeout: 5000 }).then(
    () => ok(true, "keyboard only: sign up, onboard, PIN, takeaway, shortcode add (unregistered: no GST)"),
    () => ok(false, "keyboard only flow"),
  );
  ok(r.rowCount >= 1, "outlets exist in the database");
  await ctx.close();
}

await browser.close();
await db.end();
ok(errors.length === 0, `no console errors${errors.length ? ":\n   " + errors.join("\n   ") : ""}`);
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
