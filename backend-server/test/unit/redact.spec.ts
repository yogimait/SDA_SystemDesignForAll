import { describe, expect, it } from "vitest";
import {
  redactDetails,
  redactSecrets,
} from "../../src/common/logging/redact.js";

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

  it("redacts bare provider keys with no label", () => {
    const output = redactSecrets(
      "Incorrect API key: sk-or-v1-1a2b3c4d5e6f, gsk_9z8y7x6w5v4u, sk-proj-abcd1234efgh.",
    );
    expect(output).not.toContain("sk-or-v1-1a2b3c4d5e6f");
    expect(output).not.toContain("gsk_9z8y7x6w5v4u");
    expect(output).not.toContain("sk-proj-abcd1234efgh");
    expect(output.match(/\[REDACTED\]/g)?.length).toBe(3);
  });

  it("deep-redacts nested details, including secret-named keys", () => {
    const details = {
      providerStatus: 400,
      providerMessage: "key sk-or-v1-secretvalue rejected",
      nested: [{ note: "Bearer abc.def.ghi" }],
      apiKey: "plain-value-without-prefix",
      usage: { promptTokens: 12, completionTokens: 3 },
    };
    const output = redactDetails(details);

    expect(JSON.stringify(output)).not.toContain("sk-or-v1-secretvalue");
    expect(JSON.stringify(output)).not.toContain("abc.def.ghi");
    expect(JSON.stringify(output)).not.toContain("plain-value-without-prefix");
    expect(output).toMatchObject({
      providerStatus: 400,
      usage: { promptTokens: 12, completionTokens: 3 },
    });
    expect(redactDetails(undefined)).toBeUndefined();
  });
});
