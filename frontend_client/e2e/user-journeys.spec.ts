/**
 * User/auth round journeys: register/login/logout, session restoration,
 * project library, provider settings, user preferences, dashboard, and
 * plan/error paths. New user endpoints are intercepted at the network
 * boundary with contract-shaped envelopes — the mock backend does not
 * implement these controllers yet (contract-committed, backend pending).
 * The existing project pipeline journeys keep using the live mock backend.
 */

import { expect, test, type Page, type Route } from "@playwright/test";
import { fillAuthForm, mockAuthRoutes, PROVIDER_SETUP_SEED } from "./helpers";

const USER = {
  id: "usr_probe001",
  email: "probe@example.com",
  planTier: "pro",
  emailVerifiedAt: "2026-01-01T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const AUTH = {
  user: USER,
  accessToken: "token_probe_001",
  tokenType: "Bearer" as const,
  expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
};

const MODEL = {
  meta: { title: "Library fixture", summary: "Fixture model." },
  requirements: {
    confirmedAt: "t",
    spec: {
      functional: [{ id: "fr_probe", kind: "functional", text: "p", priority: "must" }],
      nonFunctional: [],
      assumptions: [],
      clarifications: [],
    },
  },
  hld: {
    components: [
      { id: "cmp_probe", name: "Gateway", type: "gateway", responsibility: "Routes calls", technology: "nginx", requirementRefs: ["fr_probe"], scalingNotes: "" },
    ],
    connections: [
      { id: "conn_probe", fromComponentId: "cmp_probe", toComponentId: "cmp_probe", kind: "sync", label: "check", protocol: "http", rationale: "Inline" },
    ],
    flows: [
      { id: "flow_probe", name: "Check", description: "A call is checked.", steps: [{ order: 1, description: "gateway checks", elementRefs: ["cmp_probe"] }], requirementRefs: [] },
    ],
    technologyDecisions: [],
    scalabilityNotes: [],
    failureScenarios: [],
  },
  lld: {
    classes: [
      {
        id: "cls_probe",
        name: "Limiter",
        kind: "class",
        responsibility: "Counts calls",
        requirementRefs: ["fr_probe"],
        rationale: "One owner",
        alternatives: [],
        invariants: [],
        attributes: [],
        methods: [],
      },
    ],
    relationships: [
      { id: "rel_probe", kind: "association", sourceId: "cls_probe", targetId: "cls_probe", sourceMultiplicity: "1", targetMultiplicity: "0..*", label: "", rationale: "Refers" },
    ],
    patterns: [],
  },
  dsa: {
    recommendations: [
      {
        id: "dsa_probe",
        operation: "count",
        layer: "lld",
        dataStructure: "ring buffer",
        algorithm: "sliding window",
        complexity: { average: "O(1)", worst: "O(1)", notes: "" },
        rationale: "Constant",
        requirementRefs: [],
        assumptions: [],
        alternatives: [],
        limitations: [],
      },
    ],
    algorithmicPatterns: [],
  },
  learningSteps: [{ id: "step_1", title: "t", explanation: "e", elementRefs: ["cmp_probe"] }],
};
const MODEL_FIXTURE = {
  version: {
    id: "ver1",
    projectId: "proj_1",
    version: 1,
    createdAt: "t",
    model: MODEL,
    validation: { valid: true, errors: [], warnings: [], validatedAt: "t" },
  },
};

/** Contract-shaped spec so the editor phase (and its gate) renders. */
const REQUIREMENTS_SPEC = {
  functional: [
    { id: "fr_1", kind: "functional", text: "Clients submit a request", priority: "must" },
  ],
  nonFunctional: [
    {
      id: "nfr_1",
      kind: "nonfunctional",
      text: "Answer under 200ms",
      priority: "should",
      category: "performance",
      target: "p95 < 200ms",
    },
  ],
  assumptions: [{ id: "asm_1", text: "Single region" }],
  clarifications: [{ id: "q_1", question: "Which cloud?", answer: "AWS" }],
};

type RouteLike = Route;
const envelope = (data: unknown, code = 200) => ({ status: true, statusCode: code, data });
const oh = (data: unknown, code = 200) =>
  (route: RouteLike) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(envelope(data, code)) });
const ofail = (code: string, message: string, statusCode: number) =>
  (route: RouteLike) => route.fulfill({ status: statusCode, contentType: "application/json", body: JSON.stringify({ status: false, statusCode, message, error: { code } }) });

/** The page's own alert, excluding Next's route announcer (same role). */
const alertBox = (page: Page) =>
  page.locator('[role="alert"]:not([id="__next-route-announcer__"])');

const PROJECT = {
  id: "proj_1",
  idea: "Probe project one",
  ownerId: USER.id,
  status: "architecture_ready",
  createdAt: "t",
  updatedAt: "t",
  confirmedAt: "t",
  currentArchitectureVersion: 1,
};
const LIBRARY_PAGE = { projects: [PROJECT], nextCursor: null };
const PROVIDERS = {
  providers: [
    { id: "openrouter", models: ["z-ai/glm-5.3-flash", "openai/gpt-5"], supportsStructuredOutput: true },
    { id: "groq", models: ["openai/gpt-oss-120b", "llama-3.1-8b-instant"], supportsStructuredOutput: true },
  ],
  defaultProvider: "openrouter",
  defaultModel: "z-ai/glm-5.3-flash",
  mock: true,
};
const DASHBOARD = {
  range: "last_30_days",
  generatedAt: "t",
  usage: { promptTokens: 1200, completionTokens: 3400, totalTokens: 4600, runCount: 12, projectCount: 2 },
  buckets: [{ periodStart: "t0", periodEnd: "t1", promptTokens: 1200, completionTokens: 3400, totalTokens: 4600, runCount: 12, projectCount: 2 }],
  topModels: [{ provider: "openrouter", model: "z-ai/glm-5.3-flash", promptTokens: 1200, completionTokens: 3400, totalTokens: 4600, runCount: 12 }],
  recentRuns: [
    { id: "run_1", projectId: "proj_1", type: "architecture", status: "succeeded", provider: "openrouter", model: "z-ai/glm-5.3-flash", createdAt: "2026-04-01T10:00:00.000Z", finishedAt: "2026-04-01T10:00:10.000Z" },
  ],
};

function interceptUserEndpoints(
  page: Page,
  overrides: {
    dashboard?: (route: RouteLike) => void;
    projects?: (route: RouteLike) => void;
    login?: (route: RouteLike) => void;
    register?: (route: RouteLike) => void;
  } = {},
): void {
  page.route("**/api/auth/register", overrides.register ?? oh(AUTH, 201));
  page.route("**/api/auth/login", overrides.login ?? oh(AUTH));
  page.route("**/api/dashboard?*", overrides.dashboard ?? oh(DASHBOARD));
  page.route("**/api/dashboard", overrides.dashboard ?? oh(DASHBOARD));
  page.route("**/api/projects?*", overrides.projects ?? oh(LIBRARY_PAGE));
  page.route("**/api/providers", oh(PROVIDERS));
  page.route("**/api/users/me/provider-config", oh({ config: { provider: "openrouter", model: "z-ai/glm-5.3-flash", updatedAt: "t" } }));
  page.route("**/api/users/me/preferences", oh({ preferences: { theme: "dark" } }));
  page.route("**/api/billing/plans", oh({ plans: [], provider: "stub", checkoutCompletable: true }));
  page.route("**/api/billing/subscription", oh({ subscription: null, planTier: "free" }));
  page.route("**/api/auth/resend-verification", oh({}));
  page.route("**/api/projects/proj_1/architecture", oh(MODEL_FIXTURE));
  page.route("**/api/projects/proj_2/architecture", oh(MODEL_FIXTURE));
  mockAuthRoutes(page, USER);
}

const AUTH_SAVE = `
  window.sessionStorage.setItem("sda:auth:user", JSON.stringify({ user: ${JSON.stringify(USER)} }));
`;

/** Seeds once: a later navigation (e.g. the 401 redirect) must not re-create
 *  the identity that the app just discarded. */
const AUTH_SAVE_ONCE = `
  if (window.sessionStorage.getItem("sda:auth:seeded") === null) {
    window.sessionStorage.setItem("sda:auth:seeded", "1");
    window.sessionStorage.setItem("sda:auth:user", JSON.stringify({ user: ${JSON.stringify(USER)} }));
  }
`;

test.describe("register / login / logout / restore", () => {
  test("login throttle shows neutral copy, not the generation message", async ({ page }) => {
    interceptUserEndpoints(page, { login: ofail("QUOTA_EXCEEDED", "Too many attempts", 429) });
    await page.goto("/login");
    await fillAuthForm(page, "probe@example.com", "supersecret1");
    await page.getByRole("button", { name: "Sign in" }).click();

    const alert = page.getByRole("main").getByRole("alert");
    await expect(alert).toContainText("Too many requests. Wait a moment and try again.");
    await expect(alert).not.toContainText("Generation limit");
  });

  test("register lands on the library with the Bearer header attached", async ({ page }) => {
    const authHeaders: string[] = [];
    page.on("request", (request) => {
      const header = request.headers()["authorization"];
      if (header !== undefined) authHeaders.push(header);
    });
    interceptUserEndpoints(page);
    await page.addInitScript(AUTH_SAVE.replace("sda:auth:user", "sda:none")); // keep storage empty pre-login
    await page.goto("/login");
    await page.getByRole("tab", { name: "Create account" }).click();
    await fillAuthForm(page, "probe@example.com", "supersecret1", { confirm: true, mode: "register" });
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page).toHaveURL(/\/library$/);
    await expect(page.getByText("Probe project one")).toBeVisible();
    expect(authHeaders).toContain("Bearer token_probe_001");
    await expect(page.locator("header").getByText("probe@example.com")).toBeVisible();
    // plan tier badge
    await expect(page.locator("header").getByText(/^pro$/).first()).toBeVisible();
  });

  test("login invalid credentials maps the error", async ({ page }) => {
    interceptUserEndpoints(page, { login: ofail("AUTH_INVALID_CREDENTIALS", "bad", 401) });
    await page.goto("/login");
    await fillAuthForm(page, "probe@example.com", "wrongpass1");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(
      page.getByRole("tabpanel", { name: "Sign in" }).getByRole("alert"),
    ).toContainText("incorrect");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("register duplicate email maps the error", async ({ page }) => {
    interceptUserEndpoints(page, { register: ofail("AUTH_EMAIL_TAKEN", "taken", 409) });
    await page.goto("/login");
    await page.getByRole("tab", { name: "Create account" }).click();
    await fillAuthForm(page, "probe@example.com", "supersecret1", { confirm: true, mode: "register" });
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(
      page.getByRole("tabpanel", { name: "Create account" }).getByRole("alert"),
    ).toContainText("already registered");
  });

  test("auth-required idea submit stashes the idea and rides to login", async ({ page }) => {
    // Backend enforces signed-in design sessions (policy: require auth, keep key access).
    page.route("**/api/projects", (route) => {
      if (route.request().method() === "POST") {
        return ofail("AUTH_REQUIRED", "auth", 401)(route);
      }
      return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
    });
    await page.goto("/");
    await page.getByLabel("Your system idea").fill("Design a rate limiter");
    await page.getByRole("button", { name: "Start design session" }).click();

    await expect(page).toHaveURL(/\/login\?next=(\/|%2F)$/);
    await expect(page.getByText("Your idea is saved in this tab")).toBeVisible();
    // the slot survives without a sign-in: landing restores it too
    await page.goBack();
    await expect(page.getByLabel("Your system idea")).toHaveValue("Design a rate limiter");
  });

  test("signing in completes the design hand-off (idea pre-filled)", async ({ page }) => {
    page.route("**/api/projects", (route) => {
      if (route.request().method() === "POST") {
        return ofail("AUTH_REQUIRED", "auth", 401)(route);
      }
      return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
    });
    interceptUserEndpoints(page);
    await page.goto("/");
    await page.getByLabel("Your system idea").fill("Design a rate limiter");
    await page.getByRole("button", { name: "Start design session" }).click();
    await expect(page).toHaveURL(/\/login/);

    await fillAuthForm(page, "probe@example.com", "supersecret1");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByLabel("Your system idea")).toHaveValue("Design a rate limiter");
  });
});

test.describe("session restore + project library", () => {
  test("restored session opens the library without re-login", async ({ page }) => {
    interceptUserEndpoints(page);
    await page.addInitScript(AUTH_SAVE);
    await page.goto("/library");
    await expect(page.getByText("Probe project one")).toBeVisible();
    await expect(page.getByText("Architecture ready").first()).toBeVisible();
    // Provider setup lives on the landing + library pages only.
    await expect(page.getByRole("button", { name: /Provider (setup|ready)/ })).toBeVisible();
  });

  test("status filter requests the filtered list", async ({ page }) => {
    const requested: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/projects?")) requested.push(request.url());
    });
    interceptUserEndpoints(page);
    await page.addInitScript(AUTH_SAVE);
    await page.goto("/library");
    await expect(page.getByText("Probe project one")).toBeVisible();
    await page.getByRole("button", { name: "Confirmed" }).click();
    await expect.poll(() => requested.some((url) => url.includes("status=requirements_confirmed"))).toBe(true);
  });

  test("anonymous visitors of the gated page ride to login", async ({ page }) => {
    await page.goto("/library");
    await expect(page).toHaveURL(/\/login\?next=(\/|%2F)library$/);
  });

  test("failed refresh signs the tab out and returns to login", async ({ page }) => {
    interceptUserEndpoints(page);
    // Registered after the shared mocks so this 401 wins the route match.
    await page.route("**/api/auth/refresh", (route) =>
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({
          status: false,
          statusCode: 401,
          message: "Refresh token reuse detected.",
          error: { code: "AUTH_INVALID_CREDENTIALS", details: { reason: "reuse" } },
        }),
      }),
    );
    await page.addInitScript(AUTH_SAVE);
    await page.goto("/library");
    await expect(page).toHaveURL(/\/login/);
    await expect
      .poll(() =>
        page.evaluate(() => window.sessionStorage.getItem("sda:auth:user")),
      )
      .toBeNull();
  });

  test("invalid stored identity is not restored", async ({ page, context }) => {
    await context.addInitScript(`
      window.sessionStorage.setItem("sda:auth:user", JSON.stringify({
        user: { id: "usr_broken" },
      }));
    `);
    interceptUserEndpoints(page);
    await page.goto("/library");
    await expect(page).toHaveURL(/\/login/);
    await expect
      .poll(() =>
        page.evaluate(() => window.sessionStorage.getItem("sda:auth:user")),
      )
      .toBeNull();
  });
});

test.describe("provider settings + preferences", () => {
  test("saved configuration loads, updates, and validates", async ({ page }) => {
    interceptUserEndpoints(page);
    await page.addInitScript(AUTH_SAVE);
    await page.goto("/settings");

    // Base UI Select trigger is a combobox button, not an input; providers are
    // shown by name, never by raw id.
    await expect(page.getByRole("combobox", { name: "Provider" })).toHaveText(/OpenRouter/);
    await expect(page.getByRole("combobox", { name: "Model" })).toHaveText(/z-ai\/glm-5.3-flash/);
    // Dead controls are gone: no theme switch, no reasoning field, no second
    // provider/model editor in a "Preferences" card.
    await expect(page.getByLabel(/Reasoning effort/)).toHaveCount(0);
    await expect(page.getByRole("region", { name: "User preferences" })).toHaveCount(0);
    await expect(page.getByLabel("Theme")).toHaveCount(0);
    await expect(page.getByLabel("Default provider")).toHaveCount(0);

    // Model options come from the selected provider.
    await page.getByRole("combobox", { name: "Model" }).click();
    await page.getByRole("option", { name: "openai/gpt-5" }).click();
    await page.getByRole("button", { name: "Save configuration" }).click();
    await expect(page.getByRole("status").last()).toContainText("Saved");
  });

  test("model list follows the provider and locks without one", async ({ page }) => {
    let saved: unknown = null;
    interceptUserEndpoints(page);
    page.route("**/api/users/me/provider-config", (route) => {
      if (route.request().method() === "PUT") {
        saved = route.request().postDataJSON();
        return oh({ config: { provider: "groq", model: "openai/gpt-oss-120b", updatedAt: "t" } })(route);
      }
      return ofail("PROVIDER_CONFIG_NOT_FOUND", "not set", 404)(route);
    });
    await page.addInitScript(AUTH_SAVE);
    await page.goto("/settings");

    // No saved config: nothing to pick a model for yet.
    await expect(page.getByRole("combobox", { name: "Model" })).toBeDisabled();

    await page.getByRole("combobox", { name: "Provider" }).click();
    await page.getByRole("option", { name: "Groq" }).click();
    await expect(page.getByRole("combobox", { name: "Model" })).toBeEnabled();
    await page.getByRole("combobox", { name: "Model" }).click();
    await page.getByRole("option", { name: "openai/gpt-oss-120b" }).click();
    await expect(page.getByRole("combobox", { name: "Model" })).toHaveText(/openai\/gpt-oss-120b/);

    await page.getByRole("button", { name: "Save configuration" }).click();
    await expect(page.getByRole("status").last()).toContainText("Saved");
    // The saved payload carries provider/model only — never a key.
    expect(saved).toEqual({ provider: "groq", model: "openai/gpt-oss-120b" });
  });

  test("provider dialog picks provider, key, and model per provider", async ({ page }) => {
    const savedBodies: unknown[] = [];
    interceptUserEndpoints(page);
    page.route("**/api/users/me/provider-config", (route) => {
      if (route.request().method() === "PUT") {
        savedBodies.push(route.request().postDataJSON());
        return oh({ config: { provider: "openrouter", model: "z-ai/glm-5.3-flash", updatedAt: "t" } })(route);
      }
      return oh({ config: { provider: "openrouter", model: "z-ai/glm-5.3-flash", updatedAt: "t" } })(route);
    });
    await page.addInitScript(AUTH_SAVE);
    await page.goto("/library");

    await page.getByRole("button", { name: /Provider (setup|ready)/ }).click();
    const provider = page.getByRole("combobox", { name: "Provider" });
    const model = page.getByRole("combobox", { name: "Model" });
    const apiKey = page.getByLabel("API key");

    await expect(provider).toHaveText(/OpenRouter/);
    await expect(model).toBeDisabled();
    await expect(apiKey).toBeEmpty();
    // Settings saved provider/model pre-fills the dialog: one shared source.
    await expect(model).toHaveText(/z-ai\/glm-5.3-flash/);

    await apiKey.fill("sk-or-test-key-0123456789");
    await expect(model).toBeEnabled();
    await expect(model).toHaveText(/z-ai\/glm-5.3-flash/);

    // The other provider has no key yet: its key slot is empty and the model
    // dropdown locks again — the OpenRouter key is not overwritten.
    await provider.click();
    await page.getByRole("option", { name: "Groq" }).click();
    await expect(apiKey).toBeEmpty();
    await expect(model).toBeDisabled();

    await provider.click();
    await page.getByRole("option", { name: "OpenRouter" }).click();
    await expect(apiKey).toHaveValue("sk-or-test-key-0123456789");

    await page.getByRole("button", { name: "Save for this session" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByRole("button", { name: /Provider (setup|ready)/ })).toHaveText(/Provider ready/);
    // Signed in: the choice lands server-side without the key.
    expect(savedBodies).toEqual([
      { provider: "openrouter", model: "z-ai/glm-5.3-flash" },
    ]);
  });

  test("settings and dialog agree on a saved model missing from the catalog", async ({ page }) => {
    interceptUserEndpoints(page);
    // The account saved a model the provider catalog no longer lists.
    page.route("**/api/users/me/provider-config", (route) =>
      oh({ config: { provider: "openrouter", model: "z-ai/legacy-flash", updatedAt: "t" } })(route),
    );
    await page.addInitScript(AUTH_SAVE);
    await page.goto("/settings");
    await expect(page.getByRole("combobox", { name: "Model" })).toHaveText(/z-ai\/legacy-flash/);

    // The dialog shows the same model and keeps it selectable, marked as saved.
    await page.goto("/library");
    await page.getByRole("button", { name: /Provider (setup|ready)/ }).click();
    const model = page.getByRole("combobox", { name: "Model" });
    await expect(model).toHaveText(/z-ai\/legacy-flash/);
    await page.getByLabel("API key").fill("sk-or-test-key-0123456789");
    await model.click();
    await expect(page.getByRole("option", { name: /z-ai\/legacy-flash · saved/ })).toBeVisible();
  });

  test("saved config failure maps to the message table", async ({ page }) => {
    interceptUserEndpoints(page);
    // GET must succeed (populate the form); only the PUT save fails.
    await page.route("**/api/users/me/provider-config", (route) => {
      if (route.request().method() === "PUT") {
        return ofail("VALIDATION_ERROR", "bad model", 400)(route);
      }
      return oh({ config: { provider: "openrouter", model: "z-ai/glm-5.3-flash", updatedAt: "t" } })(route);
    });
    await page.addInitScript(AUTH_SAVE);
    await page.goto("/settings");
    await expect(page.getByRole("combobox", { name: "Provider" })).toHaveText(/OpenRouter/);
    await page.getByRole("button", { name: "Save configuration" }).click();
    await expect(
      page.getByRole("region", { name: "Saved provider configuration" }).getByRole("alert"),
    ).toContainText("failed validation");
  });

  test("settings has one provider/model source (no duplicate preference fields)", async ({ page }) => {
    interceptUserEndpoints(page);
    await page.addInitScript(AUTH_SAVE);
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Generation defaults" })).toBeVisible();
    // Exactly one provider/model editor on the page.
    await expect(page.getByRole("combobox", { name: "Provider" })).toHaveCount(1);
    await expect(page.getByRole("combobox", { name: "Model" })).toHaveCount(1);
    // Preferences no longer duplicates provider/model or offers a dead theme.
    await expect(page.getByLabel("Theme")).toHaveCount(0);
    await expect(page.getByLabel("Default model")).toHaveCount(0);
    // The precedence copy explains where a run gets its choice.
    await expect(page.getByText(/fall back to its own environment defaults/)).toBeVisible();
  });
});

test.describe("requirements provider gate", () => {
  test("analysis start is blocked until provider setup exists", async ({ page }) => {
    interceptUserEndpoints(page);
    page.route("**/api/projects/proj_1", oh({ ...PROJECT, status: "requirements_pending" }));
    page.route("**/api/projects/proj_1/requirements", oh({ spec: null, confirmedAt: null }));
    await page.addInitScript(AUTH_SAVE);
    await page.goto("/projects/proj_1/requirements");

    const blocker = page.getByRole("region", { name: "Provider setup required" });
    await expect(blocker).toBeVisible();
    await expect(blocker).toContainText("Provider missing");
    await expect(blocker).toContainText("API key missing");
    const generate = page.getByRole("button", { name: "Generate requirements" });
    await expect(generate).toBeDisabled();
    await expect(page.getByText(/Add the missing provider setup above/)).toBeVisible();

    // The CTA opens the shared dialog on this page; saving the key clears the gate.
    await page.getByRole("button", { name: /Add provider & key/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByLabel("API key").fill("sk-or-e2e-key-0123456789");
    await page.getByRole("button", { name: "Save for this session" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(blocker).toHaveCount(0);
    await expect(generate).toBeEnabled();
  });

  test("confirm is disabled without provider setup and re-enabled after saving", async ({ page }) => {
    interceptUserEndpoints(page);
    page.route("**/api/projects/proj_1", oh(PROJECT));
    page.route("**/api/projects/proj_1/requirements", oh({ spec: REQUIREMENTS_SPEC, confirmedAt: "t" }));
    await page.addInitScript(AUTH_SAVE);
    await page.goto("/projects/proj_1/requirements");

    const confirm = page.getByRole("button", { name: /Confirm & generate architecture/ });
    await expect(confirm).toBeDisabled();
    await expect(
      page.getByRole("region", { name: "Provider setup required" }),
    ).toBeVisible();
    await expect(
      page.getByText(/Confirmation needs provider setup/),
    ).toBeVisible();

    await page.getByRole("button", { name: /Add provider & key/ }).click();
    await page.getByLabel("API key").fill("sk-or-e2e-key-0123456789");
    await page.getByRole("button", { name: "Save for this session" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(confirm).toBeEnabled();
    await expect(page.getByText(/Confirmation needs provider setup/)).toHaveCount(0);
  });

  test("back link points signed-in users at the library", async ({ page }) => {
    interceptUserEndpoints(page);
    page.route("**/api/projects/proj_1", oh({ ...PROJECT, status: "requirements_pending" }));
    page.route("**/api/projects/proj_1/requirements", oh({ spec: null, confirmedAt: null }));
    await page.addInitScript(AUTH_SAVE);
    await page.goto("/projects/proj_1/requirements");
    await expect(page.getByRole("link", { name: /Back to library/ })).toHaveAttribute(
      "href",
      "/library",
    );
  });

  test("back link points anonymous visitors home", async ({ page }) => {
    interceptUserEndpoints(page);
    page.route("**/api/projects/proj_1", oh({ ...PROJECT, status: "requirements_pending" }));
    page.route("**/api/projects/proj_1/requirements", oh({ spec: null, confirmedAt: null }));
    await page.addInitScript(`
      window.sessionStorage.setItem("sda:project:proj_1:access-key", "projkey_probe");
    `);
    await page.goto("/projects/proj_1/requirements");
    await expect(page.getByRole("link", { name: /Back to home/ })).toHaveAttribute("href", "/");
  });
});

test.describe("dashboard", () => {
  test("usage, models, recent runs render from the contract payload", async ({ page }) => {
    interceptUserEndpoints(page);
    await page.addInitScript(AUTH_SAVE);
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByText("12", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Usage totals" }).getByText("4,600"),
    ).toBeVisible();
    await expect(page.getByText("z-ai/glm-5.3-flash · openrouter")).toBeVisible();
    await expect(page.getByRole("region", { name: "Recent runs" }).getByText("architecture")).toBeVisible();
    await expect(page.getByRole("region", { name: "Recent runs" }).getByText("succeeded")).toBeVisible();
    // hashed ids never surface to users
    await expect(page.getByText("run_1")).toHaveCount(0);
    await expect(page.getByText("proj_1")).toHaveCount(0);
    // range switch refires with the new range
    await page.getByRole("button", { name: "Last 7 days" }).click();
    await expect(page.getByText("Last 7 days").first()).toBeVisible();
  });

  test("empty dashboard shows the no-activity state", async ({ page }) => {
    interceptUserEndpoints(page, {
      dashboard: oh({ ...DASHBOARD, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, runCount: 0, projectCount: 0 }, buckets: [], topModels: [], recentRuns: [] }),
    });
    await page.addInitScript(AUTH_SAVE);
    await page.goto("/dashboard");
    await expect(page.getByText("Nothing measured yet")).toBeVisible();
  });

  test("plan-gated data renders the upgrade message", async ({ page }) => {
    interceptUserEndpoints(page, {
      dashboard: ofail("PLAN_UPGRADE_REQUIRED", "Pro only", 402),
    });
    await page.addInitScript(AUTH_SAVE);
    await page.goto("/dashboard");
    await expect(page.getByText("Plan-gated data")).toBeVisible();
  });

  test("auth-required mid-journey signs out and returns to login", async ({ page }) => {
    interceptUserEndpoints(page, { dashboard: ofail("AUTH_REQUIRED", "gone", 401) });
    await page.addInitScript(AUTH_SAVE_ONCE);
    await page.goto("/dashboard");

    // A rejected token is a signed-out state everywhere: no page-level error
    // while the header still shows the user.
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
    await expect
      .poll(() =>
        page.evaluate(() => window.sessionStorage.getItem("sda:auth:user")),
      )
      .toBeNull();
    await expect(page.getByText("probe@example.com")).toHaveCount(0);
  });

  test("401 from the library clears the session and redirects", async ({ page }) => {
    interceptUserEndpoints(page);
    page.route("**/api/projects?*", ofail("AUTH_REQUIRED", "gone", 401));
    await page.addInitScript(AUTH_SAVE_ONCE);
    await page.goto("/library");

    await expect(page).toHaveURL(/\/login\?next=%2Flibrary$/);
    await expect
      .poll(() =>
        page.evaluate(() => window.sessionStorage.getItem("sda:auth:user")),
      )
      .toBeNull();
    await expect(page.getByText("probe@example.com")).toHaveCount(0);
  });

  test("401 from settings clears the session and redirects", async ({ page }) => {
    interceptUserEndpoints(page);
    page.route("**/api/users/me/provider-config", ofail("AUTH_REQUIRED", "gone", 401));
    await page.addInitScript(AUTH_SAVE_ONCE);
    await page.goto("/settings");

    await expect(page).toHaveURL(/\/login\?next=%2Fsettings$/);
    await expect
      .poll(() =>
        page.evaluate(() => window.sessionStorage.getItem("sda:auth:user")),
      )
      .toBeNull();
    await expect(page.getByText("probe@example.com")).toHaveCount(0);
  });
});

test.describe("unblocked path journeys", () => {
  test("library pagination loads the next cursor page", async ({ page }) => {
    interceptUserEndpoints(page);
    page.route("**/api/projects?*", (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get("cursor") === null) {
        return oh({ projects: [PROJECT], nextCursor: "cursor_1" })(route);
      }
      return oh({
        projects: [{ ...PROJECT, id: "proj_2", idea: "Probe project two" }],
        nextCursor: null,
      })(route);
    });
    await page.addInitScript(AUTH_SAVE);
    await page.goto("/library");

    await expect(page.getByText("Probe project one")).toBeVisible();
    const loadMore = page.getByRole("button", { name: "Load more" });
    await expect(loadMore).toBeVisible();
    await loadMore.click();
    await expect(page.getByText("Probe project two")).toBeVisible();
    await expect(loadMore).toBeHidden();
  });

  test("regenerate sends the saved provider and model (key stays a header)", async ({ page }) => {
    const calls: Array<{ body: unknown; key: string | undefined }> = [];
    interceptUserEndpoints(page);
    page.route("**/api/projects/proj_1", oh(PROJECT));
    page.route("**/api/projects/proj_1/architecture/regenerate", (route) => {
      calls.push({
        body: route.request().postDataJSON(),
        key: route.request().headers()["x-provider-api-key"],
      });
      return oh({ runId: "run_regen" }, 202)(route);
    });
    await page.addInitScript(`
      window.sessionStorage.setItem("sda:auth:user", JSON.stringify({
        user: ${JSON.stringify(USER)},
        accessToken: "token_probe_001",
        expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      }));
      window.sessionStorage.setItem("sda:provider-setup", JSON.stringify({
        provider: "groq",
        model: "openai/gpt-oss-120b",
        keys: { groq: "gsk_probe_key" },
      }));
    `);
    await page.goto("/projects/proj_1/workspace");

    await page.getByRole("button", { name: "Regenerate" }).click();
    await page.getByRole("menuitem", { name: /LLD only/ }).click();

    await expect.poll(() => calls.length).toBe(1);
    expect(calls[0]?.body).toEqual({
      scope: "lld",
      provider: "groq",
      model: "openai/gpt-oss-120b",
    });
    expect(calls[0]?.key).toBe("gsk_probe_key");
  });

  test("RUN_CONFLICT on run start maps to the wait message", async ({ page }) => {
    interceptUserEndpoints(page);
    page.route("**/api/projects/proj_1/requirements", (route) => {
      if (route.request().method() === "POST") {
        return ofail("RUN_CONFLICT", "running", 409)(route);
      }
      return oh({ spec: null, confirmedAt: null })(route);
    });
    page.route("**/api/projects/proj_1", oh({ ...PROJECT, status: "requirements_pending" }));
    await page.addInitScript(AUTH_SAVE);
    await page.addInitScript(PROVIDER_SETUP_SEED);
    await page.goto("/projects/proj_1/requirements");

    await page.getByRole("button", { name: "Generate requirements" }).click();
    await expect(alertBox(page)).toContainText("already running");
  });

  test("QUOTA_EXCEEDED on run start maps to the limit message", async ({ page }) => {
    interceptUserEndpoints(page);
    page.route("**/api/projects/proj_1/requirements", (route) => {
      if (route.request().method() === "POST") {
        return ofail("QUOTA_EXCEEDED", "limited", 429)(route);
      }
      return oh({ spec: null, confirmedAt: null })(route);
    });
    page.route("**/api/projects/proj_1", oh({ ...PROJECT, status: "requirements_pending" }));
    await page.addInitScript(AUTH_SAVE);
    await page.addInitScript(PROVIDER_SETUP_SEED);
    await page.goto("/projects/proj_1/requirements");

    await page.getByRole("button", { name: "Generate requirements" }).click();
    await expect(alertBox(page)).toContainText("Generation limit reached");
  });

  test("failed run renders the persisted error and a retry", async ({ page }) => {
    const FAILED_RUN = {
      id: "run_1",
      projectId: "proj_1",
      type: "requirements",
      status: "failed",
      provider: "mock",
      model: "mock/model",
      scope: null,
      stages: [
        {
          name: "analyze_idea",
          status: "failed",
          attempt: 2,
          startedAt: "t",
          finishedAt: "t",
          error: { code: "GENERATION_REPAIR_FAILED", message: "retries exhausted" },
          usage: null,
        },
      ],
      error: { code: "GENERATION_REPAIR_FAILED", message: "retries exhausted" },
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      createdAt: "t",
      startedAt: "t",
      finishedAt: "t",
    };
    const startCalls: number[] = [];
    interceptUserEndpoints(page);
    page.route("**/api/projects/proj_1/requirements", (route) => {
      if (route.request().method() === "POST") {
        startCalls.push(1);
        return oh({ runId: "run_1" }, 202)(route);
      }
      return oh({ spec: null, confirmedAt: null })(route);
    });
    page.route("**/api/runs/run_1", oh(FAILED_RUN));
    page.route("**/api/projects/proj_1", oh({ ...PROJECT, status: "requirements_pending" }));
    await page.addInitScript(AUTH_SAVE);
    await page.addInitScript(PROVIDER_SETUP_SEED);
    await page.goto("/projects/proj_1/requirements");

    await page.getByRole("button", { name: "Generate requirements" }).click();
    await expect(alertBox(page)).toContainText("GENERATION_REPAIR_FAILED");
    await expect(alertBox(page)).toContainText("retries exhausted");

    await page.getByRole("button", { name: "Retry generation" }).click();
    await expect.poll(() => startCalls.length).toBe(2);
    await expect(alertBox(page)).toContainText("GENERATION_REPAIR_FAILED");
  });
});

