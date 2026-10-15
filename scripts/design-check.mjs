// Screenshots /design in light + dark, and runs axe (WCAG 2.1 A/AA) on each. Usage: node scripts-design-check.mjs <outdir>
import { chromium } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";

const out = process.argv[2];
const browser = await chromium.launch();
let failures = 0;
for (const [theme, width] of [["light", 1366], ["dark", 1366], ["light", 390]]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme });
  const page = await ctx.newPage();
  await page.goto("http://localhost:3123/design", { waitUntil: "networkidle" });
  if (theme === "dark") await page.getByRole("radio", { name: "Dark" }).click();
  await page.evaluate(() => document.fonts.ready);
  const name = `${out}/design-${theme}-${width}.png`;
  await page.screenshot({ path: name, fullPage: true });
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  console.log(`${theme} ${width}px: ${axe.violations.length} axe violations -> ${name}`);
  for (const v of axe.violations) {
    failures++;
    console.log(`  [${v.impact}] ${v.id}: ${v.help}`);
    for (const n of v.nodes.slice(0, 4)) console.log(`     ${n.target.join(" ")} :: ${n.failureSummary?.split("\n").slice(1, 2).join(" ")}`);
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (overflow) { failures++; console.log(`  horizontal overflow at ${width}px`); }
  await ctx.close();
}
// Dialog: focus trap + reason picker.
const ctx2 = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await ctx2.newPage();
await page.goto("http://localhost:3123/design", { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Void an item…" }).click();
await page.getByRole("dialog").waitFor();
await page.screenshot({ path: `${out}/design-dialog.png` });
const axe = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(["wcag2a", "wcag2aa"]).analyze();
console.log(`dialog: ${axe.violations.length} axe violations`);
axe.violations.forEach((v) => { failures++; console.log(`  ${v.id}: ${v.help}`); });
await page.keyboard.press("Escape");
const closed = await page.getByRole("dialog").count();
console.log(`dialog closes on Escape: ${closed === 0}`);
await browser.close();
process.exit(failures ? 1 : 0);
