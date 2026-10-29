import { expect, type Page } from "@playwright/test";

export type AuthMode = "login" | "register";

/**
 * Fill the auth form inside the target tab panel only. The login page mounts
 * both Base UI panels, and the outgoing panel stays visible for a transition
 * frame after a tab switch, so unscoped label locators can match two inputs
 * ("duplicate Email label" strict-mode flake, D10). The panel is addressed by
 * its accessible name (`aria-labelledby` → tab label), which is unique even
 * while both panels are visible.
 */
export async function fillAuthForm(
  page: Page,
  email: string,
  password: string,
  options: { confirm?: boolean; mode?: AuthMode } = {},
): Promise<void> {
  const panel = page.getByRole("tabpanel", {
    name: options.mode === "register" ? "Create account" : "Sign in",
  });
  await expect(panel).toBeVisible();
  await panel.getByLabel("Email", { exact: true }).fill(email);
  await panel.getByLabel("Password", { exact: true }).fill(password);
  if (options.confirm === true) {
    await panel.getByLabel("Confirm password").fill(password);
  }
}
