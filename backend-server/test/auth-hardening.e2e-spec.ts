import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type {
  AuthResponse,
  CreateProjectResponse,
  DevOutboxResponse,
  Project,
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

function setEnv(overrides: Record<string, string> = {}): void {
  Object.assign(process.env, {
    NODE_ENV: "test",
    PGLITE_DATA_DIR: "memory://",
    MOCK_PROVIDER: "1",
    DEFAULT_PROVIDER: "openrouter",
    DEFAULT_MODEL: "test/model",
    GENERATION_POLL_INTERVAL_MS: "10",
    THROTTLE_LIMIT: "1000",
    THROTTLE_TTL_MS: "60000",
    AUTH_THROTTLE_LIMIT: "1000",
    AUTH_THROTTLE_TTL_MS: "60000",
    REQUIRE_EMAIL_VERIFICATION: "0",
    MAX_REQUEST_BYTES: "1000000",
    ...overrides,
  });
}

async function createTestApp(
  overrides: Record<string, string> = {},
): Promise<{ app: INestApplication<App>; server: App }> {
  setEnv(overrides);
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

function cookieValue(
  headers: Record<string, unknown>,
  name: string,
): string | undefined {
  const raw = headers["set-cookie"];
  const cookies = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];
  for (const cookie of cookies) {
    const [pair] = cookie.split(";");
    const separator = pair.indexOf("=");
    if (separator === -1) continue;
    if (pair.slice(0, separator) === name) {
      return pair.slice(separator + 1);
    }
  }
  return undefined;
}

function cookieHeader(headers: Record<string, unknown>): string {
  return [`sda_refresh=${cookieValue(headers, "sda_refresh") ?? ""}`, `sda_csrf=${cookieValue(headers, "sda_csrf") ?? ""}`].join(
    "; ",
  );
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
  return (response.body as Envelope<AuthResponse>).data;
}

async function latestOutbox(server: App): Promise<DevOutboxResponse> {
  const response = await request(server).get("/api/dev/outbox");
  expect(response.status).toBe(200);
  return (response.body as Envelope<DevOutboxResponse>).data;
}

function tokenFromLink(link: string): string {
  const token = new URL(link).searchParams.get("token");
  if (!token) throw new Error(`Outbox link has no token: ${link}`);
  return token;
}

describe("Auth hardening (e2e)", () => {
  let app: INestApplication<App>;
  let server: App;

  beforeAll(async () => {
    ({ app, server } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it("verifies an email with a single-use outbox token", async () => {
    await register(server, "verify@example.com");
    const outbox = await latestOutbox(server);
    const message = outbox.messages.find(
      (item) => item.kind === "email_verification",
    );
    expect(message).toBeDefined();
    expect(message?.recipient).toBe("verify@example.com");
    const token = tokenFromLink(message!.link);

    const verified = await request(server)
      .post("/api/auth/verify-email")
      .send({ token });
    expect(verified.status).toBe(200);

    const reused = await request(server)
      .post("/api/auth/verify-email")
      .send({ token });
    expect(reused.status).toBe(401);
    expect((reused.body as Envelope<null>).error).toMatchObject({
      code: "AUTH_INVALID_CREDENTIALS",
      details: { reason: "verification_invalid" },
    });

    const login = await request(server)
      .post("/api/auth/login")
      .send({ email: "verify@example.com", password: "password123" });
    expect(login.status).toBe(200);
    const user = (login.body as Envelope<AuthResponse>).data.user;
    expect(user.emailVerifiedAt).toEqual(expect.any(String));
  });

  it("rotates the refresh cookie and revokes the family on reuse", async () => {
    const login = await request(server)
      .post("/api/auth/login")
      .send({ email: "verify@example.com", password: "password123" });
    expect(login.status).toBe(200);
    const cookies = cookieHeader(login.headers);
    const csrf = cookieValue(login.headers, "sda_csrf");
    expect(csrf).toBeTruthy();

    const first = await request(server)
      .post("/api/auth/refresh")
      .set("Cookie", cookies)
      .set("x-csrf-token", csrf!)
      .send({});
    expect(first.status).toBe(200);
    const rotatedCookies = cookieHeader(first.headers);
    const rotatedCsrf = cookieValue(first.headers, "sda_csrf");
    expect(rotatedCookies).not.toBe(cookies);
    expect(
      (first.body as Envelope<AuthResponse>).data.accessToken,
    ).not.toBe((login.body as Envelope<AuthResponse>).data.accessToken);

    // Replaying the old cookie is reuse: the whole family is revoked.
    const replay = await request(server)
      .post("/api/auth/refresh")
      .set("Cookie", cookies)
      .set("x-csrf-token", csrf!)
      .send({});
    expect(replay.status).toBe(401);
    expect((replay.body as Envelope<null>).error).toMatchObject({
      details: { reason: "reuse" },
    });

    const afterRevoke = await request(server)
      .post("/api/auth/refresh")
      .set("Cookie", rotatedCookies)
      .set("x-csrf-token", rotatedCsrf!)
      .send({});
    expect(afterRevoke.status).toBe(401);
  });

  it("rejects refresh without a CSRF token or from a foreign origin", async () => {
    const login = await request(server)
      .post("/api/auth/login")
      .send({ email: "verify@example.com", password: "password123" });
    const cookies = cookieHeader(login.headers);
    const csrf = cookieValue(login.headers, "sda_csrf");

    const missing = await request(server)
      .post("/api/auth/refresh")
      .set("Cookie", cookies)
      .send({});
    expect(missing.status).toBe(400);
    expect((missing.body as Envelope<null>).error).toMatchObject({
      details: { reason: "csrf_invalid" },
    });

    const foreign = await request(server)
      .post("/api/auth/refresh")
      .set("Cookie", cookies)
      .set("x-csrf-token", csrf!)
      .set("Origin", "https://evil.example")
      .send({});
    expect(foreign.status).toBe(400);
    expect((foreign.body as Envelope<null>).error).toMatchObject({
      details: { reason: "origin_not_allowed" },
    });

    const allowed = await request(server)
      .post("/api/auth/refresh")
      .set("Cookie", cookies)
      .set("x-csrf-token", csrf!)
      .set("Origin", "http://localhost:3000")
      .send({});
    expect(allowed.status).toBe(200);
  });

  it("resets a password with a single-use token and revokes sessions", async () => {
    const anonymous = await request(server)
      .post("/api/auth/forgot-password")
      .send({ email: "nobody@example.com" });
    expect(anonymous.status).toBe(200);

    const requested = await request(server)
      .post("/api/auth/forgot-password")
      .send({ email: "verify@example.com" });
    expect(requested.status).toBe(200);
    const outbox = await latestOutbox(server);
    const resetMessage = outbox.messages.find(
      (item) =>
        item.kind === "password_reset" &&
        item.recipient === "verify@example.com",
    );
    expect(resetMessage).toBeDefined();
    const token = tokenFromLink(resetMessage!.link);

    const reset = await request(server)
      .post("/api/auth/reset-password")
      .send({ token, password: "newpassword123" });
    expect(reset.status).toBe(200);

    const reused = await request(server)
      .post("/api/auth/reset-password")
      .send({ token, password: "another123" });
    expect(reused.status).toBe(401);

    const oldPassword = await request(server)
      .post("/api/auth/login")
      .send({ email: "verify@example.com", password: "password123" });
    expect(oldPassword.status).toBe(401);
    const newPassword = await request(server)
      .post("/api/auth/login")
      .send({ email: "verify@example.com", password: "newpassword123" });
    expect(newPassword.status).toBe(200);
  });

  it("logs out with only the refresh cookie and CSRF token", async () => {
    const created = await request(server)
      .post("/api/auth/register")
      .send({ email: "cookie-logout@example.com", password: "password123" });
    expect(created.status).toBe(201);
    const cookies = cookieHeader(created.headers);
    const csrf = cookieValue(created.headers, "sda_csrf");
    expect(csrf).toBeTruthy();

    const logout = await request(server)
      .post("/api/auth/logout")
      .set("Cookie", cookies)
      .set("x-csrf-token", csrf!)
      .send({});
    expect(logout.status).toBe(200);

    const afterLogout = await request(server)
      .post("/api/auth/refresh")
      .set("Cookie", cookies)
      .set("x-csrf-token", csrf!)
      .send({});
    expect(afterLogout.status).toBe(401);

    const anonymous = await request(server)
      .post("/api/auth/logout")
      .send({});
    expect(anonymous.status).toBe(401);
  });

  it("deletes the account after password re-entry and keeps the project key working", async () => {
    const created = await request(server)
      .post("/api/auth/register")
      .send({ email: "delete@example.com", password: "password123" });
    const auth = (created.body as Envelope<AuthResponse>).data;
    const project = await request(server)
      .post("/api/projects")
      .set("Authorization", `Bearer ${auth.accessToken}`)
      .send({ idea: "Project that outlives its owner." });
    expect(project.status).toBe(201);
    const projectData = (project.body as Envelope<CreateProjectResponse>).data;

    const cookieAuth = cookieHeader(created.headers);
    const csrfMissing = await request(server)
      .delete("/api/users/me")
      .set("Authorization", `Bearer ${auth.accessToken}`)
      .set("Cookie", cookieAuth)
      .send({ password: "password123" });
    expect(csrfMissing.status).toBe(400);
    expect((csrfMissing.body as Envelope<null>).error).toMatchObject({
      details: { reason: "csrf_invalid" },
    });

    const wrong = await request(server)
      .delete("/api/users/me")
      .set("Authorization", `Bearer ${auth.accessToken}`)
      .send({ password: "wrong-password" });
    expect(wrong.status).toBe(401);

    const deleted = await request(server)
      .delete("/api/users/me")
      .set("Authorization", `Bearer ${auth.accessToken}`)
      .send({ password: "password123" });
    expect(deleted.status).toBe(200);

    const me = await request(server)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${auth.accessToken}`);
    expect(me.status).toBe(401);

    const orphaned = await request(server)
      .get(`/api/projects/${projectData.project.id}`)
      .set("x-project-key", projectData.accessKey);
    expect(orphaned.status).toBe(200);
    expect((orphaned.body as Envelope<Project>).data.ownerId).toBeNull();

    const login = await request(server)
      .post("/api/auth/login")
      .send({ email: "delete@example.com", password: "password123" });
    expect(login.status).toBe(401);
  });
});

describe("Email verification gate (e2e)", () => {
  let app: INestApplication<App>;
  let server: App;

  beforeAll(async () => {
    ({ app, server } = await createTestApp({
      REQUIRE_EMAIL_VERIFICATION: "1",
    }));
  });

  afterAll(async () => {
    await app.close();
  });

  it("blocks project creation and generation until the email is verified", async () => {
    const auth = await register(server, "gate@example.com");
    expect(auth.user.emailVerifiedAt).toBeNull();

    const blocked = await request(server)
      .post("/api/projects")
      .set("Authorization", `Bearer ${auth.accessToken}`)
      .send({ idea: "Blocked until verified." });
    expect(blocked.status).toBe(401);
    expect((blocked.body as Envelope<null>).error).toMatchObject({
      code: "AUTH_REQUIRED",
      details: { reason: "email_not_verified" },
    });

    const outbox = await latestOutbox(server);
    const message = outbox.messages.find(
      (item) =>
        item.kind === "email_verification" &&
        item.recipient === "gate@example.com",
    );
    const verified = await request(server)
      .post("/api/auth/verify-email")
      .send({ token: tokenFromLink(message!.link) });
    expect(verified.status).toBe(200);

    const allowed = await request(server)
      .post("/api/projects")
      .set("Authorization", `Bearer ${auth.accessToken}`)
      .send({ idea: "Allowed after verification." });
    expect(allowed.status).toBe(201);
  });
});
