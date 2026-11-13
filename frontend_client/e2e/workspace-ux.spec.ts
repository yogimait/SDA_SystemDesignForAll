/**
 * Workspace UX round: escape routes (Library/Home), the identified mobile tab
 * row (Outline/Details beside the view tabs), the labeled More menu, the
 * regeneration scope menu (descriptions, provider gating + one real run), the
 * expandable non-blocking validation banner, and no page overflow at any
 * sweep width.
 */
import { expect, test, type Page } from "@playwright/test";
import { fillAuthForm, mockAuthRoutes } from "./helpers";

const IDEA_TEXT =
  "Design a distributed rate limiter for a public API with sliding windows and a Redis backing store.";

async function journeyToWorkspace(page: Page): Promise<void> {
  const email = `wsux_${Date.now().toString(36)}@example.com`;
  await page.goto("/login");
  await page.getByRole("tab", { name: "Create account" }).click();
  await fillAuthForm(page, email, "Supersecret123!", {
    confirm: true,
    mode: "register",
  });
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/library$/);
  await page.goto("/");
  await page.getByLabel("Your system idea").fill(IDEA_TEXT);
  await page.getByRole("button", { name: "Start design session" }).click();
  await expect(page).toHaveURL(/\/requirements$/);

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

  // The mock provider's model can validate clean; pin one warning on the real
  // generated model so the banner regression below is deterministic.
  await page.route("**/api/projects/*/architecture", async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    const validation = json?.data?.version?.validation;
    if (validation) {
      validation.warnings = [
        {
          rule: "unreferenced_must_requirement",
          severity: "warning",
          message: "One requirement is not referenced.",
          path: "fr_1",
        },
      ];
      validation.errors = [];
      validation.valid = true;
    }
    await route.fulfill({ response, json });
  });
  await page.reload();
  await expect(page).toHaveURL(/\/workspace$/);

  // Non-blocking validation banner with expandable guidance.
  await page.setViewportSize({ width: 390, height: 844 });
  const banner = page.getByRole("status").filter({ hasText: /validation warning/i });
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

test("HLD component details jump to related LLD classes and back", async ({
  page,
}) => {
  // Contract-shaped fixture: cmp_1 and cls_1 share fr_1 (the only honest
  // component↔class link the schema carries); cls_2 shares nothing and a
  // component with no refs must show the empty state, not invented links.
  const USER = {
    id: "usr_rel01",
    email: "rel@example.com",
    planTier: "free",
    emailVerifiedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const SPEC = {
    functional: [
      { id: "fr_1", kind: "functional", text: "Clients can submit ideas", priority: "must" },
      { id: "fr_2", kind: "functional", text: "Audit every mutation", priority: "should" },
    ],
    nonFunctional: [],
    assumptions: [],
    clarifications: [],
  };
  const MODEL = {
    meta: { title: "Cross view", summary: "Fixture." },
    requirements: { confirmedAt: "2026-01-05T00:00:00.000Z", spec: SPEC },
    hld: {
      components: [
        { id: "cmp_1", name: "Gateway", type: "gateway", responsibility: "Accepts and checks calls", technology: "nginx", requirementRefs: ["fr_1"], scalingNotes: "" },
        { id: "cmp_2", name: "Worker", type: "worker", responsibility: "Processes jobs", technology: "", requirementRefs: [], scalingNotes: "" },
      ],
      connections: [
        { id: "conn_1", fromComponentId: "cmp_1", toComponentId: "cmp_2", kind: "async", label: "enqueue", protocol: "amqp", rationale: "Decouples bursts." },
      ],
      flows: [
        { id: "flow_1", name: "Check limit", description: "Client hits the gateway.", steps: [{ order: 1, description: "gateway checks", elementRefs: ["cmp_1"] }], requirementRefs: [] },
      ],
      technologyDecisions: [],
      scalabilityNotes: [],
      failureScenarios: [],
    },
    lld: {
      classes: [
        {
          id: "cls_1",
          name: "RateLimiter",
          kind: "class",
          responsibility: "Tracks sliding windows per key.",
          requirementRefs: ["fr_1"],
          rationale: "Window math in one place.",
          alternatives: [],
          invariants: [],
          attributes: [],
          methods: [],
        },
        {
          id: "cls_2",
          name: "AuditLog",
          kind: "interface",
          responsibility: "Records every mutation.",
          requirementRefs: ["fr_2"],
          rationale: "Traceability.",
          alternatives: [],
          invariants: [],
          attributes: [],
          methods: [],
        },
        {
          // Overflow probe: unbroken name + responsibility must wrap inside
          // the 380px popover and the 390px details sheet (no h-scroll).
          id: "cls_3",
          name: "UltraLongUnbrokenClassNameForOverflowProbingWithoutAnySpaces",
          kind: "class",
          responsibility:
            "UltraLongUnbrokenResponsibilityLineForOverflowProbingWithoutAnySpacesEither",
          requirementRefs: ["fr_1"],
          rationale: "Probe.",
          alternatives: [],
          invariants: [],
          attributes: [],
          methods: [],
        },
      ],
      relationships: [
        { id: "rel_1", kind: "association", sourceId: "cls_1", targetId: "cls_2", sourceMultiplicity: "1", targetMultiplicity: "0..*", label: "", rationale: "Limit checks are logged." },
      ],
      patterns: [],
    },
    dsa: {
      recommendations: [
        {
          id: "dsa_1",
          operation: "check rate limit",
          layer: "lld",
          dataStructure: "ring buffer",
          algorithm: "sliding window counter",
          complexity: { average: "O(1)", worst: "O(1)", notes: "" },
          rationale: "Constant memory.",
          requirementRefs: [],
          assumptions: [],
          alternatives: [],
          limitations: [],
        },
      ],
      algorithmicPatterns: [],
    },
    learningSteps: [{ id: "step_1", title: "t", explanation: "e", elementRefs: ["cmp_1"] }],
  };
  const ARCH = {
    version: {
      id: "ver_rel",
      projectId: "proj_1",
      version: 1,
      createdAt: "2026-02-01T10:00:00.000Z",
      model: MODEL,
      validation: { valid: true, errors: [], warnings: [], validatedAt: "t" },
    },
  };
  const PROJECT = {
    id: "proj_1",
    idea: "Cross-view fixture",
    ownerId: USER.id,
    status: "architecture_ready",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-02-01T00:00:00.000Z",
    confirmedAt: "2026-01-05T00:00:00.000Z",
    currentArchitectureVersion: 1,
  };
  const envelope = (data: unknown) =>
    JSON.stringify({ status: true, statusCode: 200, data });
  // Register the catch-all first: Playwright matches handlers in reverse
  // registration order, so the specific routes below must come last.
  await page.route("**/api/projects/proj_1", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: envelope(PROJECT) }),
  );
  await page.route("**/api/projects/proj_1/architecture", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: envelope(ARCH) }),
  );
  await page.route("**/api/users/me/provider-config", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: envelope({ config: { provider: "openrouter", model: "m", updatedAt: "t" } }),
    }),
  );
  mockAuthRoutes(page, USER);
  await page.addInitScript(`
    window.sessionStorage.setItem("sda:auth:user", JSON.stringify({ user: ${JSON.stringify(USER)} }));
    window.sessionStorage.setItem("sda:project:proj_1:access-key", "projkey_rel");
  `);

  await page.goto("/projects/proj_1/workspace");
  await expect(page.getByRole("tab", { name: "LLD" })).toBeVisible({ timeout: 20_000 });

  const details = page.locator('[aria-label="Element details"]');
  const gatewayOutline = () =>
    page
      .getByRole("navigation", { name: "HLD outline" })
      .getByRole("button", { name: /Gateway/ });

  // HLD view → select the gateway component from the outline.
  await page.getByRole("tab", { name: "HLD" }).click();
  await gatewayOutline().click();
  await expect(details.locator('[aria-label="Details for Gateway"]')).toBeVisible();

  // Related classes: only the fr_1 twin — never the fr_2 class by name.
  await expect(
    details.getByRole("button", { name: /RateLimiter/ }),
  ).toBeVisible();
  await expect(details.getByRole("button", { name: /AuditLog/ })).toHaveCount(0);

  // A component with no requirement refs shows the honest empty state.
  await page
    .getByRole("navigation", { name: "HLD outline" })
    .getByRole("button", { name: /Worker/ })
    .click();
  await expect(details.getByText("No requirement-linked classes.")).toBeVisible();

  // The jump: click the related class → LLD view, class selected.
  await gatewayOutline().click();
  await details.getByRole("button", { name: /RateLimiter/ }).click();
  await expect(page.getByRole("tab", { name: "LLD" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(details.locator('[aria-label="Details for RateLimiter"]')).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "LLD outline" })
      .getByRole("button", { name: /RateLimiter/ }),
  ).toHaveAttribute("aria-pressed", "true");
  // Focus lands on the named inner container, not the generic region.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.activeElement?.getAttribute("aria-label") ??
          document.activeElement?.getAttribute("aria-labelledby") ??
          "",
      ),
    )
    .toBe("Details for RateLimiter");

  // Symmetric jump back: class details offer the linked component.
  const backToGateway = details.getByRole("button", { name: /Gateway/ });
  await expect(backToGateway).toBeVisible();
  await backToGateway.click();
  await expect(page.getByRole("tab", { name: "HLD" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(details.locator('[aria-label="Details for Gateway"]')).toBeVisible();

  // Phone details sheet: related chips wrap, no horizontal overflow at 390.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("main").getByRole("button", { name: "Details" }).click();
  const sheet = page.getByRole("dialog", { name: "Details" });
  await expect(sheet.getByRole("button", { name: /RateLimiter/ })).toBeVisible();
  // Long unbroken name must stay inside the sheet scroller.
  const probe = sheet.getByRole("button", {
    name: /UltraLongUnbrokenClassNameForOverflowProbingWithoutAnySpaces/,
  });
  await expect(probe).toBeVisible();
  const sheetOverflow = await sheet.evaluate((root) => {
    // overflow-y: auto forces overflow-x to auto too, so overflow shows here.
    const scroller = root.querySelector<HTMLElement>(".overflow-y-auto") ?? root;
    return scroller.scrollWidth - scroller.clientWidth;
  });
  expect(sheetOverflow).toBeLessThanOrEqual(0);
  await noOverflow(page, 390);
});

test("regeneration scopes start their own run", async ({ page }) => {
  const calls: Array<{ body: unknown }> = [];
  await journeyToWorkspace(page);

  await page.route("**/api/projects/*/architecture/regenerate", async (route) => {
    calls.push({ body: route.request().postDataJSON() });
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
  await expect(menu.getByText(/every scope is its own paid run/i)).toBeVisible();
  await menu.getByRole("menuitem", { name: /LLD only/ }).click();

  await expect.poll(() => calls.length).toBe(1);
  expect(calls[0]?.body).toEqual({ scope: "lld" });
  await expect(page.getByRole("menu", { name: "Regenerate" })).toBeHidden();
  await noOverflow(page, 900);
});

test("regeneration keeps running after closing the overlay and clears when terminal", async ({
  page,
}) => {
  await journeyToWorkspace(page);
  const projectId = page.url().split("/projects/")[1].split("/")[0];

  let status = "running";
  const envelope = (data: unknown) =>
    JSON.stringify({ status: true, statusCode: 200, data });
  const runDto = () => ({
    id: "run_ux_close",
    projectId,
    type: "architecture",
    status,
    provider: "openrouter",
    model: "z-ai/glm-5.3-flash",
    scope: "lld",
    stages: [],
    error: null,
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    createdAt: "2026-01-01T00:00:00.000Z",
    startedAt: "2026-01-01T00:00:00.000Z",
    finishedAt: null,
  });

  await page.route("**/api/projects/*/architecture/regenerate", (route) =>
    route.fulfill({
      status: 202,
      contentType: "application/json",
      body: envelope({ runId: "run_ux_close" }),
    }),
  );
  // No stream: 404 sends useRunLive to its polling fallback, which polls the
  // run DTO below (the same shape the dashboard reads).
  await page.route("**/api/runs/run_ux_close/events*", (route) =>
    route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({
        status: false,
        statusCode: 404,
        message: "not found",
        error: { code: "RUN_NOT_FOUND" },
      }),
    }),
  );
  await page.route("**/api/runs/run_ux_close", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: envelope(runDto()),
    }),
  );

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Regenerate" }).click();
  await page
    .getByRole("menu", { name: "Regenerate" })
    .getByRole("menuitem", { name: /LLD only/ })
    .click();

  const dialog = page.getByRole("dialog", { name: "Regenerating the architecture" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/Closing does not cancel this run/)).toBeVisible();

  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();
  const indicator = page.getByRole("button", { name: /Regeneration running/ });
  await expect(indicator).toBeVisible();
  await noOverflow(page, 1440);

  // The compact header control reopens the same live panel.
  await indicator.click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(indicator).toBeVisible();

  // Failed while closed: the indicator clears instead of sticking forever.
  status = "failed";
  await expect(indicator).toBeHidden({ timeout: 20_000 });
});
