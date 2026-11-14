import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import type { App } from "supertest/types";
import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/bootstrap.js";

interface Envelope {
  status: boolean;
  statusCode: number;
  error?: { code: string };
}

describe("Signup throttle (e2e)", () => {
  let app: INestApplication<App>;
  let server: App;

  beforeAll(async () => {
    Object.assign(process.env, {
      NODE_ENV: "test",
      PGLITE_DATA_DIR: "memory://",
      MOCK_PROVIDER: "1",
      DEFAULT_MODEL: "test/model",
      THROTTLE_LIMIT: "1000",
      THROTTLE_TTL_MS: "60000",
      AUTH_THROTTLE_LIMIT: "1000",
      AUTH_THROTTLE_TTL_MS: "60000",
      SIGNUP_THROTTLE_LIMIT: "1",
      SIGNUP_THROTTLE_TTL_MS: "60000",
      GENERATION_THROTTLE_LIMIT: "1000",
      GENERATION_THROTTLE_TTL_MS: "60000",
      GENERATION_MAX_QUEUED: "1000",
      MAX_REQUEST_BYTES: "1000000",
    });
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<INestApplication<App>>(undefined, {
      bodyParser: false,
    });
    configureApp(app);
    await app.init();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  it("blocks the second signup from the same IP with Retry-After", async () => {
    const first = await request(server)
      .post("/api/auth/register")
      .send({ email: "signup-one@example.com", password: "Password123!" });
    expect(first.status).toBe(201);

    const second = await request(server)
      .post("/api/auth/register")
      .send({ email: "signup-two@example.com", password: "Password123!" });
    expect(second.status).toBe(429);
    expect((second.body as Envelope).error?.code).toBe("QUOTA_EXCEEDED");
    expect(Number(second.headers["retry-after"])).toBeGreaterThan(0);
  });
});
