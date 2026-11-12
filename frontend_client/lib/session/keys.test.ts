import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  consumePendingIdea,
  loadProjectAccessKey,
  peekPendingIdea,
  savePendingIdea,
  saveProjectAccessKey,
} from "./keys";

beforeEach(() => {
  window.sessionStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("project access key storage", () => {
  it("stores and loads per-project access keys", () => {
    saveProjectAccessKey("p_1", "pk_abc");
    expect(loadProjectAccessKey("p_1")).toBe("pk_abc");
    expect(loadProjectAccessKey("p_2")).toBeNull();
  });
});

describe("pending idea storage (sign-in-and-continue)", () => {
  it("peek sees the idea without consuming it; consume clears the slot once", () => {
    savePendingIdea("Design a rate limiter");
    expect(peekPendingIdea()).toBe("Design a rate limiter");
    // peek is non-destructive
    expect(peekPendingIdea()).toBe("Design a rate limiter");

    expect(consumePendingIdea()).toBe("Design a rate limiter");
    expect(consumePendingIdea()).toBeNull();
    expect(peekPendingIdea()).toBeNull();
  });

  it("treats an empty slot as null", () => {
    savePendingIdea("");
    expect(peekPendingIdea()).toBeNull();
    expect(consumePendingIdea()).toBeNull();
  });
});
