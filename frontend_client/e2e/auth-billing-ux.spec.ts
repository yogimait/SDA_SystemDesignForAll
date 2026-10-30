/**
 * Auth + billing UI round: layout/overflow sweep at 1440/1280/834/390/320 for
 * the new public surfaces plus 44px hit-target checks on their primary
 * actions. State logic stays covered by e2e/auth-billing.spec.ts and unit
 * tests; this file only guards the visual layer.
 */
import { expect, test } from "@playwright/test";

const WIDTHS = [1440, 1280, 834, 390, 320] as const;

async function noOverflow(page: import("@playwright/test").Page, width: number) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `page overflow at ${width}px`).toBeLessThanOrEqual(0);
}

test.describe("pricing", () => {
  for (const width of WIDTHS) {
    test(`pricing renders without overflow at ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/pricing");
      await expect(page.getByRole("heading", { name: "Plans" })).toBeVisible();
      await expect(page.getByText("/month")).toBeVisible(); // pro price from the catalogue
      await expect(page.getByText(/Sign in to upgrade/)).toBeVisible();
      await noOverflow(page, width);
      if (width === 390) {
        await page.screenshot({ path: "e2e/artifacts/pricing-390.png", fullPage: true });
      }
    });
  }

  test("pricing primary CTA is a 44px target on phones", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/pricing");
    const cta = page.getByRole("link", { name: /Sign in to upgrade/ }).getByRole("button");
    await expect(cta).toBeVisible();
    const box = (await cta.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
  });
});

test.describe("auth pages", () => {
  test("forgot-password: validation + 44px submit", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/forgot-password");
    const submit = page.getByRole("button", { name: "Send reset link" });
    await expect(submit).toBeDisabled();
    await page.getByLabel("Email").fill("recover@example.com");
    await expect(submit).toBeEnabled();
    const box = (await submit.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    await noOverflow(page, 390);
    // Neutral success state (no account enumeration).
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(
      page.getByText(/If that email has an account, a reset link is on its way/),
    ).toBeVisible();
    await page.screenshot({ path: "e2e/artifacts/forgot-sent-390.png" });
  });

  test("reset-password without token explains the incomplete link", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/reset-password?token=short");
    await expect(page.getByText(/This link has no reset token/)).toBeVisible();
    await page
      .getByRole("link", { name: "Request a new reset link" })
      .isVisible();
    await noOverflow(page, 390);
  });

  test("reset-password: mismatch message is wired to the field", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/reset-password?token=a-token-of-sixteen-chars-long!!!");
    await page.getByLabel("New password").fill("supersecret123");
    await page.getByLabel("Confirm password").fill("different-123");
    const confirm = page.getByLabel("Confirm password");
    await expect(confirm).toHaveAttribute("aria-invalid", "true");
    await expect(
      confirm.locator("xpath=following-sibling::p[@id='confirm-password-note']"),
    ).toContainText("The passwords do not match.");
    await expect(page.getByRole("button", { name: "Set new password" })).toBeDisabled();
  });

  test("verify-email without token offers resend only to signed-in users", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/verify-email");
    await expect(page.getByText(/This link has no verification token/)).toBeVisible();
    await expect(
      page.getByText(/Sign in to request a new verification link/),
    ).toBeVisible();
    await noOverflow(page, 390);
  });
});

test.describe("billing pages", () => {
  test("checkout stub page shows state and next actions when signed out", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/billing/checkout/probe-stub");
    await expect(page.getByRole("heading", { name: /Complete your upgrade/ })).toBeVisible();
    await expect(page.getByText(/Sign in to finish this checkout/)).toBeVisible();
    await expect(
      page.getByRole("main").getByRole("link", { name: "Sign in" }),
    ).toBeVisible();
    await noOverflow(page, 390);
  });

  test("success page never dead-ends (seeded signed-in session)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    // The session boot refreshes before rendering: keep it valid so the
    // auth layer does not redirect a signed-in visitor to /login.
    await page.route("**/api/auth/refresh", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: true,
          statusCode: 200,
          data: {
            user: { id: "usr_ux", email: "ux@example.com", planTier: "pro", createdAt: "t", updatedAt: "t" },
            accessToken: "token_ux",
            tokenType: "Bearer",
            expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
          },
        }),
      }),
    );
    await page.route("**/api/auth/me", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: true,
          statusCode: 200,
          data: { id: "usr_ux", email: "ux@example.com", planTier: "pro", emailVerifiedAt: "t", createdAt: "t", updatedAt: "t" },
        }),
      }),
    );
    await page.addInitScript(`
      window.sessionStorage.setItem("sda:auth:user", JSON.stringify({
        user: { id: "usr_ux", email: "ux@example.com", planTier: "pro", emailVerifiedAt: "t", createdAt: "t", updatedAt: "t" },
      }));
    `);
    await page.goto("/billing/success");
    await expect(page.getByText("You are on Pro")).toBeVisible();
    await expect(page.getByRole("link", { name: /Go to your library/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "Billing settings" })).toBeVisible();
    await noOverflow(page, 390);
    await page.screenshot({ path: "e2e/artifacts/billing-success-390.png" });
  });

  test("cancel page explains no charge and offers next steps", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto("/billing/cancel");
    await expect(page.getByText(/Nothing was charged and your plan is unchanged/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to plans" })).toBeVisible();
    await noOverflow(page, 320);
  });
});
