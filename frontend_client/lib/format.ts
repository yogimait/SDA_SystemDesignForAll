/** Small shared formatters (kept side-effect free and unit-testable). */
export function formatTokens(amount: number): string {
  return amount.toLocaleString("en-US");
}
