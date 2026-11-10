import { describe, expect, it } from "vitest";
import { passwordIsValid, passwordRules } from "./password";

describe("password policy", () => {
  it("requires four visible rules and accepts a compliant password", () => {
    expect(passwordRules("short")).toHaveLength(4);
    expect(passwordIsValid("Password1!")).toBe(true);
    expect(passwordIsValid("password1!")).toBe(false); // no uppercase
    expect(passwordIsValid("Password!!")).toBe(false); // no number
    expect(passwordIsValid("Password11")).toBe(false); // no special
    expect(passwordIsValid("Pass1!")).toBe(false); // too short
  });

  it("tracks each rule independently", () => {
    expect(passwordRules("Password1!").every((rule) => rule.valid)).toBe(true);
    expect(
      passwordRules("Password1!").map((rule) => ({ id: rule.id, valid: rule.valid })),
    ).toEqual([
      { id: "length", valid: true },
      { id: "uppercase", valid: true },
      { id: "number", valid: true },
      { id: "special", valid: true },
    ]);
  });
});
