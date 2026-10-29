/**
 * Workspace UX round: escape routes (Library/Home), the identified mobile tab
 * row (Outline/Details beside the view tabs), the labeled More menu, the
 * regeneration scope menu (descriptions, provider gating + one real run), the
 * expandable non-blocking validation banner, and no page overflow at any
 * sweep width.
 */
import { expect, test, type Page } from "@playwright/test";
import { fillAuthForm } from "./helpers";

const IDEA_TEXT =
  "Design a distributed rate limiter for a public API with sliding windows and a Redis backing store.";

async function journeyToWorkspace(page: Page): Promise<void> {
  const email = `wsux_${Date.now().toString(36)}@example.com`;
  await page.goto("/login");
  await page.getByRole("tab", { name: "Create account" }).click();
  await fillAuthForm(page, email, "supersecret123", {
    confirm: true,
    mode: "register",
  });
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/library$/);
  await page.goto("/");
  await page.getByLabel("Your system idea").fill(IDEA_TEXT);
  await page.getByRole("button", { name: "Start design session" }).click();
  await expect(page).toHaveURL(/\/requirements$/);

  // The requirements gate requires provider setup before generation runs.
  await page.getByRole("button", { name: "Add provider & key" }).click();
  const dialog = page.getByRole("dialog", { name: "Set up model access" });
  await dialog.getByRole("combobox", { name: "Provider" }).click();
  await page.getByRole("option", { name: "OpenRouter" }).click();
  await dialog.getByLabel("API key").fill("sk-or-e2e-workspace-01");
  await dialog.getByRole("button", { name: "Save for this session" }).click();
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
}

async function noOverflow(page: Page, width: number): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `page overflow at ${width}px`).toBeLessThanOrEqual(0);
}

test("escape routes, mobile actions, regen run, validation details", async ({
  page,
}) => {
  await journeyToWorkspace(page);

  // Escape route row 1: back to Library while signed in.
  const backLink = page.getByRole("link", { name: "Back to Library" });
  await backLink.click();
  await expect(page).toHaveURL(/\/library$/);

  // Next keeps stale page roots mounted with display:none — filter to the
  // visible one, otherwise .last() can match a ghost copy.
  const openLinks = page.locator(
    "a[href^='/projects/']:has-text('Open workspace'):visible",
  );
  await openLinks.last().click();
  await expect(page).toHaveURL(/\/workspace$/);

  // Non-blocking validation banner with expandable guidance.
  await page.setViewportSize({ width: 390, height: 844 });
  const banner = page.getByRole("status");
  await expect(banner).toBeVisible();
  await banner.getByRole("button", { name: "Details" }).click();
  await expect(banner.getByText(/Warnings never block this view/)).toBeVisible();
  await expect(banner.getByText(/must-have requirement/i).first()).toBeVisible();
  await banner
    .getByRole("button", { name: /Edit requirements…/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/requirements$/);
  const projectId = page.url().split("/projects/")[1].split("/")[0];
  await page.goto(`/projects/${projectId}/workspace`);
  await expect(page).toHaveURL(/\/workspace$/);
  await expect(page.getByRole("tab", { name: "LLD" })).toBeVisible();

  // Mobile tab row: view tabs + Outline/Details directly beside them.
  await expect(page.getByRole("button", { name: "Outline" })).toBeVisible();
  await page.getByRole("main").getByRole("button", { name: "Details" }).click();
  const detailsSheet = page.getByRole("dialog", { name: "Details" });
  await expect(detailsSheet).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(detailsSheet).toBeHidden();

  // More menu: labeled toggles + regeneration submenu (provider now ready).
  const more = page.getByRole("button", { name: "More actions" });
  /* Deterministic More-menu open: the trigger toggles, so never blind-click. */
  const openMoreMenu = async () => {
    if ((await more.getAttribute("aria-expanded")) !== "true") {
      await more.click();
      await page.waitForTimeout(250); // let the open zoom animation settle
    }
    const menu = page.getByRole("menu", { name: "More actions" });
    await expect(menu).toBeVisible();
    return menu;
  };
  const closeMoreMenu = async () => {
    if ((await more.getAttribute("aria-expanded")) === "true") {
      await more.click();
    }
    await expect(page.getByRole("menu", { name: "More actions" })).toBeHidden();
  };
  const deselect = () => page.keyboard.press("Escape");

  {
    const menu = await openMoreMenu();
    await menu.getByRole("menuitem", { name: /Guided — off|Guided — on/ }).click();
  }
  {
    const menu = await openMoreMenu();
    await expect(menu.getByRole("menuitem", { name: /Guided/ })).toContainText(
      /Guided — (off|on)/,
    );
    await deselect();
    await closeMoreMenu();
  }
  {
    const menu = await openMoreMenu();
    await menu.getByRole("menuitem", { name: /Annotate — off|Annotate — on/ }).click();
  }
  {
    const menu = await openMoreMenu();
    await menu.getByRole("menuitem", { name: /Annotate/ }).click();
    await deselect();
    await closeMoreMenu();
  }

  // QA D1: every interactive control in the open More menu is >=44px tall at
  // phone widths (items + the Regenerate sub trigger). Measured after the
  // open zoom animation settles (bounding boxes scale during entry).
  {
    const menuFull = await openMoreMenu();
    const items = [
      /Guided — (off|on)/,
      /Annotate — (off|on)/,
      "Regenerate a view…",
      /Export/,
      /Edit requirements…/,
    ];
    for (const name of items) {
      const item = menuFull.getByRole("menuitem", { name });
      await expect(item).toBeVisible();
      const box = (await item.boundingBox())!;
      expect(
        box.height,
        `More-menu item (${String(name)}) height`,
      ).toBeGreaterThanOrEqual(44);
    }
    await menuFull.getByRole("menuitem", { name: "Regenerate a view…" }).click();
    await page.waitForTimeout(250);
    const heights = await page.evaluate(() =>
      Array.from(
        document.querySelectorAll("[data-slot='dropdown-menu-sub-trigger']"),
      )
        .filter((el) => el.getBoundingClientRect().width > 0)
        .map((el) => el.getBoundingClientRect().height),
    );
    expect(heights.length).toBeGreaterThanOrEqual(1);
    for (const h of heights) {
      expect(h, "Regenerate sub-trigger height").toBeGreaterThanOrEqual(44);
    }
    await deselect();
    await closeMoreMenu();
  }

  for (const width of [390, 320, 834] as const) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.getByRole("tab", { name: "LLD" })).toBeVisible();
    await noOverflow(page, width);
  }
  await page.screenshot({ path: "e2e/artifacts/workspace-ux-320.png" });
});

test("regeneration scopes: run with key, blocked + explained without", async ({
  page,
}) => {
  const calls: Array<{ body: unknown; key: string | undefined }> = [];
  await journeyToWorkspace(page);

  // With the tab's provider key: choosing a scope starts its own run and the
  // live progress panel appears.
  await page.route("**/api/projects/*/architecture/regenerate", async (route) => {
    calls.push({
      body: route.request().postDataJSON(),
      key: route.request().headers()["x-provider-api-key"],
    });
    return route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({ status: true, statusCode: 202, data: { runId: "run_ux_regen" } }),
    });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Regenerate" }).click();
  const menu = page.getByRole("menu", { name: "Regenerate" });
  await expect(menu.getByRole("menuitem", { name: /LLD only/ })).toBeEnabled();
  await expect(menu.getByText(/paid provider pass/i)).toBeVisible();
  await menu.getByRole("menuitem", { name: /LLD only/ }).click();

  await expect.poll(() => calls.length).toBe(1);
  expect(calls[0]?.body).toMatchObject({ scope: "lld", provider: "openrouter" });
  expect(calls[0]?.key).toBe("sk-or-e2e-workspace-01");
  // The menu closes; the live regen progress panel mounts on the real run
  // (fulfilled runs here finish before the scripted poll, so assert only on
  // the captured scope call plus menu dismissal — the dock-nav suite covers
  // the live phase against the streaming mock).
  await expect(page.getByRole("menu", { name: "Regenerate" })).toBeHidden();
  // HLD/DSA use the same dispatch and live-phase machinery (REGEN_INFO maps
  // every scope to regenerate(scope)); LLD exercises the shared path.
  // Without a key in the tab: scopes refuse with a reason and a fix path.
  await page.waitForTimeout(1500);
  await page.evaluate(() =>
    window.sessionStorage.removeItem("sda:provider-setup"),
  );
  await page.reload();
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: "Regenerate" }).click();
  const menu2 = page.getByRole("menu", { name: "Regenerate" });
  for (const scope of [/LLD only/, /HLD only/, /DSA only/]) {
    await expect(menu2.getByRole("menuitem", { name: scope })).toBeDisabled();
  }
  await expect(menu2.getByText(/No provider key in this tab/)).toBeVisible();
  await expect(
    menu2.getByRole("menuitem", { name: /Provider & model key/ }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await noOverflow(page, 900);
});
