// Vertical slice, end to end in a real browser, plus screenshots for replica-diff.
// Usage: node scripts/slice-e2e.mjs <base-url> <screens-dir>
import { chromium } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";

const base = process.argv[2] ?? "http://localhost:3123";
const out = process.argv[3] ?? "../replica/clone-screens";
const browser = await chromium.launch();
const errors = [];
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? "PASS" : "FAIL"} ${msg}`); if (!cond) failures++; };

async function a11y(page, label) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  ok(r.violations.length === 0, `${label}: axe ${r.violations.length} violations`);
  for (const v of r.violations) console.log(`   [${v.impact}] ${v.id}: ${v.help} :: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
}

for (const width of [1440, 390]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && errors.push(`${width}: ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`${width}: ${e.message}`));
  const shot = (id) => page.screenshot({ path: `${out}/${id}${width === 390 ? "-390" : ""}.png`, fullPage: true });
  const noOverflow = async (label) => ok(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), `${label} @${width}: no horizontal scroll`);

  // S17 PIN login (redirect from /pos when logged out)
  await page.goto(`${base}/pos`);
  await page.waitForURL("**/pos/login");
  await page.getByRole("radio", { name: /Ravi/ }).click();
  await page.getByText("Enter your PIN").waitFor();
  await shot("S17");
  await noOverflow("S17");
  if (width === 1440) await a11y(page, "S17");
  await page.keyboard.type("9999"); // wrong PIN, typed on a real keyboard
  ok(await page.getByRole("alert").filter({ hasText: "Wrong PIN" }).isVisible(), "wrong PIN is rejected");
  for (const d of "2222") await page.getByRole("button", { name: d, exact: true }).click();
  await page.waitForURL(`${base}/pos`);

  // S18 tables
  await page.getByRole("heading", { name: "Tables" }).waitFor();
  await shot("S18");
  await noOverflow("S18");
  if (width === 1440) await a11y(page, "S18");
  await page.getByRole("button", { name: /^Table M2, Free/ }).click();
  await page.waitForURL("**/pos/order/**");

  // S19 order: plain item, shortcode search, item with options
  await page.getByRole("tab", { name: /Main course/ }).first().waitFor();
  await page.getByRole("tab", { name: /Main course/ }).locator("visible=true").click();
  await page.getByRole("button", { name: /^Dal makhani,/ }).click();
  await page.keyboard.press("/");
  await page.keyboard.type("bn");
  await page.keyboard.press("Enter");
  await page.keyboard.type("bn"); // search keeps focus: a second naan merges into one line
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
  ok((await aside.getByText("Hot, Extra cheese").count()) === 1, "options shown on the order line");
  await shot("S19");
  await noOverflow("S19");
  if (width === 1440) await a11y(page, "S19");

  // Send to kitchen -> KOTs per station
  await aside.getByRole("button", { name: "Send to kitchen" }).click();
  await aside.getByRole("status").filter({ hasText: /Sent to/ }).waitFor();
  const sentTo = await aside.getByRole("status").filter({ hasText: /Sent to/ }).innerText();
  ok(/Kitchen/.test(sentTo) && /Tandoor/.test(sentTo), `KOTs routed by station (${sentTo.split(".")[0]})`);

  // S25 KOT print preview
  const kotHref = await aside.getByRole("link", { name: /KOT/ }).first().getAttribute("href");
  const kp = await ctx.newPage();
  await kp.goto(base + kotHref);
  await kp.getByRole("article", { name: "Kitchen ticket" }).waitFor();
  await kp.screenshot({ path: `${out}/S25-kot${width === 390 ? "-390" : ""}.png`, fullPage: true });
  await kp.close();

  // Bill
  await aside.getByRole("button", { name: "Print bill" }).click();
  await aside.getByRole("link", { name: "Open the bill to print" }).waitFor();
  // 250 + 2x60 + (240+30) = 640.00 ; +5% = 672.00
  const total = await aside.locator("dd").last().innerText();
  ok(total.replace(/\s/g, "") === "₹672.00", `bill total ${total} (expect ₹672.00)`);
  const billHref = await aside.getByRole("link", { name: "Open the bill to print" }).getAttribute("href");
  const bp = await ctx.newPage();
  await bp.goto(base + billHref);
  await bp.getByRole("article", { name: "Bill" }).waitFor();
  ok(await bp.getByText("TAX INVOICE").isVisible(), "bill prints as a tax invoice with GSTIN");
  await bp.screenshot({ path: `${out}/S25${width === 390 ? "-390" : ""}.png`, fullPage: true });
  if (width === 1440) await a11y(bp, "S25");
  await bp.close();

  // S21 settle: split tender UPI 300 + cash rest with change
  await aside.getByRole("button", { name: /^Settle/ }).click();
  const sd = page.getByRole("dialog");
  await sd.getByRole("radio", { name: /UPI/ }).click();
  await sd.getByRole("textbox", { name: "Amount", exact: true }).fill("300");
  await sd.getByRole("button", { name: /^Take/ }).click();
  await sd.getByText("UPI ₹300.00").waitFor();
  await sd.getByRole("radio", { name: /Cash/ }).click();
  ok((await sd.getByRole("textbox", { name: "Amount", exact: true }).inputValue()) === "372.00", "remaining due prefilled after part payment");
  await sd.getByLabel("Cash received").fill("500");
  ok(await sd.getByText("Change to give: ₹128.00").isVisible(), "change worked out");
  await shot("S21");
  if (width === 1440) await a11y(page, "S21");
  await sd.getByRole("button", { name: /^Take/ }).click();
  await aside.getByText("Paid in full").waitFor();
  ok(true, "bill settled");

  // Table is free again
  await aside.getByRole("button", { name: "Back to tables" }).click();
  await page.waitForURL(`${base}/pos`);
  ok(await page.getByRole("button", { name: /^Table M2, Free/ }).isVisible(), "table M2 is free after payment");

  // S03 dashboard reflects the sale
  await page.goto(`${base}/dashboard`);
  await page.getByText("How guests paid").waitFor();
  ok(await page.getByText("₹672.00").first().isVisible(), "dashboard shows the sale");
  await shot("S03");
  await noOverflow("S03");
  if (width === 1440) await a11y(page, "S03");

  // A stub screen renders inside the back-office shell
  await page.goto(`${base}/menu`);
  ok(await page.getByText("S05 · coming in P1").isVisible(), "stub screens render with their ID and phase");
  await ctx.close();
}

// Keyboard only: log in and add an item without the mouse.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${base}/pos/login`);
  await page.getByRole("radio", { name: /Asha/ }).waitFor();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    if (await page.evaluate(() => document.activeElement?.textContent?.includes("Asha"))) break;
  }
  await page.keyboard.press("Enter");
  await page.keyboard.type("1111");
  await page.waitForURL(`${base}/pos`);
  await page.getByRole("button", { name: "New takeaway" }).focus();
  await page.keyboard.press("Enter");
  await page.waitForURL("**/pos/order/**");
  await page.keyboard.press("/");
  await page.keyboard.type("ch");
  await page.keyboard.press("Enter");
  ok((await page.getByRole("complementary", { name: "Current order" }).getByText("Masala chai").count()) === 1, "keyboard only: PIN login, new takeaway, shortcode add");
  await ctx.close();
}

await browser.close();
ok(errors.length === 0, `no console errors${errors.length ? ":\n   " + errors.join("\n   ") : ""}`);
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
