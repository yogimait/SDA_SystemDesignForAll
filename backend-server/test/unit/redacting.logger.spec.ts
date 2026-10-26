import { describe, expect, it, vi } from "vitest";
import { RedactingLogger } from "../../src/common/logging/redacting.logger.js";

describe("RedactingLogger", () => {
  it("redacts secrets before they reach the log stream", () => {
    const write = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const logger = new RedactingLogger();

    logger.log("request apiKey=sk-live-secret Authorization: Bearer token-value");

    const output = write.mock.calls.map((call) => String(call[0])).join("");
    expect(output).not.toContain("sk-live-secret");
    expect(output).not.toContain("token-value");
    expect(output).toContain("[REDACTED]");
    write.mockRestore();
  });
});
