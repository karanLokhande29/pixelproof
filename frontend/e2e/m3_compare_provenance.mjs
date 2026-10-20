// M3 gate: compare ELA / Copy-Move / Metadata of one case; provenance exact vs
// resaved; ledger add/check; case isolation. Real UI in system Edge.
// Needs build_artifacts/test_inputs/sample_resaved_q80.jpg (see FINAL_BUILD_REPORT.md).
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.argv[2] ?? "http://127.0.0.1:5173";
const ROOT = resolve(import.meta.dirname, "..", "..");
const SHOTS = resolve(ROOT, "build_artifacts", "screenshots");
mkdirSync(SHOTS, { recursive: true });
const SAMPLE = resolve(ROOT, "assets", "sample images", "sampleImg.jpeg");
const RESAVED = resolve(ROOT, "build_artifacts", "test_inputs", "sample_resaved_q80.jpg");

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const problems = [];
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? "msedge" });
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
page.on("response", (r) => r.status() >= 500 && problems.push(`HTTP ${r.status()} ${r.url()}`));
const check = (cond, msg) => { if (!cond) { problems.push("ASSERT: " + msg); log("FAIL", msg); } else log("ok", msg); };

async function runMethod(name, expect, timeout = 90000) {
  await page.getByRole("button", { name: new RegExp("^" + name) }).click();
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await page.getByText(expect).first().waitFor({ timeout });
  log("ran", name);
}

// 1. Case from the gallery, three methods
await page.goto(BASE + "/");
const card = page.locator("div").filter({ has: page.getByText("Cloned block of the city", { exact: true }) }).last();
await card.getByRole("button", { name: "Open as case" }).click();
await page.waitForURL(/\/lab\?t=copy_move/);
await page.getByRole("button", { name: "Run", exact: true }).click();
await page.getByText("Searched the image for regions duplicated").first().waitFor({ timeout: 120000 });
await runMethod("Error Level Analysis", "Re-saved at JPEG q90");
await runMethod("Metadata & C2PA", /Read EXIF/);

// 2. Compare
await page.getByRole("link", { name: "Compare" }).click();
await page.getByText("no aggregate score, consensus or verdict").waitFor();
const heads = await page.locator("h3").allInnerTexts();
log("compare columns:", heads.join(" | "));
check(["Copy-move detection", "Error Level Analysis", "Metadata & C2PA"].every((h) => heads.includes(h)), "three independent method columns shown");
const bodyText = await page.locator("main").innerText();
check(!/authentic|probability of|fake score|tamper(ing)? score/i.test(bodyText), "no verdict/score wording on Compare");
await page.screenshot({ path: resolve(SHOTS, "m3_compare.png"), fullPage: true });
await page.getByLabel("Analyst notes (case-wide)").fill("Clone at x=700,y=300 matches the documented edit; ELA alone is inconclusive.");
await page.getByRole("button", { name: "Save", exact: true }).click();
await page.getByText("Saved to the case").waitFor();
log("case note saved");

// 3. Second case: isolation
await page.getByRole("link", { name: "Dashboard" }).click();
await page.locator('input[type="file"]').first().setInputFiles(SAMPLE);
await page.getByRole("button", { name: "Create case" }).click();
await page.getByText("SHA-256 of the stored original").waitFor();
await page.getByRole("link", { name: "Compare" }).click();
await page.getByText("No results to compare yet").waitFor({ timeout: 5000 });
check(true, "new case's Compare shows none of the previous case's results");

// 4. Provenance on the sample case
await page.getByRole("link", { name: "Provenance" }).click();
await page.getByText("Evidence identity").waitFor();
const zone = page.locator('input[type="file"]').first();
await zone.setInputFiles(SAMPLE);
await page.getByRole("button", { name: "Compare upload" }).click();
await page.getByText("byte-identical", { exact: true }).waitFor({ timeout: 15000 });
check(true, "exact duplicate classified byte-identical");
await zone.setInputFiles(RESAVED);
await page.getByRole("button", { name: "Compare upload" }).click();
await page.getByText("visually similar", { exact: true }).waitFor({ timeout: 15000 });
check(await page.getByText("SHA-256 differs", { exact: true }).isVisible()
      && await page.getByText("pixel SHA-256 differs", { exact: true }).isVisible(),
      "resaved copy: file and pixel SHA-256 differ, classified visually similar");
await page.getByRole("button", { name: "Run metadata analysis" }).click();
// The upstream sample carries a test C2PA manifest (untrusted test cert -> "Invalid").
await page.getByText("Content Credentials present", { exact: true }).waitFor({ timeout: 30000 });
check(await page.getByText("Invalid", { exact: true }).isVisible(), "metadata ran; sample's C2PA manifest shown with validation state Invalid");
await page.getByRole("button", { name: "Clear" }).isEnabled().then(async (en) => {
  if (en) { page.once("dialog", (d) => d.accept()); await page.getByRole("button", { name: "Clear" }).click(); await page.getByText("The ledger is empty.").waitFor(); }
});
await page.getByRole("button", { name: "Add this case's original" }).click();
await page.getByText("(this case)").waitFor();
await page.getByRole("button", { name: "Check against ledger" }).click();
await page.getByText("Byte-identical (SHA-256) to record").waitFor({ timeout: 10000 });
check(true, "ledger add + check: byte-identical match");
await page.screenshot({ path: resolve(SHOTS, "m3_provenance.png"), fullPage: true });

await browser.close();
log(problems.length ? `PROBLEMS (${problems.length}):\n  ` + problems.join("\n  ") : "M3 gate: all checks passed, no console errors, no 5xx");
process.exit(problems.length ? 1 : 0);
