import { expect, type Page } from "@playwright/test";

/**
 * Fill the auth form inside the target tab panel only. The login page mounts
 * both Base UI panels, and the outgoing panel stays visible for a transition
 * frame after a tab switch, so unscoped label locators can match two inputs
 * ("duplicate Email label" strict-mode flake, D10). The panel is addressed by
 * its accessible name (`aria-labelledby` → tab label), which is unique even
 * while both panels are visible.
 *
 * `mode` picks the panel; the generation runs need it too, because a run
 * cannot start without provider + model + key in this tab.
 */
export async function fillAuthForm(
  page: Page,
  email: string,
  password: string,
  options: { confirm?: boolean; mode?: "login" | "register" } = {},
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

/**
 * Tab-local BYOK setup required by the requirements gate: provider + model +
 * that provider's key. Anonymous runs use this the same way a signed-in user's
 * dialog save does. Add it with `page.addInitScript` before the first goto.
 */
export const PROVIDER_SETUP_SEED = `
  window.sessionStorage.setItem("sda:provider-setup", JSON.stringify({
    provider: "openrouter",
    model: "z-ai/glm-5.3-flash",
    keys: { openrouter: "sk-or-e2e-key-0123456789" },
  }));
`;
