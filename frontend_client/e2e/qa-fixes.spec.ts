/**
 * QA-round regression spec: floating header layout, portal-header clickability
 * at 390px (D2), dashboard range-switch state hygiene (D3), and chart tick
 * legibility (D4). Uses the mock-provider backend; the dashboard gets real
 * data from one requirements generation run.
 */
import { expect, test, type Page } from "@playwright/test";
import { fillAuthForm, PROVIDER_SETUP_SEED } from "./helpers";

const IDEA_TEXT =
  "Design a distributed rate limiter for a public API with sliding windows.";

async function registerViaUI(page: Page): Promise<void> {
  const email = `qa_${Date.now().toString(36)}@example.com`;
  // The requirements gate needs provider + model + key in this tab.
  await page.addInitScript(PROVIDER_SETUP_SEED);
  await page.goto("/login");
  await page.getByRole("tab", { name: "Create account" }).click();
  await fillAuthForm(page, email, "supersecret123", { confirm: true, mode: "register" });
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/library$/);
}

/** Register + generate a requirements run, so the dashboard has real data. */
async function createRunWithData(page: Page): Promise<void> {
  await registerViaUI(page);
  await page.goto("/");
  await page.getByLabel("Your system idea").fill(IDEA_TEXT);
  await page.getByRole("button", { name: "Start design session" }).click();
  await expect(page).toHaveURL(/\/requirements$/);
  const generateButton = page.getByRole("button", { name: "Generate requirements" });
  await expect(generateButton).toBeVisible({ timeout: 30_000 });
  await generateButton.click();
  await expect(
    page.getByRole("button", { name: /Confirm & generate architecture/ }),
  ).toBeEnabled({ timeout: 90_000 });
}

/** Portal header clickability across widths: sheet on <768, direct ≥768 (D2). */
test("portal header: menu sheet at 390, direct links ≥768, no overlap/overflow", async ({
  page,
}) => {
  await createRunWithData(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  // Secondary identity details are hidden in the header on phones (D2). The
  // verification banner may still name the address — scope to the header.
  await expect(page.locator("header").getByText("@example.com")).toBeHidden();
  await expect(
    page.locator("header span").filter({ hasText: /FREE|PRO/i }),
  ).toBeHidden();
  // The text nav is display:none on phones; the sheet carries the links.
  await expect(page.getByRole("navigation", { name: "Portal sections" })).toBeHidden();

  // Text nav lives inside the hamburger sheet below 768 (nav round).
  const menuTrigger = page.getByRole("button", { name: "Open navigation menu" });
  const openMenu = async () => {
    await menuTrigger.click();
    return page.getByRole("dialog", { name: "Navigation" });
  };
  let sheet = await openMenu();

  // All three portal links are visible and clickable in the sheet.
  for (const label of ["Library", "Dashboard", "Settings"] as const) {
    await expect(sheet.getByRole("link", { name: label })).toBeVisible();
  }

  // Click one and verify real navigation; Escape returns focus to the trigger.
  await sheet.getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  sheet = await openMenu();
  await sheet.getByRole("link", { name: "Library" }).click();
  await expect(page).toHaveURL(/\/library$/);
  sheet = await openMenu();
  await sheet.getByRole("link", { name: "Dashboard" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  // Fresh sheet: Escape closes and focus returns to the hamburger trigger.
  sheet = await openMenu();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(menuTrigger).toBeFocused();

  // No overlap/interception anywhere at 390: hit-tests resolve to the links
  // while the page holds no horizontal overflow.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "page overflow at 390px").toBeLessThanOrEqual(0);
  await openMenu();
  for (const label of ["Library", "Dashboard"] as const) {
    const link = sheet.getByRole("link", { name: label });
    const box = (await link.boundingBox())!;
    const hit = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.closest("a")?.textContent ?? "none",
      { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    );
    expect(hit, `${label} intercepted at its center`).toContain(label);
  }
  await page.keyboard.press("Escape");

  // Desktop stays direct: at ≥768(=2xl here) the text nav is in the header
  // and the hamburger sheet is gone.
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.goto("/dashboard");
  const direct = page.getByRole("link", { name: "Settings" });
  await expect(direct).toBeVisible();
  await direct.click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("button", { name: "Open navigation menu" })).toBeHidden();

  // Floating treatment: the header bar is a contained rounded card, not a
  // full-width edge-to-edge solid strip.
  const headerCard = page.locator("header > div").first();
  await expect(headerCard).toHaveClass(/rounded-xl/);
  await expect(headerCard).toHaveClass(/backdrop-blur/);
});

test("dashboard range switch keeps content with a busy state (D3)", async ({
  page,
}) => {
  await createRunWithData(page);
  await page.goto("/dashboard");
  const chartHeading = page.getByRole("heading", { name: "Token usage over time" });
  await expect(chartHeading).toBeVisible();

  // Slow only the dashboard fetch, so the switch is observable.
  await page.route("**/api/dashboard*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 600));
    return route.fallback();
  });

  await page.getByRole("button", { name: "Last 7 days" }).click();

  // Content stays, a subtle busy state appears, and no skeleton phase runs.
  await expect(chartHeading).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Updating…" })).toBeVisible();
  await expect(page.locator("[data-slot='skeleton']")).toHaveCount(0);
});

test("dashboard chart tick labels are never clipped (D4)", async ({ page }) => {
  await createRunWithData(page);
  await page.goto("/dashboard");
  const ticks = page.getByRole("list", { name: "Token usage per day" }).locator("+ ul li");
  await expect(ticks.first()).toBeVisible();

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1280, height: 800 },
    { width: 834, height: 1112 },
    { width: 390, height: 844 },
  ] as const) {
    await page.setViewportSize(viewport);
    const clipped = await ticks.evaluateAll((elements) =>
      elements.filter((el) => el.scrollWidth > el.clientWidth + 1).length,
    );
    expect(clipped, `clipped ticks at ${viewport.width}px`).toBe(0);
    await expect(ticks.first()).toBeVisible();
  }

  // Screenshot artifacts for the human sweep.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: "e2e/artifacts/dashboard-1440.png", fullPage: true });
});
