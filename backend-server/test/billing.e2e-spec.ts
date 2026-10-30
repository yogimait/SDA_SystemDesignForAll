import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type {
  AuthResponse,
  BillingPlansResponse,
  BillingSubscriptionResponse,
  CheckoutResponse,
  User,
} from "@sda/contracts";
import { BillingPlansResponseSchema } from "@sda/contracts";
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
): Promise<{
  app: INestApplication<App>;
  server: App;
}> {
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

async function register(server: App, email: string): Promise<AuthResponse> {
  const response = await request(server)
    .post("/api/auth/register")
    .send({ email, password: "password123" });
  expect(response.status).toBe(201);
  return (response.body as Envelope<AuthResponse>).data;
}

function auth(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

describe("Billing (e2e)", () => {
  let app: INestApplication<App>;
  let server: App;

  beforeAll(async () => {
    ({ app, server } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it("publishes the plan catalogue without authentication", async () => {
    const response = await request(server).get("/api/billing/plans");
    expect(response.status).toBe(200);
    const data = BillingPlansResponseSchema.parse(
      (response.body as Envelope<BillingPlansResponse>).data,
    );
    expect(data.provider).toBe("stub");
    expect(data.checkoutCompletable).toBe(true);
    expect(data.plans.map((plan) => plan.id)).toEqual(["free", "pro"]);
    expect(data.plans[1]?.limits.projects).toBeGreaterThan(
      data.plans[0]?.limits.projects ?? 0,
    );
  });

  it("starts on Free and exposes no subscription", async () => {
    const user = await register(server, "billing@example.com");
    const response = await request(server)
      .get("/api/billing/subscription")
      .set(auth(user.accessToken));
    expect(response.status).toBe(200);
    expect((response.body as Envelope<BillingSubscriptionResponse>).data).toEqual(
      { subscription: null, planTier: "free" },
    );
  });

  it("completes a stub checkout only for the user who started it", async () => {
    const owner = await register(server, "billing-owner@example.com");
    const other = await register(server, "billing-other@example.com");

    const checkout = await request(server)
      .post("/api/billing/checkout")
      .set(auth(owner.accessToken))
      .send({ plan: "pro" });
    expect(checkout.status).toBe(201);
    const session = (checkout.body as Envelope<CheckoutResponse>).data;
    expect(session.provider).toBe("stub");
    expect(session.url).toContain(session.checkoutId);

    const foreign = await request(server)
      .post(`/api/billing/checkout/${session.checkoutId}/complete`)
      .set(auth(other.accessToken));
    expect(foreign.status).toBe(404);
    expect((foreign.body as Envelope<null>).error?.code).toBe("ROUTE_NOT_FOUND");

    const completed = await request(server)
      .post(`/api/billing/checkout/${session.checkoutId}/complete`)
      .set(auth(owner.accessToken));
    expect(completed.status).toBe(200);
    const result = (completed.body as Envelope<BillingSubscriptionResponse>)
      .data;
    expect(result.planTier).toBe("pro");
    expect(result.subscription).toMatchObject({
      plan: "pro",
      status: "active",
      provider: "stub",
      cancelAtPeriodEnd: false,
    });
    expect(result.subscription?.currentPeriodEnd).toEqual(expect.any(String));

    const me = await request(server)
      .get("/api/auth/me")
      .set(auth(owner.accessToken));
    expect((me.body as Envelope<User>).data.planTier).toBe("pro");

    // The checkout id is single use.
    const second = await request(server)
      .post(`/api/billing/checkout/${session.checkoutId}/complete`)
      .set(auth(owner.accessToken));
    expect(second.status).toBe(404);
  });

  it("cancels the stub subscription and downgrades to Free", async () => {
    const login = await request(server)
      .post("/api/auth/login")
      .send({ email: "billing-owner@example.com", password: "password123" });
    const user = (login.body as Envelope<AuthResponse>).data;

    const canceled = await request(server)
      .post("/api/billing/cancel")
      .set(auth(user.accessToken));
    expect(canceled.status).toBe(200);
    const result = (canceled.body as Envelope<BillingSubscriptionResponse>).data;
    expect(result.planTier).toBe("free");
    expect(result.subscription).toMatchObject({
      status: "canceled",
      cancelAtPeriodEnd: true,
    });

    const again = await request(server)
      .post("/api/billing/cancel")
      .set(auth(user.accessToken));
    expect(again.status).toBe(200);
  });

  it("returns a portal URL and rejects an unsigned webhook", async () => {
    const login = await request(server)
      .post("/api/auth/login")
      .send({ email: "billing@example.com", password: "password123" });
    const user = (login.body as Envelope<AuthResponse>).data;

    const portal = await request(server)
      .post("/api/billing/portal")
      .set(auth(user.accessToken));
    expect(portal.status).toBe(200);
    expect((portal.body as Envelope<{ url: string }>).data.url).toContain(
      "/account/billing",
    );

    const webhook = await request(server)
      .post("/api/billing/webhook")
      .set("Content-Type", "application/json")
      .send({ id: "evt_dev", type: "checkout.session.completed" });
    expect(webhook.status).toBe(400);
    expect((webhook.body as Envelope<null>).error).toMatchObject({
      code: "VALIDATION_ERROR",
      details: { reason: "webhook_invalid" },
    });
  });

  it("requires authentication for subscription routes", async () => {
    expect((await request(server).get("/api/billing/subscription")).status).toBe(
      401,
    );
    expect(
      (await request(server).post("/api/billing/checkout").send({ plan: "pro" }))
        .status,
    ).toBe(401);
  });
});
