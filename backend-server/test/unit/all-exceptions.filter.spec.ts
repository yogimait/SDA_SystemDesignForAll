import { HttpException, Logger, type ArgumentsHost } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../../src/common/errors/app-error.js";
import { AllExceptionsFilter } from "../../src/common/errors/all-exceptions.filter.js";

function fakeHost() {
  const json = vi.fn();
  const response = {
    headersSent: false,
    status: vi.fn(),
    json,
  } as {
    headersSent: boolean;
    status: ReturnType<typeof vi.fn>;
    json: typeof json;
  };
  response.status.mockReturnValue(response);
  const host = {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
  return { host, status: response.status, json };
}

describe("AllExceptionsFilter", () => {
  const filter = new AllExceptionsFilter();

  it("maps AppError to its registered status and preserves details", () => {
    const { host, status, json } = fakeHost();
    filter.catch(
      new AppError("VALIDATION_ERROR", "Bad input.", { reason: "empty" }),
      host,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      status: false,
      statusCode: 400,
      message: "Bad input.",
      error: { code: "VALIDATION_ERROR", details: { reason: "empty" } },
    });
  });

  it("maps throttling to QUOTA_EXCEEDED", () => {
    const { host, status, json } = fakeHost();
    filter.catch(new HttpException("Too many requests", 429), host);

    expect(status).toHaveBeenCalledWith(429);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 429,
        error: { code: "QUOTA_EXCEEDED" },
      }),
    );
  });

  it("maps payload and database failures", () => {
    const payload = fakeHost();
    filter.catch(
      Object.assign(new Error("too large"), { type: "entity.too.large" }),
      payload.host,
    );
    expect(payload.status).toHaveBeenCalledWith(413);

    const database = fakeHost();
    filter.catch(
      Object.assign(new Error("connect ECONNREFUSED"), {
        code: "ECONNREFUSED",
      }),
      database.host,
    );
    expect(database.status).toHaveBeenCalledWith(503);
    expect(database.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: { code: "DATABASE_UNAVAILABLE" } }),
    );
  });

  it("redacts secrets in surfaced HTTP messages", () => {
    const { host, json } = fakeHost();
    filter.catch(
      new HttpException("Request failed: apiKey=sk-live-secret", 400),
      host,
    );
    expect(JSON.stringify(json.mock.calls[0]?.[0])).not.toContain(
      "sk-live-secret",
    );
  });

  it("hides unexpected error details", () => {
    const { host, status, json } = fakeHost();
    vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    filter.catch(new Error("database password is hunter2"), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      status: false,
      statusCode: 500,
      message: "An unexpected error occurred.",
      error: { code: "INTERNAL_ERROR" },
    });
    vi.restoreAllMocks();
  });
});
