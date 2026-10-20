// P1: mark a region of interest in the Lab (documented clone target of the
// copy-move example: x=700, y=300, 192x128), confirm it is saved, shown, and in the report.
import { chromium } from "playwright";
import { resolve } from "node:path";

const BASE = process.argv[2] ?? "http://127.0.0.1:8000";
const ROOT = resolve(import.meta.dirname, "..", "..");
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const problems = [];
const check = (cond, msg) => { if (!cond) { problems.push("ASSERT: " + msg); log("FAIL", msg); } else log("ok", msg); };

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? "msedge" });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));

await page.goto(BASE + "/");
const card = page.locator("div").filter({ has: page.getByText("Cloned block of the city", { exact: true }) }).last();
await card.getByRole("button", { name: "Open as case" }).click();
await page.waitForURL(/\/lab/);
await page.getByRole("button", { name: "Original", exact: true }).click();
await page.getByRole("button", { name: "Mark region" }).click();
const img = page.getByAltText("original evidence").first();
await img.waitFor();
const b = await img.boundingBox();
const W = 1024, H = 576;
const at = (x, y) => [b.x + (x + 0.5) * b.width / W, b.y + (y + 0.5) * b.height / H];
const [x0, y0] = at(700, 300), [x1, y1] = at(892, 428);
await page.mouse.move(x0, y0);
await page.mouse.down();
await page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 5 });
await page.mouse.move(x1, y1, { steps: 5 });
await page.mouse.up();
const coords = await page.locator("form span.font-mono").first().innerText();
log("drawn:", coords);
const m = coords.match(/x (\d+), y (\d+), (\d+)×(\d+)/).slice(1).map(Number);
check(Math.abs(m[0] - 700) <= 2 && Math.abs(m[1] - 300) <= 2 && Math.abs(m[2] - 192) <= 3 && Math.abs(m[3] - 128) <= 3,
      "region coordinates are in original pixel space (≈ documented 700,300 192×128)");
await page.getByLabel("Region label").fill("documented clone target <copy B>");
await page.getByRole("button", { name: "Save region" }).click();
await page.getByText("documented clone target <copy B>").first().waitFor();
check(true, "region saved and listed");
await page.screenshot({ path: resolve(ROOT, "build_artifacts", "screenshots", "p1_region.png") });

const caseId = await page.evaluate(() => localStorage.getItem("pixelproof.activeCase"));
const html = await (await page.request.get(`${BASE}/api/cases/${caseId}/report.html`)).text();
check(/<rect x='\d+' y='\d+'/.test(html) && html.includes("documented clone target &lt;copy B&gt;"), "report draws the region and escapes its label");
await browser.close();
log(problems.length ? `PROBLEMS (${problems.length}):\n  ` + problems.join("\n  ") : "P1 regions: all checks passed");
process.exit(problems.length ? 1 : 0);
