import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { AuthResponse, AdminAbuseData } from "@sda/contracts";
import { AdminAbuseDataSchema } from "@sda/contracts";
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

async function createApp(): Promise<{ app: INestApplication<App>; server: App }> {
  Object.assign(process.env, {
    NODE_ENV: "test",
    PGLITE_DATA_DIR: "memory://",
    MOCK_PROVIDER: "1",
    DEFAULT_MODEL: "test/model",
    THROTTLE_LIMIT: "1000",
    THROTTLE_TTL_MS: "60000",
    AUTH_THROTTLE_LIMIT: "1000",
    AUTH_THROTTLE_TTL_MS: "60000",
    SIGNUP_THROTTLE_LIMIT: "1000",
    SIGNUP_THROTTLE_TTL_MS: "60000",
    GENERATION_THROTTLE_LIMIT: "1000",
    GENERATION_THROTTLE_TTL_MS: "60000",
    GENERATION_MAX_QUEUED: "1000",
    REQUIRE_EMAIL_VERIFICATION: "0",
    ADMIN_EMAILS: "admin@example.com",
    MAX_REQUEST_BYTES: "1000000",
  });
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

async function register(server: App, email: string): Promise<AuthResponse> {
  const response = await request(server)
    .post("/api/auth/register")
    .send({ email, password: "Password123!" });
  if (response.status !== 201) {
    throw new Error(`Registration failed: ${response.status}`);
  }
  return (response.body as Envelope<AuthResponse>).data;
}

describe("Admin abuse dashboard access (e2e)", () => {
  let app: INestApplication<App>;
  let server: App;

  beforeAll(async () => {
    ({ app, server } = await createApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it("rejects anonymous and non-admin accounts", async () => {
    const anonymous = await request(server).get("/api/admin/abuse");
    expect(anonymous.status).toBe(401);

    const user = await register(server, "normal@example.com");
    const denied = await request(server)
      .get("/api/admin/abuse")
      .set("Authorization", `Bearer ${user.accessToken}`);
    expect(denied.status).toBe(403);
    expect((denied.body as Envelope<null>).error?.code).toBe(
      "ADMIN_ACCESS_DENIED",
    );
  });

  it("returns the abuse snapshot to an allowlisted admin", async () => {
    const admin = await register(server, "admin@example.com");
    const response = await request(server)
      .get("/api/admin/abuse?range=last_7_days")
      .set("Authorization", `Bearer ${admin.accessToken}`);
    expect(response.status).toBe(200);
    const data = AdminAbuseDataSchema.parse(
      (response.body as Envelope<AdminAbuseData>).data,
    );
    expect(data.range).toBe("last_7_days");
    expect(data.buckets).toHaveLength(7);
    expect(data.totals.totalUsers).toBeGreaterThanOrEqual(2);
    expect(data.topUsers).toEqual([]);
  });
});
