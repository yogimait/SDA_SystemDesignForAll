import type { CallHandler, ExecutionContext } from "@nestjs/common";
import { ok } from "@sda/contracts";
import { firstValueFrom, of } from "rxjs";
import { describe, expect, it } from "vitest";
import { ApiResponseInterceptor } from "../../src/common/envelope/api-response.interceptor.js";

function context(statusCode: number): ExecutionContext {
  return {
    switchToHttp: () => ({ getResponse: () => ({ statusCode }) }),
  } as unknown as ExecutionContext;
}

function handler(value: unknown): CallHandler {
  return { handle: () => of(value) };
}

describe("ApiResponseInterceptor", () => {
  const interceptor = new ApiResponseInterceptor();

  it("wraps payloads with the actual HTTP status", async () => {
    const result = await firstValueFrom(
      interceptor.intercept(context(201), handler({ id: "one" })),
    );
    expect(result).toEqual(ok({ id: "one" }, 201));
  });

  it("does not double-wrap an existing envelope", async () => {
    const envelope = ok({ id: "one" }, 202);
    const result = await firstValueFrom(
      interceptor.intercept(context(202), handler(envelope)),
    );
    expect(result).toBe(envelope);
  });
});
