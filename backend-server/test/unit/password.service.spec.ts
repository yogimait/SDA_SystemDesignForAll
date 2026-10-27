import { describe, expect, it } from "vitest";
import { PasswordService } from "../../src/auth/password.service.js";

describe("PasswordService", () => {
  it("hashes and verifies a password without storing plaintext", async () => {
    const service = new PasswordService();
    const encoded = await service.hash("correct horse battery staple");

    expect(encoded).toMatch(/^scrypt\$/);
    expect(encoded).not.toContain("correct horse battery staple");
    await expect(service.verify("correct horse battery staple", encoded)).resolves.toBe(true);
    await expect(service.verify("wrong password", encoded)).resolves.toBe(false);
  });

  it("uses a fresh salt for each hash", async () => {
    const service = new PasswordService();
    expect(await service.hash("same password")).not.toBe(
      await service.hash("same password"),
    );
  });
});
