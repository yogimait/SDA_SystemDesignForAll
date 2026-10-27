/**
 * User/auth round journeys: register/login/logout, session restoration,
 * project library, provider settings, user preferences, dashboard, and
 * plan/error paths. New user endpoints are intercepted at the network
 * boundary with contract-shaped envelopes — the mock backend does not
 * implement these controllers yet (contract-committed, backend pending).
 * The existing project pipeline journeys keep using the live mock backend.
 */

import { expect, test, type Page, type Route } from "@playwright/test";

const USER = {
  id: "usr_probe001",
  email: "probe@example.com",
  planTier: "pro",
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
    spec: { functional: [{ id: "fr_probe", kind: "functional", text: "p", priority: "must" }], nonFunctional: [], assumptions: [], clarifications: [] },
  },
  hld: { components: [], connections: [], flows: [], technologyDecisions: [], scalabilityNotes: [], failureScenarios: [] },
  lld: { classes: [], relationships: [], patterns: [] },
  dsa: { recommendations: [], algorithmicPatterns: [] },
  learningSteps: [{ id: "step_1", title: "t", explanation: "e", elementRefs: ["cmp_x"] }],
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

type RouteLike = Route;
const envelope = (data: unknown, code = 200) => ({ status: true, statusCode: code, data });
const oh = (data: unknown, code = 200) =>
  (route: RouteLike) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(envelope(data, code)) });
const ofail = (code: string, message: string, statusCode: number) =>
  (route: RouteLike) => route.fulfill({ status: statusCode, contentType: "application/json", body: JSON.stringify({ status: false, statusCode, message, error: { code } }) });

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
  page.route("**/api/users/me/provider-config", oh({ config: { provider: "openrouter", model: "z-ai/glm-5.3-flash", updatedAt: "t" } }));
  page.route("**/api/users/me/preferences", oh({ preferences: { theme: "dark", defaultProvider: "openrouter", defaultModel: "z-ai/glm-5.3-flash" } }));
  page.route("**/api/projects/proj_1/architecture", oh(MODEL_FIXTURE));
  page.route("**/api/projects/proj_2/architecture", oh(MODEL_FIXTURE));
}

const AUTH_SAVE = `
  window.sessionStorage.setItem("sda:auth:session", JSON.stringify({
    user: ${JSON.stringify(USER)},
    accessToken: "token_probe_001",
    expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
  }));
`;

test.describe("register / login / logout / restore", () => {
  test("register lands on the library with the Bearer header attached", async ({ page }) => {
    const authHeaders: string[] = [];
    page.on("request", (request) => {
      const header = request.headers()["authorization"];
      if (header !== undefined) authHeaders.push(header);
    });
    interceptUserEndpoints(page);
    await page.addInitScript(AUTH_SAVE.replace("sda:auth:session", "sda:none")); // keep storage empty pre-login
    await page.goto("/login");
    await page.getByRole("tab", { name: "Create account" }).click();
    await page.getByLabel("Email").fill("probe@example.com");
    await page.getByLabel("Password", { exact: true }).fill("supersecret1");
    await page.getByLabel("Confirm password").fill("supersecret1");
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
    await page.getByLabel("Email").fill("probe@example.com");
    await page.getByLabel("Password", { exact: true }).fill("wrongpass1");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator("form").getByRole("alert")).toContainText("incorrect");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("register duplicate email maps the error", async ({ page }) => {
    interceptUserEndpoints(page, { register: ofail("AUTH_EMAIL_TAKEN", "taken", 409) });
    await page.goto("/login");
    await page.getByRole("tab", { name: "Create account" }).click();
    await page.getByLabel("Email").fill("probe@example.com");
    await page.getByLabel("Password", { exact: true }).fill("supersecret1");
    await page.getByLabel("Confirm password").fill("supersecret1");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.locator("form").getByRole("alert")).toContainText("already registered");
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

    await page.getByLabel("Email").fill("probe@example.com");
    await page.getByLabel("Password", { exact: true }).fill("supersecret1");
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

  test("expired session drops back to login", async ({ page, context }) => {
    await context.addInitScript(`
      window.sessionStorage.setItem("sda:auth:session", JSON.stringify({
        user: ${JSON.stringify(USER)},
        accessToken: "expired", expiresAt: new Date(Date.now() - 1000).toISOString(),
      }));
    `);
    interceptUserEndpoints(page);
    await page.goto("/library");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("provider settings + preferences", () => {
  test("saved configuration loads, updates, and validates", async ({ page }) => {
    interceptUserEndpoints(page);
    await page.addInitScript(AUTH_SAVE);
    await page.goto("/settings");

    // Base UI Select trigger is a combobox button, not an input.
    await expect(page.getByRole("combobox", { name: "Provider" })).toHaveText(/openrouter/);
    await expect(page.getByLabel("Model", { exact: true })).toHaveValue("z-ai/glm-5.3-flash");
    await expect(page.getByLabel(/Reasoning effort/)).toHaveValue("");

    await page.getByLabel("Model", { exact: true }).fill("groq/openai/gpt-oss-120b");
    await page.getByRole("button", { name: "Save configuration" }).click();
    await expect(page.getByRole("status").last()).toContainText("Saved");
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
    await expect(page.getByRole("combobox", { name: "Provider" })).toHaveText(/openrouter/);
    await page.getByRole("button", { name: "Save configuration" }).click();
    await expect(
      page.getByRole("region", { name: "Saved provider configuration" }).getByRole("alert"),
    ).toContainText("failed validation");
  });

  test("preferences round-trip", async ({ page }) => {
    interceptUserEndpoints(page);
    await page.addInitScript(AUTH_SAVE);
    await page.goto("/settings");
    await expect(page.getByLabel("Theme")).toHaveValue("dark");
    await page.getByLabel("Default provider").fill("groq");
    await page.getByRole("button", { name: "Save preferences" }).click();
    await expect(page.getByText("Preferences saved")).toBeVisible();
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
    await expect(page.getByText("run_1")).toBeVisible();
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

  test("auth-required mid-journey surfaces re-login", async ({ page }) => {
    interceptUserEndpoints(page, { dashboard: ofail("AUTH_REQUIRED", "gone", 401) });
    await page.addInitScript(AUTH_SAVE);
    await page.goto("/dashboard");
    await expect(page.getByText("Sign in to continue. Your session is missing or expired.")).toBeVisible();
    await expect(page.getByText("Sign in again")).toBeVisible();
  });
});
