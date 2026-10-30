/**
 * Responsive overflow regressions (D2/D3): the workspace header and the
 * requirements editor footer must not create horizontal scroll at 390px.
 * The workspace page needs a real model, the requirements page a spec — both
 * intercepted with contract-shaped fixtures.
 */
import { expect, test, type Page } from "@playwright/test";
import { mockAuthRoutes } from "./helpers";

test.use({ viewport: { width: 390, height: 844 } });

const USER = {
  id: "usr_fit01",
  email: "fit@example.com",
  planTier: "free",
  emailVerifiedAt: "2026-01-01T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const AUTH_SEED = `
  window.sessionStorage.setItem("sda:auth:user", JSON.stringify({ user: ${JSON.stringify(USER)} }));
  window.sessionStorage.setItem("sda:project:proj_1:access-key", "projkey_fit");
`;

const PROJECT = {
  id: "proj_1",
  idea: "Design a sliding-window rate limiter.",
  ownerId: USER.id,
  status: "architecture_ready",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-02-01T00:00:00.000Z",
  confirmedAt: "2026-01-05T00:00:00.000Z",
  currentArchitectureVersion: 1,
};

const SPEC = {
  functional: [{ id: "fr_1", kind: "functional", text: "Clients can submit ideas", priority: "must" }],
  nonFunctional: [
    {
      id: "nfr_1",
      kind: "nonfunctional",
      text: "Respond under 200ms",
      priority: "should",
      category: "performance",
      target: "p95 < 200ms",
    },
  ],
  assumptions: [{ id: "asm_1", text: "Single region deployment" }],
  clarifications: [{ id: "q_1", question: "Which cloud?", answer: "AWS" }],
};

const MODEL = {
  meta: { title: "Rate Limiter", summary: "Sliding-window limiter at the gateway." },
  requirements: { confirmedAt: "2026-01-05T00:00:00.000Z", spec: SPEC },
  hld: {
    components: [
      { id: "cmp_1", name: "Gateway", type: "gateway", responsibility: "Accepts and checks calls", technology: "nginx", requirementRefs: ["fr_1"], scalingNotes: "" },
    ],
    connections: [
      { id: "conn_1", fromComponentId: "cmp_1", toComponentId: "cmp_1", kind: "sync", label: "check limit", protocol: "http", rationale: "Inline check keeps latency low." },
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
        rationale: "Keeps window math in one place.",
        alternatives: [],
        invariants: [],
        attributes: [{ name: "windowSeconds", type: "number", visibility: "private", static: false, description: "" }],
        methods: [{ name: "allow", signature: "allow(key: string): boolean", visibility: "public", description: "" }],
      },
    ],
    relationships: [
      { id: "rel_1", kind: "association", sourceId: "cls_1", targetId: "cls_1", sourceMultiplicity: "1", targetMultiplicity: "0..*", label: "", rationale: "Key maps to counters." },
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
        complexity: { average: "O(1)", worst: "O(1)", notes: "Fixed bucket count." },
        rationale: "Constant memory per key.",
        requirementRefs: [],
        assumptions: [],
        alternatives: [],
        limitations: [],
      },
    ],
    algorithmicPatterns: [],
  },
  learningSteps: [
    { id: "step_1", title: "Window math", explanation: "Buckets roll every second.", elementRefs: ["cls_1"] },
  ],
};

const ARCH = {
  version: {
    id: "ver_1",
    projectId: "proj_1",
    version: 1,
    createdAt: "2026-02-01T10:00:00.000Z",
    model: MODEL,
    validation: { valid: true, errors: [], warnings: [], validatedAt: "t" },
  },
};

const envelope = (data: unknown, code = 200) => ({ status: true, statusCode: code, data });

function intercept(page: Page, projectStatus: string, requirements: unknown): void {
  page.route("**/api/projects/proj_1/architecture", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(envelope(ARCH)),
    }),
  );
  page.route("**/api/projects/proj_1/requirements", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(envelope(requirements)),
    }),
  );
  page.route("**/api/projects/proj_1", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(envelope({ ...PROJECT, status: projectStatus })),
    }),
  );
  mockAuthRoutes(page, USER);
}

async function expectOverflowFree(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow, `${label} overflows horizontally by ${overflow}px at 390px`).toBeLessThanOrEqual(0);
}

/** Role-based so the hidden/inert dock copy of the trigger never matches. */
const providerTrigger = (page: Page) =>
  page.getByRole("button", { name: /Provider (setup|ready)/ });

test("workspace header fits 1440/1280/834/390 (D2)", async ({ page }) => {
  intercept(page, "architecture_ready", { spec: SPEC, confirmedAt: "2026-01-05T00:00:00.000Z" });
  await page.addInitScript(AUTH_SEED);
  await page.goto("/projects/proj_1/workspace");
  await expect(page.getByRole("tab", { name: "LLD" })).toBeVisible({ timeout: 20_000 });
  // Provider setup is a landing/library affordance only.
  await expect(providerTrigger(page)).toHaveCount(0);
  for (const width of [1440, 1280, 834, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expectOverflowFree(page, `workspace ${width}`);
  }
});

test("requirements page has no provider setup button", async ({ page }) => {
  intercept(page, "requirements_ready", { spec: SPEC, confirmedAt: null });
  await page.addInitScript(AUTH_SEED);
  await page.goto("/projects/proj_1/requirements");
  await expect(page.getByRole("button", { name: "Confirm & generate architecture" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(providerTrigger(page)).toHaveCount(0);
});

test("requirements editor footer fits 390px (D3)", async ({ page }) => {
  intercept(page, "requirements_ready", { spec: SPEC, confirmedAt: null });
  await page.addInitScript(AUTH_SEED);
  await page.goto("/projects/proj_1/requirements");
  await expect(page.getByRole("button", { name: "Confirm & generate architecture" })).toBeVisible({
    timeout: 20_000,
  });
  await expectOverflowFree(page, "requirements");
});

test("library header fits 390px and provider setup lives in the menu", async ({ page }) => {
  await page.route(/\/api\/projects\?/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(envelope({ projects: [], nextCursor: null })),
    }),
  );
  mockAuthRoutes(page, USER);
  await page.addInitScript(AUTH_SEED);
  await page.goto("/library");
  await expect(page.getByRole("heading", { name: "Project library" })).toBeVisible();
  await expectOverflowFree(page, "library");

  // Below lg the header collapses into a hamburger sheet: that is where the
  // library exposes provider setup on a phone.
  await page.getByRole("button", { name: "Open navigation menu" }).click();
  const sheet = page.getByRole("dialog", { name: "Navigation" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("button", { name: /Provider (setup|ready)/ })).toBeVisible();
  await expectOverflowFree(page, "library (menu open)");
});

test("landing header fits 390px with the compact provider trigger", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(providerTrigger(page)).toBeVisible();
  await expectOverflowFree(page, "landing");
});
