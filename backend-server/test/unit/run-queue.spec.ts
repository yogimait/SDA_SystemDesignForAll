import { describe, expect, it } from "vitest";
import { assertQueueCapacity } from "../../src/generation/run.service.js";

describe("generation queue capacity", () => {
  it("allows starts below the cap and rejects at the cap", () => {
    expect(() => assertQueueCapacity(0, 1)).not.toThrow();
    expect(() => assertQueueCapacity(0, 100)).not.toThrow();
    expect(() => assertQueueCapacity(99, 100)).not.toThrow();
    expect(() => assertQueueCapacity(100, 100)).toThrowError(
      /queue is full/i,
    );
    expect(() => assertQueueCapacity(101, 100)).toThrowError(
      /queue is full/i,
    );
  });
});
