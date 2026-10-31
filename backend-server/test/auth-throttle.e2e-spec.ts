import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import type { App } from "supertest/types";
import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/bootstrap.js";

interface Envelope<T> {
  status: boolean;
  statusCode: number;
  data: T;
  error?: { code: string; details?: Record<string, unknown> };
}

describe("Auth throttle (e2e)", () => {  let app: INestApplication<App>;
  let server: App;

  beforeAll(async () => {
    Object.assign(process.env, {
      NODE_ENV: "test",
      PGLITE_DATA_DIR: "memory://",
      MOCK_PROVIDER: "1",
      DEFAULT_MODEL: "test/model",
      THROTTLE_LIMIT: "1000",
      THROTTLE_TTL_MS: "60000",
      AUTH_THROTTLE_LIMIT: "2",
      AUTH_THROTTLE_TTL_MS: "60000",
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

  it("returns 429 with Retry-After after the auth budget is spent", async () => {
    let blocked: Awaited<ReturnType<typeof request>> | undefined;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await request(server)
        .post("/api/auth/login")
        .send({ email: "nobody@example.com", password: "password123" });
      if (response.status === 429) {
        blocked = response;
        break;
      }
    }
    if (!blocked) {
      throw new Error("The auth throttle never blocked a login attempt.");
    }
    expect(blocked.status).toBe(429);
    expect((blocked.body as Envelope<null>).error?.code).toBe("QUOTA_EXCEEDED");
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
  });

  it("throttles the account-deletion password step-up", async () => {
    const registered = await request(server)
      .post("/api/auth/register")
      .send({ email: `step-up-${Date.now()}@example.com`, password: "password123" });
    expect(registered.status).toBe(201);
    const token = (registered.body as Envelope<{ accessToken: string }>).data
      .accessToken;

    const wrongPassword = () =>
      request(server)
        .delete("/api/users/me")
        .set("Authorization", `Bearer ${token}`)
        .send({ password: "wrong-password" });

    expect((await wrongPassword()).status).toBe(401);
    expect((await wrongPassword()).status).toBe(401);

    const blocked = await wrongPassword();
    expect(blocked.status).toBe(429);
    expect((blocked.body as Envelope<null>).error?.code).toBe("QUOTA_EXCEEDED");
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
  });
});
