/**
 * F6 e2e: the real UI journey against the live frontend + mock-provider
 * backend — landing → requirements → confirm → workspace interactions →
 * guided run → exit — plus one intercepted provider-failure path. Also
 * probes the responsive layout at phone/tablet widths (the automated part
 * of the planner's viewport sweep; manual sweeps stay in the planner).
 */
import { expect, test, type Page } from "@playwright/test";

const IDE_TEXT =
  "Design a distributed rate limiter for a public API with sliding windows and a Redis backing store.";

/** Drive landing → requirements → confirm → workspace. */
async function registerViaUI(page: Page): Promise<void> {
  const email = `journey_${Date.now().toString(36)}@example.com`;
  await page.goto("/login");
  await page.getByRole("tab", { name: "Create account" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("supersecret123");
  await page.getByLabel("Confirm password").fill("supersecret123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/library$/);
}

async function journeyToWorkspace(page: Page): Promise<void> {
  await registerViaUI(page);
  await page.goto("/");
  const ideaInput = page.getByLabel("Your system idea");
  await ideaInput.fill(IDE_TEXT);
  await page.getByRole("button", { name: "Start design session" }).click();
  await expect(page).toHaveURL(/\/requirements$/);

  // Generate the requirement proposals first (mock provider run), then the
  // editor appears with the confirm button.
  const generateButton = page.getByRole("button", { name: "Generate requirements" });
  await expect(generateButton).toBeVisible({ timeout: 30_000 });
  await generateButton.click();

  const confirmButton = page.getByRole("button", { name: /Confirm & generate architecture/ });
  await confirmButton.waitFor({ timeout: 90_000 });
  await confirmButton.scrollIntoViewIfNeeded();
  await expect(confirmButton).toBeEnabled();
  await confirmButton.click();

  // Success card reveals the workspace link; the mock run takes some seconds.
  const workspaceLink = page.getByRole("link", { name: /Open workspace/ });
  await workspaceLink.waitFor({ timeout: 90_000 });
  await workspaceLink.click();
  await expect(page).toHaveURL(/\/workspace$/);
}

test("happy journey: idea → requirements → workspace tabs → guided run → exit", async ({
  page,
}) => {
  await journeyToWorkspace(page);

  // LLD view: SVG diagram with UML markers and the relationship legend.
  await expect(
    page.locator("svg:has(> title:text-is('LLD class diagram'))"),
  ).toBeVisible();
  await expect(page.locator("defs marker[id^='marker-']").first()).toBeAttached();
  await expect(page.getByRole("list", { name: "Relationship marker legend" })).toBeVisible();

  // Keyboard sweep: Tab reaches a node, Enter selects it, details fill,
  // Escape clears the selection.
  await page.locator("div[aria-label^='UML class diagram']").focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  const detailsPanel = page.locator("div[aria-label^='Details for']");
  await expect(detailsPanel).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("div[aria-label^='Details for']")).toHaveCount(0);

  // HLD tab renders the system diagram with its markers and line-style legend.
  await page.getByRole("tab", { name: "HLD" }).click();
  await expect(
    page.locator("svg:has(> title:text-is('HLD system diagram'))"),
  ).toBeVisible();
  await expect(page.locator("defs marker[id^='hld-marker-']").first()).toBeAttached();
  await expect(page.getByRole("list", { name: "Connection style legend" })).toContainText(
    "async event",
  );

  // DSA tab: recommendation cards and the comparison table.
  await page.getByRole("tab", { name: "DSA" }).click();
  await expect(page.getByRole("region", { name: "Comparison table" })).toBeVisible();
  await expect(page.locator("table tbody tr").first()).toBeVisible();

  // Guided run: start, walk to the last step, exit cleanly.
  await page.getByRole("tab", { name: "LLD" }).click();
  const guidedButton = page.getByRole("button", { name: "Guided" });
  await expect(guidedButton).toBeEnabled();
  await guidedButton.click();
  const guidedBar = page.getByRole("group", { name: "Guided learning steps" });
  await expect(guidedBar).toBeVisible();

  const nextButton = guidedBar.getByRole("button", { name: "Next" });
  for (let guard = 0; guard < 80 && (await nextButton.isDisabled()) === false; guard += 1) {
    await nextButton.click();
  }
  await expect(nextButton).toBeDisabled();
  await guidedBar.getByRole("button", { name: "Exit guided mode" }).click();
  await expect(guidedBar).toHaveCount(0);
  await expect(guidedButton).toHaveAttribute("aria-pressed", "false");

  // HLD guided (F6): the mock model carries one cmp_/conn_-scoped learning
  // step, so the bar opens on the last step and Next is disabled at once.
  await page.getByRole("tab", { name: "HLD" }).click();
  await expect(guidedButton).toBeEnabled();
  await guidedButton.click();
  const hldBar = page.getByRole("group", { name: "Guided learning steps" });
  await expect(hldBar).toBeVisible();
  await expect(hldBar.getByRole("button", { name: "Next" })).toBeDisabled();
  await hldBar.getByRole("button", { name: "Exit guided mode" }).click();
  await expect(hldBar).toHaveCount(0);

  // DSA guided (F6): one derived step per recommendation; the matching card
  // keeps its ring while guided.
  await page.getByRole("tab", { name: "DSA" }).click();
  await expect(guidedButton).toBeEnabled();
  await guidedButton.click();
  const dsaBar = page.getByRole("group", { name: "Guided learning steps" });
  await expect(dsaBar).toBeVisible();
  const lookupCard = page.locator("[data-rec-id='dsa_lookup']");
  await expect(lookupCard).toBeVisible();
  await expect(lookupCard).toHaveClass(/ring-ring/);
  await expect(dsaBar.getByRole("button", { name: "Next" })).toBeDisabled();
  await dsaBar.getByRole("button", { name: "Exit guided mode" }).click();
  await expect(dsaBar).toHaveCount(0);

  // Back to LLD: the outline/details sheets below don't render on DSA, and
  // the responsive sweep opens them.
  await page.getByRole("tab", { name: "LLD" }).click();

  // Automated responsive sweep: phone sheets, tablet drawer, desktop panels.
  // The open modal hides the background from the accessibility tree, so each
  // opened sheet is closed again before the next breakpoint assertion.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Outline" })).toBeVisible();
  await page.getByRole("button", { name: "Details" }).click();
  await expect(page.getByRole("dialog", { name: "Details" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Details" })).toBeHidden();

  await page.setViewportSize({ width: 900, height: 800 });
  await page.getByRole("button", { name: "Details" }).click();
  await expect(page.getByRole("dialog", { name: "Details" })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByRole("button", { name: "Details" })).toBeHidden();

  // No sheets render on desktop; the three-panel layout is back.
  await expect(page.getByRole("tab", { name: "LLD" })).toBeVisible();
});

test("provider failure path: rate-limited run start maps to an actionable message", async ({
  page,
}) => {
  await registerViaUI(page);
  await page.goto("/");
  await page.getByLabel("Your system idea").fill(IDE_TEXT);
  await page.getByRole("button", { name: "Start design session" }).click();
  await expect(page).toHaveURL(/\/requirements$/);

  // Fake a provider failure on the architecture run start (POST only, so the
  // GET used elsewhere still works).
  await page.route("**/api/projects/*/architecture", async (route) => {
    if (route.request().method() !== "POST") {
      return route.fallback();
    }
    return route.fulfill({
      status: 402,
      contentType: "application/json",
      body: JSON.stringify({
        status: false,
        statusCode: 402,
        message: "Provider auth failed.",
        error: { code: "PROVIDER_RATE_LIMITED", details: {} },
      }),
    });
  });

  // Generate proposal requirements first, so the editor (and Confirm) appear.
  const generateButton = page.getByRole("button", { name: "Generate requirements" });
  await expect(generateButton).toBeVisible({ timeout: 30_000 });
  await generateButton.click();

  const confirmButton = page.getByRole("button", { name: /Confirm & generate architecture/ });
  await confirmButton.waitFor({ timeout: 90_000 });
  await confirmButton.scrollIntoViewIfNeeded();
  await expect(confirmButton).toBeEnabled();
  await confirmButton.click();

  // The editor banner surfaces the mapped, actionable user message from the
  // error-code table; Confirm stays enabled as the retry affordance.
  await expect(
    page.getByText(/The model provider is rate-limiting requests/),
  ).toBeVisible({ timeout: 20_000 });
  await expect(
    page.getByText("Specification confirmed — starting architecture generation…"),
  ).toBeVisible();
  await expect(confirmButton).toBeEnabled();
});
