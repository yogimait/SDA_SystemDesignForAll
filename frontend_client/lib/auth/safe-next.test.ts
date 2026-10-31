import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-next";

describe("safeNextPath", () => {
  it("keeps a valid same-origin path", () => {
    expect(safeNextPath("/library")).toBe("/library");
  });

  it("keeps path, query and hash", () => {
    expect(safeNextPath("/projects/proj_1/requirements?tab=spec#top")).toBe(
      "/projects/proj_1/requirements?tab=spec#top",
    );
  });

  it("rejects a protocol-relative target", () => {
    expect(safeNextPath("//evil.example")).toBe("/library");
    expect(safeNextPath("//evil.example/login")).toBe("/library");
  });

  it("rejects an absolute URL", () => {
    expect(safeNextPath("https://evil.example")).toBe("/library");
    expect(safeNextPath("http://evil.example/library")).toBe("/library");
  });

  it("rejects a javascript: scheme", () => {
    expect(safeNextPath("javascript:alert(1)")).toBe("/library");
  });

  it("rejects backslash smuggling", () => {
    expect(safeNextPath("/\\evil.example")).toBe("/library");
    expect(safeNextPath("\\\\evil.example")).toBe("/library");
  });

  it("rejects control characters and blank input", () => {
    expect(safeNextPath("/\t/evil.example")).toBe("/library");
    expect(safeNextPath("")).toBe("/library");
    expect(safeNextPath(null)).toBe("/library");
    expect(safeNextPath(undefined)).toBe("/library");
  });

  it("uses the caller's fallback", () => {
    expect(safeNextPath("https://evil.example", "/dashboard")).toBe("/dashboard");
  });
});
