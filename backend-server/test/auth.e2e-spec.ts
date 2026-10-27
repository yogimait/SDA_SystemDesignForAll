import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type {
  AuthResponse,
  CreateProjectResponse,
  DashboardData,
  GenerationRun,
  ListProjectsResponse,
  RequirementsResponse,
  SavedProviderConfigResponse,
  User,
  UserPreferencesResponse,
} from "@sda/contracts";
import request from "supertest";
import type { App } from "supertest/types";
import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/bootstrap.js";

interface Envelope<T> {
  status: boolean;
  statusCode: number;
  data: T;
  message?: string;
  error?: { code: string; details?: Record<string, unknown> };
}

function setEnv(): void {
  Object.assign(process.env, {
    NODE_ENV: "test",
    PORT: "3001",
    PGLITE_DATA_DIR: "memory://",
    MOCK_PROVIDER: "1",
    DEFAULT_PROVIDER: "openrouter",
    DEFAULT_MODEL: "test/model",
    GENERATION_POLL_INTERVAL_MS: "10",
    THROTTLE_LIMIT: "1000",
    THROTTLE_TTL_MS: "60000",
    MAX_REQUEST_BYTES: "1000000",
  });
}

async function createTestApp(): Promise<{
  app: INestApplication<App>;
  server: App;
}> {
  setEnv();
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>(
    undefined,
    { bodyParser: false },
  );
  configureApp(app);
  await app.init();
  return { app, server: app.getHttpServer() };
}

function auth(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

async function register(
  server: App,
  email: string,
  password = "password123",
): Promise<AuthResponse> {
  const response = await request(server)
    .post("/api/auth/register")
    .send({ email, password });
  expect(response.status).toBe(201);
  const body = response.body as Envelope<AuthResponse>;
  expect(body.status).toBe(true);
  expect(body.statusCode).toBe(201);
  return body.data;
}

async function createProject(
  server: App,
  token?: string,
  idea = "A workspace for small teams.",
): Promise<CreateProjectResponse> {
  const req = request(server).post("/api/projects").send({ idea });
  if (token) req.set(auth(token));
  const response = await req;
  expect(response.status).toBe(201);
  return (response.body as Envelope<CreateProjectResponse>).data;
}

async function waitForRun(
  server: App,
  runId: string,
  token: string,
): Promise<GenerationRun> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const response = await request(server)
      .get(`/api/runs/${runId}`)
      .set(auth(token));
    expect(response.status).toBe(200);
    const run = (response.body as Envelope<GenerationRun>).data;
    if (["succeeded", "failed", "interrupted"].includes(run.status)) {
      return run;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Run did not finish in time.");
}

async function generateArchitecture(
  server: App,
  token: string,
  projectId: string,
): Promise<void> {
  const requirementsRun = await request(server)
    .post(`/api/projects/${projectId}/requirements`)
    .set(auth(token))
    .send({});
  expect(requirementsRun.status).toBe(202);
  const reqRunId = (requirementsRun.body as Envelope<{ runId: string }>).data
    .runId;
  expect((await waitForRun(server, reqRunId, token)).status).toBe("succeeded");

  const requirements = (
    await request(server)
      .get(`/api/projects/${projectId}/requirements`)
      .set(auth(token))
  ).body as Envelope<RequirementsResponse>;
  const spec = requirements.data.spec;
  expect(spec).not.toBeNull();

  const saved = await request(server)
    .put(`/api/projects/${projectId}/requirements`)
    .set(auth(token))
    .send({
      functional: spec!.functional,
      nonFunctional: spec!.nonFunctional,
      assumptions: spec!.assumptions,
      clarifications: spec!.clarifications,
      confirm: true,
    });
  expect(saved.status).toBe(200);

  const architectureRun = await request(server)
    .post(`/api/projects/${projectId}/architecture`)
    .set(auth(token))
    .send({});
  expect(architectureRun.status).toBe(202);
  const archRunId = (architectureRun.body as Envelope<{ runId: string }>).data
    .runId;
  expect((await waitForRun(server, archRunId, token)).status).toBe("succeeded");
}

describe("Auth, ownership, account, plan, and dashboard (e2e)", () => {
  let app: INestApplication<App>;
  let server: App;

  beforeAll(async () => {
    ({ app, server } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it("registers, returns me, rejects bad credentials, and logs out", async () => {
    const registered = await register(server, " User@Example.com ");
    expect(registered.user.email).toBe("user@example.com");
    expect(registered.user.planTier).toBe("free");
    expect(registered.tokenType).toBe("Bearer");
    expect(JSON.stringify(registered)).not.toContain("password");

    const me = await request(server)
      .get("/api/auth/me")
      .set(auth(registered.accessToken));
    expect(me.status).toBe(200);
    expect((me.body as Envelope<User>).data.id).toBe(registered.user.id);

    const wrong = await request(server)
      .post("/api/auth/login")
      .send({ email: "user@example.com", password: "wrong-password" });
    expect(wrong.status).toBe(401);
    expect((wrong.body as Envelope<null>).error?.code).toBe(
      "AUTH_INVALID_CREDENTIALS",
    );

    const duplicate = await request(server)
      .post("/api/auth/register")
      .send({ email: "USER@example.com", password: "password123" });
    expect(duplicate.status).toBe(409);
    expect((duplicate.body as Envelope<null>).error?.code).toBe(
      "AUTH_EMAIL_TAKEN",
    );

    const loggedIn = await request(server)
      .post("/api/auth/login")
      .send({ email: "USER@example.com", password: "password123" });
    expect(loggedIn.status).toBe(200);

    const logout = await request(server)
      .post("/api/auth/logout")
      .set(auth(registered.accessToken));
    expect(logout.status).toBe(200);

    const afterLogout = await request(server)
      .get("/api/auth/me")
      .set(auth(registered.accessToken));
    expect(afterLogout.status).toBe(401);
    expect((afterLogout.body as Envelope<null>).error?.code).toBe(
      "AUTH_REQUIRED",
    );
  });

  it("assigns ownership, lists with cursor/status, and isolates users", async () => {
    const alice = await register(server, "alice@example.com");
    const bob = await register(server, "bob@example.com");
    const first = await createProject(server, alice.accessToken, "Alice one");
    await createProject(server, alice.accessToken, "Alice two");
    await createProject(server, alice.accessToken, "Alice three");
    const anonymous = await createProject(server, undefined, "Anonymous idea");

    expect(first.project.ownerId).toBe(alice.user.id);
    expect(anonymous.project.ownerId).toBeNull();

    const ownGet = await request(server)
      .get(`/api/projects/${first.project.id}`)
      .set(auth(alice.accessToken));
    expect(ownGet.status).toBe(200);

    const otherGet = await request(server)
      .get(`/api/projects/${first.project.id}`)
      .set(auth(bob.accessToken));
    expect(otherGet.status).toBe(403);

    const anonymousNoKey = await request(server).get(
      `/api/projects/${anonymous.project.id}`,
    );
    expect(anonymousNoKey.status).toBe(403);
    const anonymousWithKey = await request(server)
      .get(`/api/projects/${anonymous.project.id}`)
      .set("x-project-key", anonymous.accessKey);
    expect(anonymousWithKey.status).toBe(200);

    const page1 = await request(server)
      .get("/api/projects?limit=1&status=requirements_pending")
      .set(auth(alice.accessToken));
    expect(page1.status).toBe(200);
    const page1Body = (page1.body as Envelope<ListProjectsResponse>).data;
    expect(page1Body.projects).toHaveLength(1);
    expect(page1Body.projects[0]?.ownerId).toBe(alice.user.id);
    expect(page1Body.nextCursor).not.toBeNull();

    const page2 = await request(server)
      .get(
        `/api/projects?limit=2&cursor=${encodeURIComponent(page1Body.nextCursor ?? "")}`,
      )
      .set(auth(alice.accessToken));
    expect(page2.status).toBe(200);
    const page2Body = (page2.body as Envelope<ListProjectsResponse>).data;
    expect(page2Body.projects).toHaveLength(2);
    expect(page2Body.projects.every((item) => item.ownerId === alice.user.id)).toBe(true);

    const bobList = await request(server)
      .get("/api/projects")
      .set(auth(bob.accessToken));
    expect((bobList.body as Envelope<ListProjectsResponse>).data.projects).toHaveLength(0);

    const noAuth = await request(server).get("/api/projects");
    expect(noAuth.status).toBe(401);
    expect((noAuth.body as Envelope<null>).error?.code).toBe("AUTH_REQUIRED");
  });

  it("saves provider config without keys and merges preferences", async () => {
    const user = await register(server, "account@example.com");
    const missing = await request(server)
      .get("/api/provider-config")
      .set(auth(user.accessToken));
    expect(missing.status).toBe(404);
    expect((missing.body as Envelope<null>).error?.code).toBe(
      "PROVIDER_CONFIG_NOT_FOUND",
    );

    const saved = await request(server)
      .put("/api/provider-config")
      .set(auth(user.accessToken))
      .send({
        provider: "openrouter",
        model: "z-ai/glm-5.3-flash",
        reasoningEffort: "low",
        apiKey: "must-not-be-stored",
      });
    expect(saved.status).toBe(200);
    const config = (saved.body as Envelope<SavedProviderConfigResponse>).data
      .config;
    expect(config).toMatchObject({
      provider: "openrouter",
      model: "z-ai/glm-5.3-flash",
      reasoningEffort: "low",
    });
    expect(JSON.stringify(saved.body)).not.toContain("must-not-be-stored");
    expect(JSON.stringify(saved.body)).not.toContain("apiKey");

    const unknown = await request(server)
      .put("/api/provider-config")
      .set(auth(user.accessToken))
      .send({ provider: "nope", model: "x" });
    expect(unknown.status).toBe(400);

    const emptyPrefs = await request(server)
      .get("/api/preferences")
      .set(auth(user.accessToken));
    expect(
      (emptyPrefs.body as Envelope<UserPreferencesResponse>).data.preferences,
    ).toEqual({});

    await request(server)
      .put("/api/preferences")
      .set(auth(user.accessToken))
      .send({ theme: "dark", defaultProvider: "openrouter" })
      .expect(200);
    const updated = await request(server)
      .put("/api/preferences")
      .set(auth(user.accessToken))
      .send({ theme: "light" });
    expect(updated.status).toBe(200);
    expect(
      (updated.body as Envelope<UserPreferencesResponse>).data.preferences,
    ).toMatchObject({ theme: "light", defaultProvider: "openrouter" });

    const noAuth = await request(server).get("/api/preferences");
    expect(noAuth.status).toBe(401);
  });

  it("enforces plan limits and requires Pro for scoped regeneration", async () => {
    const user = await register(server, "plan@example.com");
    const project = await createProject(server, user.accessToken, "Plan project");
    await createProject(server, user.accessToken, "Plan project 2");
    await createProject(server, user.accessToken, "Plan project 3");

    const fourth = await request(server)
      .post("/api/projects")
      .set(auth(user.accessToken))
      .send({ idea: "Plan project 4" });
    expect(fourth.status).toBe(402);
    expect((fourth.body as Envelope<null>).error?.code).toBe(
      "PLAN_LIMIT_EXCEEDED",
    );

    await generateArchitecture(server, user.accessToken, project.project.id);

    const regen = await request(server)
      .post(`/api/projects/${project.project.id}/architecture/regenerate`)
      .set(auth(user.accessToken))
      .send({ scope: "lld" });
    expect(regen.status).toBe(402);
    expect((regen.body as Envelope<null>).error?.code).toBe(
      "PLAN_UPGRADE_REQUIRED",
    );
  });

  it("aggregates dashboard usage for owned projects", async () => {
    const user = await register(server, "dashboard@example.com");
    const project = await createProject(server, user.accessToken, "Dashboard project");
    await generateArchitecture(server, user.accessToken, project.project.id);

    const dashboard = await request(server)
      .get("/api/dashboard?range=last_7_days")
      .set(auth(user.accessToken));
    expect(dashboard.status).toBe(200);
    const data = (dashboard.body as Envelope<DashboardData>).data;
    expect(data.range).toBe("last_7_days");
    expect(data.buckets).toHaveLength(7);
    expect(data.usage.runCount).toBeGreaterThanOrEqual(2);
    expect(data.usage.projectCount).toBe(1);
    expect(data.recentRuns.length).toBeGreaterThanOrEqual(2);
    expect(data.recentRuns.every((run) => run.projectId === project.project.id)).toBe(true);

    const invalid = await request(server)
      .get("/api/dashboard?range=all_time")
      .set(auth(user.accessToken));
    expect(invalid.status).toBe(400);

    const noAuth = await request(server).get("/api/dashboard");
    expect(noAuth.status).toBe(401);
  });
});
