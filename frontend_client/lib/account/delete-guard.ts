/**
 * Delete-account confirmation guard (pure): the destructive dialog stays
 * disabled until a password that could actually be valid is typed. Kept out of
 * the component so the rule is unit-testable.
 */
export const MIN_DELETE_PASSWORD_LENGTH = 8;

export function deleteAccountBlockedReason(password: string): string | null {
  if (password.length < MIN_DELETE_PASSWORD_LENGTH) {
    return "Enter your password to confirm.";
  }
  return null;
}
