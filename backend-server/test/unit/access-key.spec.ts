import { describe, expect, it } from "vitest";
import { AccessKeyService } from "../../src/common/access/access-key.service.js";

describe("AccessKeyService", () => {
  const service = new AccessKeyService();

  it("generates a 256-bit key whose hash verifies", () => {
    const { key, hash } = service.generate();
    expect(key).toHaveLength(43);
    expect(key).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(service.verify(key, hash)).toBe(true);
  });

  it("rejects a different key", () => {
    const first = service.generate();
    const second = service.generate();
    expect(service.verify(second.key, first.hash)).toBe(false);
  });

  it("rejects a malformed stored hash without throwing", () => {
    const { key } = service.generate();
    expect(service.verify(key, "not-hex")).toBe(false);
  });
});
