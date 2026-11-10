import { PASSWORD_PATTERNS, PASSWORD_RULES } from "@sda/contracts";

export function passwordRules(value: string) {
  return PASSWORD_RULES.map((rule) => ({
    ...rule,
    valid:
      rule.id === "length"
        ? value.length >= 8
        : PASSWORD_PATTERNS[rule.id].test(value),
  }));
}

export function passwordIsValid(value: string): boolean {
  return passwordRules(value).every((rule) => rule.valid);
}
