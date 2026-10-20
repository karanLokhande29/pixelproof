// M5 (T18): phone + tablet widths have no horizontal page overflow on any of the 5 screens;
// navigation and the image viewer are keyboard operable.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.argv[2] ?? "http://127.0.0.1:8000";
const ROOT = resolve(import.meta.dirname, "..", "..");
const OUT = resolve(ROOT, "build_artifacts", "screenshots");
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const problems = [];
const check = (cond, msg) => { if (!cond) { problems.push("ASSERT: " + msg); log("FAIL", msg); } else log("ok", msg); };

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? "msedge" });
const ctx = await browser.newContext(); // one context: the active case (localStorage) is shared
for (const [w, h] of [[390, 844], [820, 1180]]) {
  const page = await ctx.newPage(); await page.setViewportSize({ width: w, height: h });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));
  await page.goto(BASE + "/");
  // ensure an active case exists (bundled example)
  if (await page.getByText("No case open").isVisible().catch(() => false)) {
    const card = page.locator("div").filter({ has: page.getByText("Cloned block of the city", { exact: true }) }).last();
    await card.getByRole("button", { name: "Open as case" }).click();
    await page.waitForURL(/\/lab/);
  }
  for (const path of ["/", "/lab", "/compare", "/provenance", "/reports"]) {
    await page.goto(BASE + path);
    await page.waitForLoadState("networkidle");
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(over <= 1, `${w}px ${path}: no horizontal page overflow (excess ${over}px)`);
    if (w === 390) await page.screenshot({ path: resolve(OUT, `m5_${w}${path === "/" ? "_dashboard" : path.replace("/", "_")}.png`) });
  }
  if (w === 390) {
    await page.goto(BASE + "/");
    await page.getByRole("button", { name: "Open navigation" }).click();
    await page.getByRole("link", { name: "Reports" }).click();
    await page.waitForURL(/\/reports/);
    check(true, "mobile: nav drawer opens and navigates");
  }
  await page.close();
}

// Keyboard: tab to nav links; viewer zoom with keys
const page = await ctx.newPage(); await page.setViewportSize({ width: 1400, height: 900 });
await page.goto(BASE + "/lab");
let reached = false;
for (let i = 0; i < 12 && !reached; i++) {
  await page.keyboard.press("Tab");
  reached = await page.evaluate(() => document.activeElement?.textContent?.includes("Forensic Lab") ?? false);
}
check(reached, "keyboard: Tab reaches sidebar navigation");
const viewer = page.locator('[role="img"][tabindex="0"]').first();
await viewer.focus();
const before = await page.locator("text=/^\\d+%$/").first().innerText();
await page.keyboard.press("+");
await page.keyboard.press("+");
const after = await page.locator("text=/^\\d+%$/").first().innerText();
check(before !== after, `keyboard: viewer zoom ${before} -> ${after}`);
await page.keyboard.press("0");
const fit = await page.locator("text=/^\\d+%$/").first().innerText();
check(fit === before, `keyboard: '0' re-fits (${fit})`);
await browser.close();
log(problems.length ? `PROBLEMS (${problems.length}):\n  ` + problems.join("\n  ") : "M5 responsive/keyboard: all checks passed");
process.exit(problems.length ? 1 : 0);
