/**
 * Account-scoped BYOK vault (live mock backend): save a key to the account,
 * verify no key material lands in storage or the DOM, then run and regenerate
 * with no `x-provider-api-key` header (the backend resolves the stored key).
 * Removing the key brings the provider gate back.
 */
import { expect, test } from "@playwright/test";
import { fillAuthForm } from "./helpers";

const IDEA_TEXT =
  "Design a distributed rate limiter for a public API with sliding windows and a Redis backing store.";
const TEST_KEY = "sk-or-vault-e2e-0123456789";

test("account key: saved status, header-free runs, remove re-gates", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const email = `vault_${Date.now().toString(36)}@example.com`;

  await page.goto("/login");
  await page.getByRole("tab", { name: "Create account" }).click();
  await fillAuthForm(page, email, "supersecret123", {
    confirm: true,
    mode: "register",
  });
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/library$/);

  // Save the key to the encrypted account vault (checkbox defaults on).
  await page.getByRole("button", { name: /Provider (setup|ready)/ }).click();
  const dialog = page.getByRole("dialog", { name: "Set up model access" });
  const apiKey = dialog.getByLabel("API key");
  await expect(apiKey).toBeEmpty();
  await apiKey.fill(TEST_KEY);
  const saveToAccount = dialog.getByRole("checkbox", {
    name: /Save this key to my account/,
  });
  await expect(saveToAccount).toBeChecked();
  await dialog.getByRole("button", { name: "Save provider setup" }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("button", { name: /Provider ready/ }),
  ).toBeVisible();

  // The account is now the only copy: nothing key-shaped in either storage.
  const leaked = await page.evaluate((secret) => {
    const values: string[] = [];
    for (const storage of [window.localStorage, window.sessionStorage]) {
      for (let index = 0; index < storage.length; index += 1) {
        const name = storage.key(index);
        if (name !== null) values.push(storage.getItem(name) ?? "");
      }
    }
    return values.some((value) => value.includes(secret));
  }, TEST_KEY);
  expect(leaked, "key must not be persisted client-side").toBe(false);

  // New-tab equivalent: clear the whole tab store, then restore from the
  // refresh cookie. The account key must keep the gate ready on its own.
  await page.evaluate(() => window.sessionStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: /Provider (setup|ready)/ }).click();
  const reopened = page.getByRole("dialog", { name: "Set up model access" });
  await expect(reopened.getByLabel("API key")).toBeEmpty();
  await expect(reopened.getByLabel("API key")).toHaveAttribute(
    "placeholder",
    /Saved key/,
  );
  const savedPanel = reopened.locator('[aria-label="Saved account key"]');
  await expect(savedPanel).toContainText("Saved to your account");
  await expect(reopened.getByRole("button", { name: "Not now" })).toBeVisible();
  await page.keyboard.press("Escape");

  // Settings lists status only, never the key.
  await page.goto("/settings");
  const card = page.getByRole("region", { name: "Saved API keys" });
  await expect(card).toContainText("OpenRouter");
  await expect(card).toContainText("saved");
  await expect(page.locator("body")).not.toContainText(TEST_KEY);

  // A run with only the account key omits the provider header and succeeds.
  await page.goto("/");
  await page.getByLabel("Your system idea").fill(IDEA_TEXT);
  await page.getByRole("button", { name: "Start design session" }).click();
  await expect(page).toHaveURL(/\/requirements$/);
  await expect(
    page.getByRole("region", { name: "Provider setup required" }),
  ).toHaveCount(0);
  const generate = page.getByRole("button", { name: "Generate requirements" });
  await expect(generate).toBeEnabled();

  const runRequest = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      /\/api\/projects\/[^/]+\/requirements$/.test(
        new URL(request.url()).pathname,
      ),
  );
  await generate.click();
  const started = await runRequest;
  expect(started.headers()["x-provider-api-key"]).toBeUndefined();
  const projectId = new URL(started.url()).pathname.split("/")[3];
  const requirementsUrl = `/projects/${projectId}/requirements`;

  const confirm = page.getByRole("button", {
    name: /Confirm & generate architecture/,
  });
  await confirm.waitFor({ timeout: 90_000 });
  await confirm.scrollIntoViewIfNeeded();
  await expect(confirm).toBeEnabled();
  await confirm.click();

  const workspaceLink = page.getByRole("link", { name: /Open workspace/ });
  await workspaceLink.waitFor({ timeout: 90_000 });
  await workspaceLink.click();
  await expect(page).toHaveURL(/\/workspace$/);

  // Regeneration stays live on the account key and sends no key header.
  const regenHeaders: Array<Record<string, string>> = [];
  await page.route("**/api/projects/*/architecture/regenerate", async (route) => {
    regenHeaders.push(route.request().headers());
    await route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({
        status: true,
        statusCode: 202,
        data: { runId: "run_vault_regen" },
      }),
    });
  });
  await page.getByRole("button", { name: "Regenerate" }).click();
  const menu = page.getByRole("menu", { name: "Regenerate" });
  const lld = menu.getByRole("menuitem", { name: /LLD only/ });
  await expect(lld).toBeEnabled();
  await lld.click();
  await expect.poll(() => regenHeaders.length).toBe(1);
  expect(regenHeaders[0]?.["x-provider-api-key"]).toBeUndefined();

  // Remove the saved key from Settings; the tab never had one.
  await page.goto("/settings");
  const keysCard = page.getByRole("region", { name: "Saved API keys" });
  await keysCard.getByRole("button", { name: "Remove key" }).click();
  await keysCard.getByRole("button", { name: "Remove key" }).click();
  await expect(keysCard).toContainText("No saved keys yet");

  // The requirements gate returns because no key exists anywhere.
  await page.goto(requirementsUrl);
  await expect(
    page.getByRole("region", { name: "Provider setup required" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Confirm & generate architecture/ }),
  ).toBeDisabled();
});
