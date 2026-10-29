/**
 * Live run streaming against the BACKEND'S REAL frame shape
 * (`RunStreamEvent`: `event: run|stage`, `id:` per frame) - the D1
 * regression: these fixtures use stage/run event payloads, not the polling
 * DTO. The events route + the one-shot bootstrap GET are intercepted for
 * determinism; the real backend stream is exercised by the journey suites
 * and the QA audit.
 */
import { expect, test, type Page, type Route } from "@playwright/test";

const USER = {
  id: "usr_stream01",
  email: "stream@example.com",
  planTier: "pro",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const AUTH_SEED = `
  window.sessionStorage.setItem("sda:auth:session", JSON.stringify({
    user: ${JSON.stringify(USER)},
    accessToken: "token_stream_001",
    expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
  }));
  window.sessionStorage.setItem("sda:provider-setup", JSON.stringify({
    provider: "openrouter",
    model: "z-ai/glm-5.3-flash",
    keys: { openrouter: "sk-or-e2e-key-0123456789" },
  }));
`;

const PROJECT = {
  id: "proj_1",
  idea: "Design a sliding-window rate limiter.",
  ownerId: USER.id,
  status: "requirements_pending",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  confirmedAt: null,
  currentArchitectureVersion: null,
};

type StageStatus = "pending" | "running" | "succeeded" | "failed";

const STAGE_NAMES = ["analyze_idea", "persist"] as const;

const runDto = (
  status: string,
  stageStatuses: readonly StageStatus[],
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  id: "run_1",
  projectId: "proj_1",
  type: "requirements",
  status,
  provider: "mock",
  model: "mock/model",
  scope: null,
  stages: STAGE_NAMES.map((name, index) => ({
    name,
    status: stageStatuses[index] ?? "pending",
    attempt: stageStatuses[index] === "pending" ? 0 : 1,
    startedAt: stageStatuses[index] === "pending" ? null : "t",
    finishedAt: stageStatuses[index] === "succeeded" ? "t" : null,
    error: null,
    usage:
      stageStatuses[index] === "succeeded"
        ? { promptTokens: 10, completionTokens: 20, totalTokens: 30 }
        : null,
  })),
  error: null,
  usage: { promptTokens: 12, completionTokens: 34, totalTokens: 46 },
  createdAt: "t",
  startedAt: "t",
  finishedAt: null,
  ...overrides,
});

/** One real SSE frame: id + event + RunStreamEvent JSON data. */
const frame = (id: string, event: "stage" | "run", data: Record<string, unknown>): string =>
  `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

const stageEvent = (
  name: string,
  status: StageStatus,
  attempt = 1,
  error: unknown = null,
): Record<string, unknown> => ({
  type: "stage",
  name,
  status,
  attempt,
  startedAt: "t",
  finishedAt: status === "succeeded" ? "t" : null,
  error,
  usage:
    status === "succeeded"
      ? { promptTokens: 10, completionTokens: 20, totalTokens: 30 }
      : null,
});

const runEvent = (status: string, error: unknown = null): Record<string, unknown> => ({
  type: "run",
  status,
  error,
  usage: { promptTokens: 12, completionTokens: 34, totalTokens: 46 },
  updatedAt: "t",
});

const envelope = (data: unknown, code = 200) => ({
  status: true,
  statusCode: code,
  data,
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function interceptProject(page: Page): Promise<void> {
  await page.route("**/api/projects/proj_1/requirements", (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify(envelope({ runId: "run_1" }, 202)),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(envelope({ spec: null, confirmedAt: null })),
    });
  });
  await page.route("**/api/projects/proj_1", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(envelope(PROJECT)),
    }),
  );
}

async function startRun(page: Page): Promise<void> {
  await page.goto("/projects/proj_1/requirements");
  await page.getByRole("button", { name: "Generate requirements" }).click();
  // The run phase mounts after the start POST; whether a run DTO ever
  // arrives depends on the stream/auth path under test.
  await expect(page.getByText("Analyzing your idea…")).toBeVisible({
    timeout: 30_000,
  });
}

function capturePageErrors(page: Page): { pageErrors: string[] } {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  return { pageErrors };
}

const stages = (page: Page) => page.getByRole("list", { name: "Run stages" });

test("real stage/run frames update the UI live; one bootstrap, no polling", async ({ page }) => {
  const { pageErrors } = capturePageErrors(page);
  let bootstrapCount = 0;
  let streamRequests = 0;

  // The one-shot bootstrap GET (same endpoint polling uses) - interval
  // polling must never add further requests while the stream owns the run.
  await page.route("**/api/runs/run_1", (route) => {
    bootstrapCount += 1;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(envelope(runDto("queued", ["pending", "pending"]))),
    });
  });

  // Three SSE waves of REAL RunStreamEvent frames; the server closes after
  // each, so reconnect + resume run too.
  await page.route("**/api/runs/run_1/events*", async (route: Route) => {
    streamRequests += 1;
    await sleep(400); // observable "connecting" window
    if (streamRequests === 1) {
      return route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body:
          frame("evt-1", "stage", stageEvent("analyze_idea", "running")) +
          frame("evt-2", "run", runEvent("running")),
      });
    }
    if (streamRequests === 2) {
      await sleep(400);
      return route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body:
          frame("evt-3", "stage", stageEvent("analyze_idea", "succeeded")) +
          frame("evt-4", "stage", stageEvent("persist", "running")) +
          frame("evt-5", "run", runEvent("running")),
      });
    }
    await sleep(600); // observable window where exactly one stage is done
    return route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body:
        frame(
          "evt-6",
          "stage",
          stageEvent("persist", "failed", 2, {
            code: "GENERATION_REPAIR_FAILED",
            message: "retries exhausted",
          }),
        ) +
        frame(
          "evt-7",
          "run",
          runEvent("failed", {
            code: "GENERATION_REPAIR_FAILED",
            message: "retries exhausted",
          }),
        ),
    });
  });

  await interceptProject(page);
  await page.addInitScript(AUTH_SEED);
  await startRun(page);

  // Bootstrap renders the identity + queued stage rows before the stream.
  await expect(stages(page)).toContainText("analyze_idea");

  // Connection indicator appears once the stream connects ("live" is
  // short-lived with fully-fulfilled bodies; the persistent real stream is
  // exercised by the journey suites, here reconnect windows keep it visible).
  await expect(
    page.getByLabel(/Run updates: (live|reconnecting|connecting)/),
  ).toBeVisible({ timeout: 15_000 });

  // Wave 1 (real stage frame): exactly one stage running, driven by the
  // stream - the bootstrap rows were all pending, so polling alone could
  // not produce this state.
  await expect(stages(page).getByText("running")).toHaveCount(1, { timeout: 15_000 });

  // Wave 2: one stage done, one still running.
  await expect(stages(page).getByText("done")).toHaveCount(1, { timeout: 15_000 });
  await expect(stages(page).getByText("running")).toHaveCount(1);

  // Wave 3: terminal failed state with repair attempt + banner + retry.
  await expect(stages(page).getByText("failed")).toHaveCount(1, { timeout: 15_000 });
  await expect(stages(page).getByText("done")).toHaveCount(1);
  await expect(stages(page)).toContainText("attempt 2");
  await expect(page.getByText("GENERATION_REPAIR_FAILED").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry generation" })).toBeVisible();
  await expect(stages(page).getByText("running")).toHaveCount(0);

  // Exactly one bootstrap; no interval polling while streaming.
  expect(bootstrapCount).toBe(1);
  expect(streamRequests).toBeGreaterThanOrEqual(3);
  expect(pageErrors).toEqual([]);
});

test("aborted stream shows reconnecting, falls back to polling, still reaches terminal", async ({
  page,
}) => {
  const { pageErrors } = capturePageErrors(page);
  let getCount = 0;

  await page.route("**/api/runs/run_1/events*", (route) => route.abort("connectionfailed"));

  // GET is used for the bootstrap, then by the polling fallback. The first
  // poll keeps the run ACTIVE so the "polling" indicator window is real;
  // the second poll returns the terminal state.
  await page.route("**/api/runs/run_1", (route) => {
    getCount += 1;
    const run =
      getCount >= 3
        ? runDto("failed", ["succeeded", "failed"], {
            error: { code: "GENERATION_REPAIR_FAILED", message: "retries exhausted" },
          })
        : runDto("running", getCount === 1 ? ["running", "pending"] : ["succeeded", "running"]);
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(envelope(run)),
    });
  });

  await interceptProject(page);
  await page.addInitScript(AUTH_SEED);
  await startRun(page);

  // Reconnecting is visible while the stream retries with backoff.
  await expect(page.getByLabel(/Run updates: (reconnecting|connecting)/)).toBeVisible({
    timeout: 10_000,
  });

  // After 3 backoff retries the polling fallback takes over and says so.
  await expect(page.getByLabel("Run updates: polling")).toBeVisible({ timeout: 20_000 });
  await expect(stages(page)).toContainText("analyze_idea");

  // Polling drives the run to its terminal (failed) state.
  await expect(stages(page).getByText("failed")).toHaveCount(1, { timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Retry generation" })).toBeVisible();
  expect(getCount).toBeGreaterThanOrEqual(2);
  expect(pageErrors).toEqual([]);
});

test("run-status 401 is treated as signed out: redirect to login, session cleared", async ({ page }) => {
  await page.route("**/api/runs/run_1/events*", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({
        status: false,
        statusCode: 401,
        message: "Authentication is required.",
        error: { code: "AUTH_REQUIRED" },
      }),
    }),
  );
  await page.route("**/api/runs/run_1", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({
        status: false,
        statusCode: 401,
        message: "Authentication is required.",
        error: { code: "AUTH_REQUIRED" },
      }),
    }),
  );

  await interceptProject(page);
  // Seed once: the redirect must not be re-seeded by the init script.
  await page.addInitScript(`
    if (window.sessionStorage.getItem("sda:stream:seeded") === null) {
      window.sessionStorage.setItem("sda:stream:seeded", "1");
      window.sessionStorage.setItem("sda:auth:session", JSON.stringify({
        user: ${JSON.stringify(USER)},
        accessToken: "token_stream_001",
        expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      }));
      window.sessionStorage.setItem("sda:provider-setup", JSON.stringify({
        provider: "openrouter",
        model: "z-ai/glm-5.3-flash",
        keys: { openrouter: "sk-or-e2e-key-0123456789" },
      }));
    }
  `);
  await page.goto("/projects/proj_1/requirements");
  await page.getByRole("button", { name: "Generate requirements" }).click();

  // A rejected token is a signed-out state: no inline error card next to a
  // signed-in header — the tab goes back to sign-in and returns here.
  await expect(page).toHaveURL(
    /\/login\?next=%2Fprojects%2Fproj_1%2Frequirements$/,
    { timeout: 20_000 },
  );
  await expect
    .poll(() => page.evaluate(() => window.sessionStorage.getItem("sda:auth:session")))
    .toBeNull();
  await expect(page.getByRole("tab", { name: "Sign in" })).toBeVisible();
  await expect(
    page.getByText("Sign in to continue. Your session is missing or expired."),
  ).toHaveCount(0);
});
