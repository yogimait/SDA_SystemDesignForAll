import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { request as httpRequest, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import type {
  AuthResponse,
  CreateProjectResponse,
  GenerationRun,
  GetArchitectureResponse,
  ProvidersResponse,
  RequirementsResponse,
  RunStreamEvent,
  StartRunResponse,
} from "@sda/contracts";
import {
  ProvidersResponseSchema,
  RunStreamEventSchema,
} from "@sda/contracts";
import request from "supertest";
import type { App } from "supertest/types";
import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/bootstrap.js";
import { AppError } from "../src/common/errors/app-error.js";
import type {
  GenerateStructuredInput,
  GeneratedStructured,
  ModelProvider,
} from "../src/providers/model-provider.js";
import { MockProvider } from "../src/providers/mock/mock.provider.js";
import { ProviderRegistry } from "../src/providers/provider.registry.js";
import { USER_REPOSITORY } from "../src/database/repositories/user.repository.js";
import type { UserRepository } from "../src/database/repositories/user.repository.js";

const IDEA =
  "A collaborative workspace where small teams organize shared items and invite collaborators.";

interface Envelope<T> {
  status: boolean;
  statusCode: number;
  data: T;
  message?: string;
  error?: { code: string; details?: Record<string, unknown> };
}

interface SseFrame {
  id?: string;
  event?: string;
  data: RunStreamEvent;
}

interface SseResponse {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
}

interface SseStream {
  opened: Promise<void>;
  done: Promise<SseResponse>;
}

function collectSse(
  server: App,
  path: string,
  headers: Record<string, string>,
): SseStream {
  const started = server.listening
    ? Promise.resolve()
    : new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => resolve());
      });

  let resolveOpened: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    resolveOpened = resolve;
  });
  const done = started.then(
    () =>
      new Promise<SseResponse>((resolve, reject) => {
        const address = server.address() as AddressInfo;
        const request = httpRequest(
          {
            hostname: "127.0.0.1",
            port: address.port,
            path,
            method: "GET",
            headers: {
              accept: "text/event-stream",
              ...headers,
            },
          },
          (response) => {
            resolveOpened();
            let body = "";
            response.setEncoding("utf8");
            response.on("data", (chunk: string) => {
              body += chunk;
            });
            response.on("end", () => {
              resolve({
                status: response.statusCode ?? 0,
                headers: response.headers,
                body,
              });
            });
          },
        );
        request.on("error", reject);
        request.end();
      }),
  );
  return { opened, done };
}

function parseSse(body: string): SseFrame[] {
  return body
    .split(/\r?\n\r?\n/)
    .filter((block) => block.trim().length > 0 && !block.startsWith(":"))
    .map((block) => {
      let id: string | undefined;
      let event: string | undefined;
      let data: string | undefined;
      for (const line of block.split(/\r?\n/)) {
        if (line.startsWith("id: ")) id = line.slice(4);
        if (line.startsWith("event: ")) event = line.slice(7);
        if (line.startsWith("data: ")) data = line.slice(6);
      }
      if (!data) {
        throw new Error(`SSE frame without data: ${block}`);
      }
      return {
        ...(id ? { id } : {}),
        ...(event ? { event } : {}),
        data: RunStreamEventSchema.parse(JSON.parse(data)) as RunStreamEvent,
      };
    });
}

interface TestApp {
  app: INestApplication<App>;
  server: App;
}

function setEnv(overrides: Record<string, string>): void {
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
    MAX_REQUEST_BYTES: "2048",
    ...overrides,
  });
}

async function createTestApp(
  overrides: Record<string, string> = {},
  provider?: ModelProvider,
): Promise<TestApp> {
  setEnv(overrides);
  const builder = Test.createTestingModule({ imports: [AppModule] });
  if (provider) {
    builder.overrideProvider(ProviderRegistry).useValue({
      mockEnabled: true,
      defaultProvider: "mock",
      defaultModel: "test/model",
      resolve: () => provider,
      list: () => [
        {
          id: "mock",
          models: ["test/model"],
          supportsStructuredOutput: true,
        },
      ],
    });
  }

  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>(
    undefined,
    { bodyParser: false },
  );
  configureApp(app);
  await app.init();
  return { app, server: app.getHttpServer() };
}

async function createProject(
  server: App,
  token?: string,
  idea = IDEA,
): Promise<CreateProjectResponse> {
  const bearer =
    token ?? (await register(server, `auto_${Date.now()}_${Math.floor(Math.random() * 1e9)}@example.com`)).accessToken;
  const response = await request(server)
    .post("/api/projects")
    .set("Authorization", `Bearer ${bearer}`)
    .send({ idea });
  expect(response.status).toBe(201);
  const body = response.body as Envelope<CreateProjectResponse>;
  expect(body.status).toBe(true);
  expect(body.statusCode).toBe(201);
  return body.data;
}

async function register(
  server: App,
  email: string,
): Promise<AuthResponse> {
  const response = await request(server)
    .post("/api/auth/register")
    .send({ email, password: "password123" });
  expect(response.status).toBe(201);
  return (response.body as Envelope<AuthResponse>).data;
}

async function waitForRun(
  server: App,
  runId: string,
  accessKey: string,
): Promise<GenerationRun> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const response = await request(server)
      .get(`/api/runs/${runId}`)
      .set("x-project-key", accessKey);
    expect(response.status).toBe(200);
    const run = (response.body as Envelope<GenerationRun>).data;
    if (["succeeded", "failed", "interrupted"].includes(run.status)) {
      return run;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Run ${runId} did not reach a terminal state in time.`);
}

async function startRequirements(
  server: App,
  projectId: string,
  accessKey: string,
): Promise<string> {
  const response = await request(server)
    .post(`/api/projects/${projectId}/requirements`)
    .set("x-project-key", accessKey)
    .send({});
  expect(response.status).toBe(202);
  return (response.body as Envelope<StartRunResponse>).data.runId;
}

class ControlledProvider implements ModelProvider {
  readonly id = "mock";
  private readonly mock = new MockProvider();
  private mode: "normal" | "invalid" | "invalid_json" | "truncated" | "block" =
    "normal";
  private gate: Promise<void> = Promise.resolve();
  private releaseGate: () => void = () => undefined;
  private started: Promise<void> = Promise.resolve();
  private signalStarted: () => void = () => undefined;

  armBlock(): { started: Promise<void>; release: () => void } {
    this.mode = "block";
    this.gate = new Promise((resolve) => {
      this.releaseGate = resolve;
    });
    this.started = new Promise((resolve) => {
      this.signalStarted = resolve;
    });
    return { started: this.started, release: () => this.releaseGate() };
  }

  rejectSchema(): void {
    this.mode = "invalid";
  }

  rejectJson(): void {
    this.mode = "invalid_json";
  }

  truncate(): void {
    this.mode = "truncated";
  }

  async generateStructured(
    input: GenerateStructuredInput,
  ): Promise<GeneratedStructured> {
    if (this.mode === "invalid") {
      return { data: { functional: [] } };
    }
    if (this.mode === "invalid_json") {
      throw new AppError(
        "INVALID_MODEL_OUTPUT",
        "The model returned invalid JSON.",
      );
    }
    if (this.mode === "truncated") {
      throw new AppError(
        "INVALID_MODEL_OUTPUT",
        "The model response was truncated before completion.",
        {
          reason: "truncated_output",
          finishReason: "length",
          maxOutputTokens: 4_000,
          usage: {
            promptTokens: 1_200,
            completionTokens: 4_000,
            totalTokens: 5_200,
          },
        },
      );
    }
    if (this.mode === "block") {
      this.mode = "normal";
      this.signalStarted();
      await this.gate;
    }
    return this.mock.generateStructured(input);
  }
}

describe("API (e2e)", () => {
  describe("full journey", () => {
    let app: INestApplication<App>;
    let server: App;
    let token: string;

    beforeAll(async () => {
      ({ app, server } = await createTestApp());
      token = (await register(server, "journey@example.com")).accessToken;
    });

    afterAll(async () => {
      await app.close();
    });

    it("reports health inside the success envelope", async () => {
      const response = await request(server).get("/api/health");
      expect(response.status).toBe(200);
      const body = response.body as Envelope<{
        status: string;
        database: string;
      }>;
      expect(body).toMatchObject({
        status: true,
        statusCode: 200,
        data: { status: "ok", database: "pglite" },
      });
      expect(response.headers["x-powered-by"]).toBeUndefined();
      expect(response.headers["x-content-type-options"]).toBe("nosniff");
      expect(response.headers["x-frame-options"]).toBe("DENY");
      expect(response.headers["referrer-policy"]).toBe("no-referrer");
    });

    it("returns a route-not-found envelope for unknown routes", async () => {
      const response = await request(server).get("/api/no-such-route");
      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        status: false,
        statusCode: 404,
        error: { code: "ROUTE_NOT_FOUND" },
      });
    });

    it("lists provider configuration without secrets", async () => {
      const response = await request(server).get("/api/providers");
      expect(response.status).toBe(200);
      const body = response.body as Envelope<ProvidersResponse>;
      const data = ProvidersResponseSchema.parse(body.data);
      expect(data).toMatchObject({ defaultModel: "test/model", mock: true });
      expect(data.providers.map((provider) => provider.id)).toEqual([
        "openrouter",
        "groq",
      ]);
      for (const provider of data.providers) {
        expect(provider.models.length).toBeGreaterThan(0);
        expect(provider.supportsStructuredOutput).toBe(true);
      }
      expect(JSON.stringify(body)).not.toContain("apiKey");
    });

    it("rejects anonymous project creation with AUTH_REQUIRED", async () => {
      const response = await request(server)
        .post("/api/projects")
        .send({ idea: IDEA });
      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        status: false,
        statusCode: 401,
        error: { code: "AUTH_REQUIRED" },
      });
    });

    it("validates project creation input", async () => {
      const response = await request(server)
        .post("/api/projects")
        .set("Authorization", `Bearer ${token}`)
        .send({ idea: "" });
      expect(response.status).toBe(400);
      const body = response.body as Envelope<null>;
      expect(body).toMatchObject({
        status: false,
        statusCode: 400,
        error: { code: "VALIDATION_ERROR" },
      });
    });

    it("rejects bodies above MAX_REQUEST_BYTES with the envelope", async () => {
      const response = await request(server)
        .post("/api/projects")
        .set("Authorization", `Bearer ${token}`)
        .send({ idea: "x".repeat(4000) });
      expect(response.status).toBe(413);
      expect(response.body).toMatchObject({
        status: false,
        statusCode: 413,
        error: { code: "PAYLOAD_TOO_LARGE" },
      });
    });

    it("creates a project and protects it with the access key", async () => {
      const created = await createProject(server, token);

      const denied = await request(server).get(
        `/api/projects/${created.project.id}`,
      );
      expect(denied.status).toBe(403);
      expect(denied.body).toMatchObject({
        error: { code: "PROJECT_ACCESS_DENIED" },
      });

      const wrongKey = await request(server)
        .get(`/api/projects/${created.project.id}`)
        .set("x-project-key", "not-the-key");
      expect(wrongKey.status).toBe(403);

      const allowed = await request(server)
        .get(`/api/projects/${created.project.id}`)
        .set("x-project-key", created.accessKey);
      expect(allowed.status).toBe(200);
      expect(allowed.body).toMatchObject({
        data: {
          id: created.project.id,
          status: "requirements_pending",
          confirmedAt: null,
        },
      });
    });

    it("generates, confirms, and versions the architecture", async () => {
      const created = await createProject(server);
      const projectId = created.project.id;
      const key = created.accessKey;

      // Scoped regeneration is Pro-only; the journey covers the success
      // path, so promote this throwaway owner before the regen step.
      if (created.project.ownerId) {
        const users = app.get(USER_REPOSITORY) as UserRepository;
        await users.updatePlanTier(created.project.ownerId, "pro");
      }

      const requirementsRunId = await startRequirements(server, projectId, key);
      const requirementsRun = await waitForRun(
        server,
        requirementsRunId,
        key,
      );
      expect(requirementsRun).toMatchObject({
        status: "succeeded",
        type: "requirements",
        provider: "mock",
        model: "test/model",
      });
      expect(requirementsRun.stages.map((stage) => stage.name)).toEqual([
        "analyze_idea",
        "persist",
      ]);
      expect(
        requirementsRun.stages.every((stage) => stage.status === "succeeded"),
      ).toBe(true);
      expect(requirementsRun.usage.totalTokens).toBeGreaterThan(0);

      const generated = await request(server)
        .get(`/api/projects/${projectId}/requirements`)
        .set("x-project-key", key);
      expect(generated.status).toBe(200);
      const spec = (generated.body as Envelope<RequirementsResponse>).data.spec;
      if (!spec) {
        throw new Error("Expected generated requirements.");
      }
      expect(spec.functional[0]?.id).toMatch(/^fr_/);
      expect(spec.nonFunctional[0]?.id).toMatch(/^nfr_/);

      const confirmed = await request(server)
        .put(`/api/projects/${projectId}/requirements`)
        .set("x-project-key", key)
        .send({
          functional: spec.functional.map(({ id, text, priority }) => ({
            id,
            text,
            priority,
          })),
          nonFunctional: spec.nonFunctional.map(
            ({ id, text, priority, category, target }) => ({
              id,
              text,
              priority,
              category,
              target,
            }),
          ),
          assumptions: spec.assumptions.map(({ id, text }) => ({ id, text })),
          clarifications: spec.clarifications.map(
            ({ id, question, answer }) => ({ id, question, answer }),
          ),
          confirm: true,
        });
      expect(confirmed.status).toBe(200);
      expect(
        (confirmed.body as Envelope<RequirementsResponse>).data.confirmedAt,
      ).toEqual(expect.any(String));

      const architectureRunId = (
        await request(server)
          .post(`/api/projects/${projectId}/architecture`)
          .set("x-project-key", key)
          .send({})
      ).body.data.runId as string;
      const architectureRun = await waitForRun(
        server,
        architectureRunId,
        key,
      );
      expect(architectureRun.status).toBe("succeeded");
      expect(architectureRun.stages.map((stage) => stage.name)).toEqual([
        "hld_model",
        "lld_dsa_model",
        "validate",
        "persist",
      ]);

      const first = await request(server)
        .get(`/api/projects/${projectId}/architecture`)
        .set("x-project-key", key);
      const firstBody = (first.body as Envelope<GetArchitectureResponse>).data;
      if (!firstBody.version) {
        throw new Error("Expected the first architecture version.");
      }
      expect(firstBody.version.version).toBe(1);
      expect(firstBody.version.model.meta.title).toBe("Collaborative workspace");
      expect(firstBody.version.validation.valid).toBe(true);
      expect(
        firstBody.version.validation.warnings.map((warning) => warning.rule),
      ).toContain("unreferenced_must_requirement");

      const regenerate = await request(server)
        .post(`/api/projects/${projectId}/architecture/regenerate`)
        .set("x-project-key", key)
        .send({ scope: "dsa" });
      expect(regenerate.status).toBe(202);
      const scopedRun = await waitForRun(
        server,
        regenerate.body.data.runId as string,
        key,
      );
      expect(scopedRun.status).toBe("succeeded");
      expect(scopedRun.scope).toBe("dsa");
      expect(scopedRun.stages.map((stage) => stage.name)).toEqual([
        "dsa_model",
        "validate",
        "persist",
      ]);

      const second = await request(server)
        .get(`/api/projects/${projectId}/architecture`)
        .set("x-project-key", key);
      const secondVersion = (
        second.body as Envelope<GetArchitectureResponse>
      ).data.version;
      if (!secondVersion) {
        throw new Error("Expected the regenerated architecture version.");
      }
      expect(secondVersion.version).toBe(2);
      expect(secondVersion.model.hld).toEqual(firstBody.version.model.hld);
      expect(secondVersion.model.lld).toEqual(firstBody.version.model.lld);
      expect(secondVersion.model.dsa).toEqual(firstBody.version.model.dsa);
      expect(JSON.stringify(secondVersion.model.hld)).toBe(
        JSON.stringify(firstBody.version.model.hld),
      );
      expect(JSON.stringify(secondVersion.model.lld)).toBe(
        JSON.stringify(firstBody.version.model.lld),
      );

      const project = await request(server)
        .get(`/api/projects/${projectId}`)
        .set("x-project-key", key);
      expect(project.body).toMatchObject({
        data: { status: "architecture_ready", currentArchitectureVersion: 2 },
      });
    });

    it("requires confirmed requirements before architecture generation", async () => {
      const created = await createProject(server);
      const response = await request(server)
        .post(`/api/projects/${created.project.id}/architecture`)
        .set("x-project-key", created.accessKey)
        .send({});
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        error: {
          code: "VALIDATION_ERROR",
          details: { reason: "requirements_not_confirmed" },
        },
      });
    });

    it("protects run polling with the project key", async () => {
      const missing = await request(server).get(
        "/api/runs/00000000-0000-0000-0000-000000000000",
      );
      expect(missing.status).toBe(403);

      const created = await createProject(server);
      const unknown = await request(server)
        .get("/api/runs/00000000-0000-0000-0000-000000000000")
        .set("x-project-key", created.accessKey);
      expect(unknown.status).toBe(404);
      expect(unknown.body).toMatchObject({ error: { code: "RUN_NOT_FOUND" } });
    });
  });

  describe("run failures and conflicts", () => {
    let app: INestApplication<App>;
    let server: App;
    const provider = new ControlledProvider();

    beforeAll(async () => {
      ({ app, server } = await createTestApp({}, provider));
    });

    afterAll(async () => {
      await app.close();
    });

    it("rejects a second active run for the same project", async () => {
      const created = await createProject(server);
      const block = provider.armBlock();
      const runId = await startRequirements(
        server,
        created.project.id,
        created.accessKey,
      );
      await block.started;

      const conflict = await request(server)
        .post(`/api/projects/${created.project.id}/requirements`)
        .set("x-project-key", created.accessKey)
        .send({});
      expect(conflict.status).toBe(409);
      expect(conflict.body).toMatchObject({
        error: { code: "RUN_CONFLICT" },
      });

      block.release();
      const run = await waitForRun(server, runId, created.accessKey);
      expect(run.status).toBe("succeeded");
    });

    it("allows only one of two simultaneous run starts", async () => {
      const created = await createProject(server);
      const block = provider.armBlock();
      const start = () =>
        request(server)
          .post(`/api/projects/${created.project.id}/requirements`)
          .set("x-project-key", created.accessKey)
          .send({});

      const responses = await Promise.all([start(), start()]);
      expect(
        responses.map((response) => response.status).sort((a, b) => a - b),
      ).toEqual([
        202, 409,
      ]);
      const accepted = responses.find((response) => response.status === 202);
      const rejected = responses.find((response) => response.status === 409);
      if (!accepted || !rejected) {
        throw new Error("Expected one accepted and one rejected start.");
      }
      expect(rejected.body).toMatchObject({
        error: { code: "RUN_CONFLICT" },
      });

      await block.started;
      block.release();
      const run = await waitForRun(
        server,
        accepted.body.data.runId as string,
        created.accessKey,
      );
      expect(run.status).toBe("succeeded");
    });

    it("streams persisted and live stage events, then closes", async () => {
      const owner = await register(
        server,
        `sse-owner-${Date.now()}@example.com`,
      );
      const created = await createProject(server, owner.accessToken);
      const block = provider.armBlock();
      const runId = await startRequirements(
        server,
        created.project.id,
        created.accessKey,
      );
      await block.started;

      const stream = collectSse(
        server,
        `/api/runs/${runId}/events`,
        { "x-project-key": created.accessKey },
      );
      await stream.opened;
      block.release();
      const streamed = await stream.done;

      expect(streamed.status).toBe(200);
      expect(streamed.headers["content-type"]).toContain("text/event-stream");
      expect(streamed.headers["cache-control"]).toContain("no-cache");
      expect(streamed.headers["x-accel-buffering"]).toBe("no");
      expect(streamed.body).not.toContain(created.accessKey);

      const frames = parseSse(streamed.body);
      expect(frames.every((frame) => frame.event === frame.data.type)).toBe(true);
      const stageFrames = frames.filter((frame) => frame.data.type === "stage");
      const stageNames = [
        ...new Set(
          stageFrames.map((frame) =>
            frame.data.type === "stage" ? frame.data.name : "",
          ),
        ),
      ].filter(Boolean);
      expect(stageNames).toEqual(["analyze_idea", "persist"]);
      expect(
        stageFrames.some(
          (frame) =>
            frame.data.type === "stage" && frame.data.status === "running",
        ),
      ).toBe(true);
      expect(frames.at(-1)?.data).toMatchObject({
        type: "run",
        status: "succeeded",
      });
      const terminal = frames.at(-1)?.data;
      if (!terminal || terminal.type !== "run") {
        throw new Error("Expected a terminal run frame.");
      }
      expect(terminal.usage.totalTokens).toBeGreaterThan(0);

      const ownerStream = collectSse(
        server,
        `/api/runs/${runId}/events`,
        { Authorization: `Bearer ${owner.accessToken}` },
      );
      await ownerStream.opened;
      const ownerReplay = await ownerStream.done;
      expect(ownerReplay.status).toBe(200);
      expect(parseSse(ownerReplay.body).at(-1)?.data).toMatchObject({
        type: "run",
        status: "succeeded",
      });

      const polled = await request(server)
        .get(`/api/runs/${runId}`)
        .set("x-project-key", created.accessKey);
      const polledRun = (polled.body as Envelope<GenerationRun>).data;
      expect(polledRun.stages.map((stage) => stage.name)).toEqual(stageNames);
      expect(polledRun.status).toBe("succeeded");

      const resumeId = stageFrames.find(
        (frame) =>
          frame.data.type === "stage" &&
          frame.data.status === "succeeded" &&
          frame.id,
      )?.id;
      if (!resumeId) {
        throw new Error("Expected a stage event id.");
      }
      const replay = collectSse(
        server,
        `/api/runs/${runId}/events`,
        {
          "x-project-key": created.accessKey,
          "Last-Event-ID": resumeId,
        },
      );
      await replay.opened;
      const replayed = parseSse((await replay.done).body);
      expect(replayed[0]?.data).toMatchObject({
        type: "stage",
        name: "persist",
      });
      expect(replayed.at(-1)?.data).toMatchObject({
        type: "run",
        status: "succeeded",
      });
    });

    it("protects the event stream like run polling", async () => {
      const created = await createProject(server);
      const block = provider.armBlock();
      const runId = await startRequirements(
        server,
        created.project.id,
        created.accessKey,
      );
      await block.started;

      const noAuth = await request(server).get(
        `/api/runs/${runId}/events`,
      );
      expect(noAuth.status).toBe(403);

      const invalidToken = await request(server)
        .get(`/api/runs/${runId}/events`)
        .set("Authorization", "Bearer not-a-session");
      expect(invalidToken.status).toBe(401);

      const unknown = await request(server)
        .get("/api/runs/00000000-0000-4000-8000-000000000000/events")
        .set("x-project-key", created.accessKey);
      expect(unknown.status).toBe(404);
      expect(unknown.body).toMatchObject({ error: { code: "RUN_NOT_FOUND" } });

      block.release();
      await waitForRun(server, runId, created.accessKey);
    });

    it("fails the run when model output stays invalid", async () => {
      const created = await createProject(server);
      provider.rejectSchema();
      const runId = await startRequirements(
        server,
        created.project.id,
        created.accessKey,
      );
      const run = await waitForRun(server, runId, created.accessKey);

      expect(run.status).toBe("failed");
      expect(run.error).toMatchObject({
        code: "GENERATION_REPAIR_FAILED",
        details: { attempts: 2 },
      });
      const failedStage = run.stages.find(
        (stage) => stage.name === "analyze_idea",
      );
      expect(failedStage).toMatchObject({
        status: "failed",
        error: { code: "GENERATION_REPAIR_FAILED" },
      });
      expect(run.provider).toBe("mock");
    });

    it("fails with GENERATION_REPAIR_FAILED after invalid JSON twice", async () => {
      const created = await createProject(server);
      provider.rejectJson();
      const runId = await startRequirements(
        server,
        created.project.id,
        created.accessKey,
      );
      const run = await waitForRun(server, runId, created.accessKey);

      expect(run.status).toBe("failed");
      expect(run.error).toMatchObject({
        code: "GENERATION_REPAIR_FAILED",
        details: { attempts: 2 },
      });
    });

    it("persists provider usage from a failed call on the run and stage", async () => {
      const created = await createProject(server);
      provider.truncate();
      const runId = await startRequirements(
        server,
        created.project.id,
        created.accessKey,
      );
      const run = await waitForRun(server, runId, created.accessKey);

      expect(run.status).toBe("failed");
      expect(run.error?.code).toBe("GENERATION_REPAIR_FAILED");
      expect(run.usage).toMatchObject({
        promptTokens: 1_200,
        completionTokens: 4_000,
        totalTokens: 5_200,
      });
      const failedStage = run.stages.find(
        (stage) => stage.name === "analyze_idea",
      );
      expect(failedStage?.usage).toMatchObject({
        promptTokens: 1_200,
        completionTokens: 4_000,
      });
    });
  });

  describe("throttling", () => {
    let app: INestApplication<App>;
    let server: App;

    beforeAll(async () => {
      ({ app, server } = await createTestApp({ THROTTLE_LIMIT: "1" }));
    });

    afterAll(async () => {
      await app.close();
    });

    it("returns QUOTA_EXCEEDED when the run-start limit is hit", async () => {
      const created = await createProject(server);
      const firstRunId = await startRequirements(
        server,
        created.project.id,
        created.accessKey,
      );

      const throttled = await request(server)
        .post(`/api/projects/${created.project.id}/requirements`)
        .set("x-project-key", created.accessKey)
        .send({});
      expect(throttled.status).toBe(429);
      expect(throttled.body).toMatchObject({
        status: false,
        statusCode: 429,
        error: { code: "QUOTA_EXCEEDED" },
      });

      await waitForRun(server, firstRunId, created.accessKey);
    });
  });
});