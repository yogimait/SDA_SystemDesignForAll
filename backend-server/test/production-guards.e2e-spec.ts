import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type {
  AuthResponse,
  BillingPlansResponse,
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

async function createProductionApp(): Promise<{
  app: INestApplication<App>;
  server: App;
}> {
  Object.assign(process.env, {
    NODE_ENV: "production",
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
    STRIPE_SECRET_KEY: "",
    STRIPE_WEBHOOK_SECRET: "",
    STRIPE_PRICE_PRO: "",
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

describe("Production deployment guards (e2e)", () => {
  let app: INestApplication<App>;
  let server: App;

  beforeAll(async () => {
    ({ app, server } = await createProductionApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it("hides the dev outbox route", async () => {
    const response = await request(server).get("/api/dev/outbox");
    expect(response.status).toBe(404);
    expect((response.body as Envelope<null>).error?.code).toBe(
      "ROUTE_NOT_FOUND",
    );
  });

  it("never advertises or starts stub checkout", async () => {
    const plans = await request(server).get("/api/billing/plans");
    expect(plans.status).toBe(200);
    const data = BillingPlansResponseSchema.parse(
      (plans.body as Envelope<BillingPlansResponse>).data,
    );
    expect(data.provider).toBe("stub");
    expect(data.checkoutCompletable).toBe(false);

    const registered = await request(server)
      .post("/api/auth/register")
      .send({ email: "prod-billing@example.com", password: "password123" });
    expect(registered.status).toBe(201);
    const auth = (registered.body as Envelope<AuthResponse>).data;

    const checkout = await request(server)
      .post("/api/billing/checkout")
      .set("Authorization", `Bearer ${auth.accessToken}`)
      .send({ plan: "pro" });
    expect(checkout.status).toBe(502);
    expect((checkout.body as Envelope<null>).error?.code).toBe(
      "PROVIDER_UNAVAILABLE",
    );
  });
});
