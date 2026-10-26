import { describe, expect, it } from "vitest";
import { redactSecrets } from "../../src/common/logging/redact.js";

describe("redactSecrets", () => {
  it("redacts common secret key formats", () => {
    const input = [
      "apiKey=sk-live-secret",
      '{"apiKey":"sk-json-secret"}',
      "x-provider-api-key: sk-or-v1-secret",
      "x-project-key=project-secret",
      "password=hunter2",
    ].join("\n");
    const output = redactSecrets(input);

    for (const secret of [
      "sk-live-secret",
      "sk-json-secret",
      "sk-or-v1-secret",
      "project-secret",
      "hunter2",
    ]) {
      expect(output).not.toContain(secret);
    }
    expect(output.match(/\[REDACTED\]/g)?.length).toBe(5);
  });

  it("redacts bearer tokens before the key pass", () => {
    const output = redactSecrets(
      "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature",
    );
    expect(output).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    expect(output).not.toContain("payload.signature");
  });

  it("leaves ordinary prose alone", () => {
    expect(redactSecrets("The API key is required.")).toBe(
      "The API key is required.",
    );
  });
});
