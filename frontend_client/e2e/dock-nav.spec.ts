/**
 * Navigation round e2e: desktop floating dock (appear/hide/provider rules)
 * and the mobile menu sheet (identity, links, focus return, Escape). Also
 * asserts no horizontal page overflow at phone widths.
 */
import { expect, test, type Page } from "@playwright/test";
import { fillAuthForm } from "./helpers";

const DOCK = "Floating quick dock";
const HAMBURGER = "Open navigation menu";

/** True when keyboard focus sits inside the given labelled region. */
async function focusInsideRegion(page: Page, region: string): Promise<boolean> {
  return page.evaluate(
    (selector) =>
      document.activeElement?.closest(selector) !== null &&
      document.activeElement?.closest(selector) !== undefined,
    region,
  );
}

async function registerViaUI(page: Page): Promise<void> {
  // Archive every auth response so a flake names its owner (backend vs UI).
  page.on("response", (response) => {
    if (response.url().includes("/api/auth") || response.status() === 404) {
      console.log(`AUTH ${response.status()} ${response.url()}`);
    }
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      console.log(`UI-ERROR ${message.text().slice(0, 160)}`);
    }
  });
  const email = `nav_${Date.now().toString(36)}@example.com`;
  await page.goto("/login");
  await page.getByRole("tab", { name: "Create account" }).click();
  await fillAuthForm(page, email, "supersecret123", {
    confirm: true,
    mode: "register",
  });
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/library$/);
}

async function assertNoOverflow(page: Page, width: number): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `page overflow at ${width}px`).toBeLessThanOrEqual(0);
}

test("desktop dock: appears on scroll, hides at top, provider allowed on landing", async ({
  page,
}) => {
  const viewport = { width: 1440, height: 900 };
  await page.setViewportSize(viewport);
  await page.goto("/");
  // The dock is inert when idle, so role queries only see it once docked;
  // DOM locators assert both states.
  const dock = page.locator("nav[aria-label='Floating quick dock']");
  const headerCard = page.locator("header > div").first();

  // At the top: horizontal header, dock fades out but stays in the DOM.
  await expect(headerCard).toBeVisible();
  await expect(dock).toHaveClass(/opacity-0/);
  await expect(dock.getByRole("link", { name: "Home" })).toBeHidden();

  // Scroll down: dock fades in, header card fades out and drops out of a11y.
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(350);
  await expect(headerCard).toHaveClass(/opacity-0/);
  await expect(dock).toBeVisible();
  const home = dock.getByRole("link", { name: "Home" });
  await expect(home).toBeVisible();

  // Provider setup lives in the dock on landing.
  await dock.getByRole("button", { name: "Provider setup" }).click();
  await expect(page.getByRole("dialog", { name: "Set up model access" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Set up model access" })).toBeHidden();
  // Scroll back to the top deterministically (wheel can be intercepted by
  // the closing dialog overlay).
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(350);

  // Back at the top: dock gone, horizontal header back.
  await expect(headerCard).toBeVisible();
  await expect(dock).toHaveClass(/opacity-0/);
  await expect(dock.getByRole("link", { name: "Home" })).toBeHidden();
  await assertNoOverflow(page, viewport.width);
});

test("desktop dock: provider setup blocked off landing/library", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await registerViaUI(page);
  await page.goto("/dashboard");
  // Force a deep scroll regardless of how tall the (possibly empty) page is.
  await page.evaluate(() => {
    document.body.style.minHeight = "2400px";
    window.scrollTo(0, 800);
  });
  await page.waitForTimeout(350);
  const dock = page.getByRole("navigation", { name: DOCK });
  await expect(
    dock.getByRole("link", { name: "Dashboard" }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: DOCK }).getByRole("button", {
      name: "Provider setup",
    }),
  ).toHaveCount(0);
});

test("mobile menu: identity, links, provider, focus return (portal)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await registerViaUI(page);

  const trigger = page.getByRole("button", { name: HAMBURGER });
  await expect(trigger).toBeVisible();
  await trigger.click();
  const sheet = page.getByRole("dialog", { name: "Navigation" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText(/@example\.com/)).toBeVisible();
  await expect(sheet.getByText(/^free$/i).or(sheet.getByText(/^pro$/i))).toBeVisible();

  // Every link navigates.
  await sheet.getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await page.getByRole("button", { name: HAMBURGER }).click();
  await page
    .getByRole("dialog", { name: "Navigation" })
    .getByRole("link", { name: "Library" })
    .click();
  await expect(page).toHaveURL(/\/library$/);

  // Provider setup allowed on library; accessible inside the sheet.
  await page.getByRole("button", { name: HAMBURGER }).click();
  const sheet2 = page.getByRole("dialog", { name: "Navigation" });
  await expect(sheet2).toBeVisible();
  await sheet2.getByRole("button", { name: "Provider setup" }).click();
  await expect(page.getByRole("dialog", { name: "Set up model access" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(sheet2).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("mobile menu: landing sections + signed-out fallback", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: HAMBURGER }).click();
  const sheet = page.getByRole("dialog", { name: "Navigation" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("link", { name: "How it works" })).toBeVisible();
  await expect(sheet.getByRole("link", { name: "Library" })).toBeHidden();
  await expect(sheet.getByRole("link", { name: "Sign in" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await assertNoOverflow(page, 390);
});

test("desktop dock: keyboard focus follows the dock, reverses at top", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.evaluate(() => {
    document.body.style.minHeight = "2400px";
    window.scrollTo(0, 500);
  });
  await page.waitForTimeout(350);

  // While docked, the invisible header card is inert, so the first Tab
  // lands inside the visible dock, not the hidden top header.
  await expect(page.locator("header > div").first()).toHaveAttribute("inert", "");
  await page.keyboard.press("Tab");
  expect(
    await focusInsideRegion(page, "nav[aria-label='Floating quick dock']"),
    "the first Tab while docked must land in the dock",
  ).toBe(true);
  await page.evaluate(() =>
    (document.activeElement as HTMLElement | null)?.blur(),
  );
  await expect(page.locator("header > div").first()).toHaveAttribute("inert", "");

  // Back at the top: the header card loses inert, the dock drops out of the
  // tab order, and the horizontal header is reachable again.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(350);
  // At the top the header card loses inert, the dock drops out of the tab
  // order, and the horizontal header is keyboard-reachable again.
  await expect(page.locator("header > div").first()).not.toHaveAttribute("inert");
  await expect(page.locator("nav[aria-label='Floating quick dock']")).toHaveAttribute(
    "inert",
    "",
  );
  // A fresh load at the top (Chrome otherwise resumes sequential focus from
  // the dock's last position, skipping the header correctly as inert).
  await page.reload();
  await page.waitForTimeout(600);
  await page.keyboard.press("Tab");
  expect(
    await focusInsideRegion(page, "header"),
    "at top the header is keyboard-reachable again",
  ).toBe(true);
  await expect(page.locator("nav[aria-label='Floating quick dock']")).toHaveClass(
    /opacity-0/,
  );
});

test("workspace Annotate is reachable below sm and toggles", async ({ page }) => {
  const email = `ann_${Date.now().toString(36)}@example.com`;
  await page.goto("/login");
  await page.getByRole("tab", { name: "Create account" }).click();
  await fillAuthForm(page, email, "supersecret123", {
    confirm: true,
    mode: "register",
  });
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/library$/);
  await page.goto("/");
  await page.getByLabel("Your system idea").fill("Design a URL shortener.");
  await page.getByRole("button", { name: "Start design session" }).click();
  await expect(page).toHaveURL(/\/requirements$/);
  // The requirements gate now needs provider setup before generation.
  await page.getByRole("button", { name: "Add provider & key" }).click();
  const setupDialog = page.getByRole("dialog", { name: "Set up model access" });
  await setupDialog.getByRole("combobox", { name: "Provider" }).click();
  await page.getByRole("option", { name: "OpenRouter" }).click();
  await setupDialog.getByLabel("API key").fill("sk-or-e2e-workspace-01");
  await setupDialog.getByRole("button", { name: "Save for this session" }).click();
  await expect(page.getByRole("button", { name: "Add provider & key" })).toBeHidden();
  await page.getByRole("button", { name: "Generate requirements" }).click();
  const confirmButton = page.getByRole("button", { name: /Confirm & generate architecture/ });
  await confirmButton.waitFor({ timeout: 90_000 });
  await confirmButton.scrollIntoViewIfNeeded();
  await expect(confirmButton).toBeEnabled();
  await confirmButton.click();
  const workspaceLink = page.getByRole("link", { name: /Open workspace/ });
  await workspaceLink.waitFor({ timeout: 90_000 });
  await workspaceLink.click();
  await expect(page).toHaveURL(/\/workspace$/);

  for (const width of [390, 320] as const) {
    await page.setViewportSize({ width, height: 844 });
    // Annotate lives in the labeled More menu below desktop (nav round).
    const more = page.getByRole("button", { name: "More actions" });
    await expect(more).toBeVisible();
    await more.click();
    const menu = page.getByRole("menu", { name: "More actions" });
    const annotateItem = menu.getByRole("menuitem", { name: /Annotate — off/ });
    await expect(annotateItem).toBeVisible();

    // Toggle on and off; selection closes the menu each time.
    await annotateItem.click();
    await more.click();
    await expect(
      page
        .getByRole("menu", { name: "More actions" })
        .getByRole("menuitem", { name: /Annotate — on/ }),
    ).toBeVisible();
    await page
      .getByRole("menu", { name: "More actions" })
      .getByRole("menuitem", { name: /Annotate — on/ })
      .click();

    // The rest of the header stays intact and the page never overflows.
    await expect(more).toBeVisible();
    const detailsButton = page.getByRole("main").getByRole("button", { name: "Details" });
    await expect(detailsButton).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `workspace overflow at ${width}px`).toBeLessThanOrEqual(0);
  }
  await page.setViewportSize({ width: 320, height: 844 });
  await page.screenshot({ path: "e2e/artifacts/workspace-annotate-320.png" });
});

test("desktop dock: portal header is inert while docked too", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await registerViaUI(page);
  await page.goto("/library");
  await page.evaluate(() => {
    document.body.style.minHeight = "2400px";
    window.scrollTo(0, 500);
  });
  await page.waitForTimeout(350);

  // Same treatment as landing: the docked portal header card leaves the tab
  // order, and the first Tab lands in the visible dock.
  await expect(page.locator("header > div").first()).toHaveAttribute("inert", "");
  await page.keyboard.press("Tab");
  expect(
    await focusInsideRegion(page, "nav[aria-label='Floating quick dock']"),
    "the first Tab while docked must land in the portal dock",
  ).toBe(true);

  // Back at the top: portal header restored, dock inert.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(350);
  await expect(page.locator("header > div").first()).not.toHaveAttribute("inert");
  await expect(page.locator("nav[aria-label='Floating quick dock']")).toHaveAttribute(
    "inert",
    "",
  );
});

test("no page overflow at phone widths after scroll", async ({ page }) => {
  for (const width of [390, 320] as const) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await page.evaluate(() => window.scrollTo(0, 600));
    await page.waitForTimeout(300);
    await assertNoOverflow(page, width);
    await page.goto("/login");
    await assertNoOverflow(page, width);
  }
});
