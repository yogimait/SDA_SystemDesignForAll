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
import {
  GetArchitectureResponseSchema,
  ProjectSchema,
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
    AUTH_THROTTLE_LIMIT: "1000",
    AUTH_THROTTLE_TTL_MS: "60000",
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

    const anonymousAttempt = await request(server)
      .post("/api/projects")
      .send({ idea: "Anonymous idea" });
    expect(anonymousAttempt.status).toBe(401);
    expect((anonymousAttempt.body as Envelope<null>).error?.code).toBe(
      "AUTH_REQUIRED",
    );

    expect(first.project.ownerId).toBe(alice.user.id);

    const ownGet = await request(server)
      .get(`/api/projects/${first.project.id}`)
      .set(auth(alice.accessToken));
    expect(ownGet.status).toBe(200);

    const otherGet = await request(server)
      .get(`/api/projects/${first.project.id}`)
      .set(auth(bob.accessToken));
    expect(otherGet.status).toBe(404);
    expect((otherGet.body as Envelope<null>).error?.code).toBe(
      "PROJECT_NOT_FOUND",
    );

    const unknownGet = await request(server)
      .get("/api/projects/00000000-0000-4000-8000-000000000000")
      .set(auth(bob.accessToken));
    expect(unknownGet.status).toBe(otherGet.status);
    expect((unknownGet.body as Envelope<null>).error?.code).toBe(
      "PROJECT_NOT_FOUND",
    );

    const keyOnlyNoKey = await request(server).get(
      `/api/projects/${first.project.id}`,
    );
    expect(keyOnlyNoKey.status).toBe(403);
    // "Keep key access": the creation-time capability key still opens the
    // project without a Bearer token (legacy clients, creator's tab).
    const keyOnlyWithKey = await request(server)
      .get(`/api/projects/${first.project.id}`)
      .set("x-project-key", first.accessKey);
    expect(keyOnlyWithKey.status).toBe(200);

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

    const runStart = await request(server)
      .post(`/api/projects/${first.project.id}/requirements`)
      .set(auth(alice.accessToken))
      .send({});
    expect(runStart.status).toBe(202);
    const runId = (runStart.body as Envelope<{ runId: string }>).data.runId;
    const otherRun = await request(server)
      .get(`/api/runs/${runId}`)
      .set(auth(bob.accessToken));
    expect(otherRun.status).toBe(404);
    expect((otherRun.body as Envelope<null>).error?.code).toBe("RUN_NOT_FOUND");
    const unknownRun = await request(server)
      .get("/api/runs/00000000-0000-4000-8000-000000000000")
      .set(auth(bob.accessToken));
    expect(unknownRun.status).toBe(otherRun.status);
    expect((unknownRun.body as Envelope<null>).error?.code).toBe(
      "RUN_NOT_FOUND",
    );
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

    const leaked = await request(server)
      .put("/api/provider-config")
      .set(auth(user.accessToken))
      .send({
        provider: "openrouter",
        model: "z-ai/glm-5.3-flash",
        reasoningEffort: "low",
        apiKey: "must-not-be-stored",
      });
    expect(leaked.status).toBe(400);
    const leakedBody = leaked.body as Envelope<null>;
    expect(leakedBody.error?.code).toBe("VALIDATION_ERROR");
    expect(JSON.stringify(leakedBody.error?.details ?? leakedBody.message)).toContain("apiKey");

    const saved = await request(server)
      .put("/api/provider-config")
      .set(auth(user.accessToken))
      .send({
        provider: "openrouter",
        model: "z-ai/glm-5.3-flash",
        reasoningEffort: "low",
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

  it("owner reopens a project with the Bearer token alone (no access key)", async () => {
    const user = await register(server, "reopen@example.com");
    const created = await createProject(server, user.accessToken, "Reopen project");

    const project = await request(server)
      .get(`/api/projects/${created.project.id}`)
      .set(auth(user.accessToken))
      .set("x-project-key", "");
    expect(project.status).toBe(200);
    expect((project.body as Envelope<CreateProjectResponse["project"]>).data.ownerId).toBe(user.user.id);

    const requirements = await request(server)
      .get(`/api/projects/${created.project.id}/requirements`)
      .set(auth(user.accessToken));
    expect(requirements.status).toBe(200);
  });

  it("exposes a complete export payload with owner and key access", async () => {
    const user = await register(server, "export@example.com");
    const created = await createProject(server, user.accessToken, "Export project");
    await generateArchitecture(server, user.accessToken, created.project.id);

    const projectResponse = await request(server)
      .get(`/api/projects/${created.project.id}`)
      .set(auth(user.accessToken));
    expect(projectResponse.status).toBe(200);
    const exportedProject = ProjectSchema.parse(
      (projectResponse.body as Envelope<unknown>).data,
    );
    expect(exportedProject).toMatchObject({
      id: created.project.id,
      idea: "Export project",
      ownerId: user.user.id,
      status: "architecture_ready",
      currentArchitectureVersion: 1,
    });
    expect(exportedProject.createdAt).toEqual(expect.any(String));
    expect(exportedProject.updatedAt).toEqual(expect.any(String));
    expect(exportedProject.confirmedAt).toEqual(expect.any(String));

    const ownerArchitecture = await request(server)
      .get(`/api/projects/${created.project.id}/architecture`)
      .set(auth(user.accessToken));
    expect(ownerArchitecture.status).toBe(200);
    const exportedArchitecture = GetArchitectureResponseSchema.parse(
      (ownerArchitecture.body as Envelope<unknown>).data,
    );
    const version = exportedArchitecture.version;
    if (!version) {
      throw new Error("Expected an architecture version for export.");
    }
    expect(version).toMatchObject({
      projectId: created.project.id,
      version: 1,
    });
    expect(version.createdAt).toEqual(expect.any(String));
    expect(version.validation.valid).toBe(true);
    expect(version.validation.errors).toEqual(expect.any(Array));
    expect(version.validation.warnings).toEqual(expect.any(Array));
    expect(version.validation.validatedAt).toEqual(expect.any(String));

    const model = version.model;
    expect(model.requirements.confirmedAt).toEqual(expect.any(String));
    expect(model.requirements.spec.functional.length).toBeGreaterThan(0);
    expect(model.requirements.spec.nonFunctional.length).toBeGreaterThan(0);
    expect(model.lld.classes.length).toBeGreaterThan(0);
    expect(model.lld.relationships.length).toBeGreaterThan(0);
    expect(model.hld.components.length).toBeGreaterThan(0);
    expect(model.hld.connections.length).toBeGreaterThan(0);
    expect(model.dsa.recommendations.length).toBeGreaterThan(0);
    expect(model.learningSteps.length).toBeGreaterThan(0);
    expect(model.meta.title).toEqual(expect.any(String));

    const keyArchitecture = await request(server)
      .get(`/api/projects/${created.project.id}/architecture`)
      .set("x-project-key", created.accessKey);
    expect(keyArchitecture.status).toBe(200);
    expect(keyArchitecture.body).toEqual(ownerArchitecture.body);

    const wrongKey = await request(server)
      .get(`/api/projects/${created.project.id}/architecture`)
      .set("x-project-key", "not-the-key");
    expect(wrongKey.status).toBe(403);
    expect((wrongKey.body as Envelope<null>).error?.code).toBe(
      "PROJECT_ACCESS_DENIED",
    );
  });

  it("returns 404 envelopes for malformed project and run ids", async () => {
    const user = await register(server, "malformed@example.com");

    const badProject = await request(server)
      .get("/api/projects/not-a-uuid")
      .set(auth(user.accessToken));
    expect(badProject.status).toBe(404);
    expect((badProject.body as Envelope<null>).error?.code).toBe("PROJECT_NOT_FOUND");

    const badRun = await request(server)
      .get("/api/runs/also-not-a-uuid")
      .set(auth(user.accessToken));
    expect(badRun.status).toBe(404);
    expect((badRun.body as Envelope<null>).error?.code).toBe("RUN_NOT_FOUND");

    // A well-formed-but-unknown id keeps the plain not-found mapping.
    const unknownProject = await request(server)
      .get(`/api/projects/${"00000000-0000-4000-8000-000000000000"}`)
      .set(auth(user.accessToken));
    expect(unknownProject.status).toBe(404);
    expect((unknownProject.body as Envelope<null>).error?.code).toBe("PROJECT_NOT_FOUND");
  });

  it("returns 400 when requirement ids collide across projects", async () => {
    const user = await register(server, "spec-ids@example.com");
    const first = await createProject(server, user.accessToken, "Spec ids one");
    const second = await createProject(server, user.accessToken, "Spec ids two");
    const sharedSpec = {
      functional: [
        {
          id: "fr_cross_project",
          text: "Users can create an item.",
          priority: "must",
        },
      ],
      nonFunctional: [],
      assumptions: [
        { id: "asm_cross_project", text: "The item is owned by a user." },
      ],
      clarifications: [],
      confirm: false,
    };

    const saved = await request(server)
      .put(`/api/projects/${first.project.id}/requirements`)
      .set(auth(user.accessToken))
      .send(sharedSpec);
    expect(saved.status).toBe(200);

    const conflict = await request(server)
      .put(`/api/projects/${second.project.id}/requirements`)
      .set(auth(user.accessToken))
      .send(sharedSpec);
    expect(conflict.status).toBe(400);
    expect((conflict.body as Envelope<null>).error).toMatchObject({
      code: "VALIDATION_ERROR",
      details: { reason: "duplicate_spec_id" },
    });

    const rolledBack = await request(server)
      .get(`/api/projects/${second.project.id}/requirements`)
      .set(auth(user.accessToken));
    expect((rolledBack.body as Envelope<RequirementsResponse>).data.spec).toBeNull();
  });

  it("rejects an apiKey in the saved provider-config request", async () => {
    const user = await register(server, "strict@example.com");

    const rejected = await request(server)
      .put("/api/users/me/provider-config")
      .set(auth(user.accessToken))
      .send({
        provider: "openrouter",
        model: "z-ai/glm-5.3-flash",
        apiKey: "sk-or-leak-attempt",
      });
    expect(rejected.status).toBe(400);
    const body = rejected.body as Envelope<null>;
    expect(body.error?.code).toBe("VALIDATION_ERROR");
    expect(JSON.stringify(body.error?.details ?? body.message)).toContain("apiKey");
  });
});
