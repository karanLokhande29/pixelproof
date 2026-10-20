// M2 gate, driven in the system Microsoft Edge (or Chrome) via Playwright:
// create a case by real upload -> ELA q65 and q95 -> Copy-Move, all through the UI.
// Usage (servers running): node e2e/m2_lab.mjs [baseUrl]
import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.argv[2] ?? "http://127.0.0.1:5173";
const ROOT = resolve(import.meta.dirname, "..", "..");
const SHOTS = resolve(ROOT, "build_artifacts", "screenshots");
mkdirSync(SHOTS, { recursive: true });
const ELA_FILE = resolve(ROOT, "assets", "examples", "ela_recompressed_patch.jpg");
const CLONE_FILE = resolve(ROOT, "assets", "examples", "copy_move_clone.jpg");

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const problems = [];
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? "msedge" });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
page.on("response", (r) => r.status() >= 500 && problems.push(`HTTP ${r.status()} ${r.url()}`));

async function upload(file) {
  await page.goto(BASE + "/");
  await page.locator('input[type="file"]').first().setInputFiles(file);
  await page.getByRole("button", { name: "Create case" }).click();
  await page.getByText("SHA-256 of the stored original").waitFor({ timeout: 15000 });
  const sha = createHash("sha256").update(readFileSync(file)).digest("hex");
  await page.getByText(sha).first().waitFor({ timeout: 5000 });
  log("case created, UI shows SHA-256 =", sha.slice(0, 16), "(matches local file)");
}

async function runAndWait(expectSummary, timeout = 60000) {
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await page.getByText(expectSummary).first().waitFor({ timeout });
}

// 1. ELA q65 / q95 on the ELA example
await upload(ELA_FILE);
await page.getByRole("button", { name: "Open in Forensic Lab" }).click();
await page.waitForURL(/\/lab/);
const slider = page.locator("#p-quality");
await slider.focus();
await page.keyboard.press("Home");
for (let i = 0; i < 15; i++) await page.keyboard.press("ArrowRight");
log("slider value:", await slider.inputValue());
await runAndWait("Re-saved at JPEG q65");
const m65 = await page.getByText(/Area above 2x expected error/).first().isVisible().catch(() => false);
log("ELA q65 result shown; summary contains q65");
await page.screenshot({ path: resolve(SHOTS, "m2_ela_q65.png") });
await slider.focus();
await page.keyboard.press("End");
log("slider value:", await slider.inputValue());
await page.getByText("Press Run to compute it").waitFor({ timeout: 3000 });
log("stale notice shown after moving slider (result not silently replaced)");
await runAndWait("Re-saved at JPEG q95");
log("ELA q95 result shown");
await page.getByRole("tab", { name: /Metrics/ }).click();
const metrics95 = await page.locator("dl").first().innerText();
log("q95 metrics:", metrics95.replace(/\s+/g, " ").slice(0, 160));
const hist = await page.getByText(/quality=(65|95)/).allInnerTexts();
log("history entries:", hist.join(" | "));
await page.getByRole("button", { name: /Overlay/ }).click();
await page.screenshot({ path: resolve(SHOTS, "m2_ela_q95_overlay.png") });

// 2. Copy-Move on the clone example, navigating away while it runs
await upload(CLONE_FILE);
await page.getByRole("button", { name: "Open in Forensic Lab" }).click();
await page.getByRole("button", { name: /^Copy-move detection/ }).click();
await page.getByRole("button", { name: "Run", exact: true }).click();
await page.getByText(/Running…|Queued…/).first().waitFor({ timeout: 5000 });
log("copy-move running; navigating to Dashboard and back during the job");
await page.getByRole("link", { name: "Dashboard" }).click();
await page.getByText("Active case").waitFor();
await page.getByRole("link", { name: "Forensic Lab" }).click();
await page.getByText("Searched the image for regions duplicated").first().waitFor({ timeout: 120000 });
await page.getByRole("tab", { name: /Metrics/ }).click();
const cm = await page.locator("dl").first().innerText();
log("copy-move metrics:", cm.replace(/\s+/g, " "));
await page.screenshot({ path: resolve(SHOTS, "m2_copy_move.png") });

await browser.close();
log(problems.length ? `PROBLEMS (${problems.length}):\n  ` + problems.join("\n  ") : "no console errors, no 5xx responses");
void m65;
process.exit(problems.length ? 1 : 0);
