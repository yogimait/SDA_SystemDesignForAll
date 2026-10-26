/**
 * Visual sweep (F6 manual-checkpoint support, agent-run): capture screenshots
 * at the two deferred viewport sizes (1280×800 desktop, 834×1112 tablet
 * portrait) across the main surfaces. Requires the dev servers running
 * (frontend :3000, mock backend :3001 with a raised throttle limit).
 * Screenshots land in test-results/sweep/ (gitignored) for human review.
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const BASE = "http://localhost:3000";
const IDE =
  "Design a distributed rate limiter for a public API with sliding windows and a Redis backing store.";
const SIZES = [
  [1280, 800],
  [834, 1112],
];

const browser = await chromium.launch();
// Screenshot determinism: headless Chromium's first-context animation clock
// runs ~18x slow, so entrance animations freeze mid-reveal in captures.
// Force settled end states for captures only — the app keeps its motion.
// The tag is added AFTER the first goto (a pre-goto tag dies with the
// navigation); from there the session is client-side navigated, so one
// injection covers every page of the journey.
const KILL_MOTION =
  "*, *::before, *::after { animation: none !important; transition: none !important; }";

for (const [width, height] of SIZES) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  const dir = path.join("test-results", "sweep", `${width}x${height}`);
  await mkdir(dir, { recursive: true });

  const shot = async (name, opts = {}) => {
    await page.screenshot({ path: path.join(dir, `${name}.png`), ...opts });
    console.log(`saved ${dir}/${name}.png`);
  };

  await page.goto(`${BASE}/`);
  await page.addStyleTag({ content: KILL_MOTION });
  await page.waitForTimeout(800);
  await shot("landing", { fullPage: true });

  await page.getByLabel("Your system idea").fill(IDE);
  await page.getByRole("button", { name: "Start design session" }).click();
  await page.waitForURL(/\/requirements$/);
  await page.getByRole("button", { name: "Generate requirements" }).waitFor({ timeout: 30_000 });
  await shot("requirements", { fullPage: true });

  await page.getByRole("button", { name: "Generate requirements" }).click();
  const confirm = page.getByRole("button", { name: /Confirm & generate architecture/ });
  await confirm.waitFor({ timeout: 90_000 });

  await confirm.click();
  const workspaceLink = page.getByRole("link", { name: /Open workspace/ });
  await workspaceLink.waitFor({ timeout: 90_000 });
  await workspaceLink.click();
  await page.waitForURL(/\/workspace$/);

  await page.locator("svg:has(> title:text-is('LLD class diagram'))").waitFor();
  await shot("workspace-lld");

  await page.getByRole("tab", { name: "HLD" }).click();
  await page.locator("svg:has(> title:text-is('HLD system diagram'))").waitFor();
  await shot("workspace-hld");

  await page.getByRole("tab", { name: "DSA" }).click();
  await page.getByRole("region", { name: "Comparison table" }).waitFor();
  await shot("workspace-dsa", { fullPage: true });

  await context.close();
}
await browser.close();
