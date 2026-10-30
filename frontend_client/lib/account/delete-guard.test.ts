import { describe, expect, it } from "vitest";
import { deleteAccountBlockedReason } from "./delete-guard";

describe("delete account confirmation", () => {
  it("blocks an empty or too-short password", () => {
    expect(deleteAccountBlockedReason("")).toBe("Enter your password to confirm.");
    expect(deleteAccountBlockedReason("short")).toBe("Enter your password to confirm.");
    expect(deleteAccountBlockedReason("1234567")).toBe("Enter your password to confirm.");
  });

  it("allows a password long enough to be a real one", () => {
    expect(deleteAccountBlockedReason("12345678")).toBeNull();
  });
});
