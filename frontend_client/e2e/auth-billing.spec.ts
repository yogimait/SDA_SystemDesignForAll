/**
 * Auth-hardening + billing flows against a mocked API:
 * password reset, email verification (+ banner resend), account deletion,
 * pricing → stub checkout → success, dashboard plan gate, settings billing,
 * and the boot refresh that re-mints a 15-minute access token after a reload.
 */
import { expect, test, type Page, type Route } from "@playwright/test";
import { fillAuthForm, mockAuthRoutes } from "./helpers";

const USER: {
  id: string;
  email: string;
  planTier: "free" | "pro";
  emailVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
} = {
  id: "usr_auth01",
  email: "auth@example.com",
  planTier: "free",
  emailVerifiedAt: "2026-01-01T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const AUTH_SAVE = `
  window.sessionStorage.setItem("sda:auth:user", JSON.stringify({ user: ${JSON.stringify(USER)} }));
`;

const PLANS = {
  plans: [
    {
      id: "free",
      name: "Free",
      description: "Try the pipeline.",
      priceMonthlyUsd: 0,
      limits: { projects: 3, runsPer30Days: 50, tokensPer30Days: 500000 },
      features: ["3 projects"],
    },
    {
      id: "pro",
      name: "Pro",
      description: "More of everything.",
      priceMonthlyUsd: 19,
      limits: { projects: 100, runsPer30Days: 1000, tokensPer30Days: 10000000 },
      features: ["100 projects"],
    },
  ],
  provider: "stub",
  checkoutCompletable: true,
};

const envelope = (data: unknown, code = 200) => ({ status: true, statusCode: code, data });
const oh = (data: unknown, code = 200) => (route: Route) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(envelope(data, code)),
  });
const ofail = (code: string, message: string, statusCode: number, details?: unknown) =>
  (route: Route) =>
    route.fulfill({
      status: statusCode,
      contentType: "application/json",
      body: JSON.stringify({ status: false, statusCode, message, error: { code, details } }),
    });

/** Common authenticated mocks for the portal surfaces. */
function mockPortal(page: Page, user: typeof USER = USER): void {
  mockAuthRoutes(page, user);
  page.route("**/api/providers", oh({
    providers: [{ id: "openrouter", models: ["z-ai/glm-5.3-flash"], supportsStructuredOutput: true }],
    defaultProvider: "openrouter",
    defaultModel: "z-ai/glm-5.3-flash",
    mock: true,
  }));
  page.route("**/api/users/me/provider-config", oh({ config: { provider: "openrouter", model: "z-ai/glm-5.3-flash", updatedAt: "t" } }));
  page.route("**/api/projects?*", oh({ projects: [], nextCursor: null }));
  page.route("**/api/billing/plans", oh(PLANS));
  page.route("**/api/billing/subscription", oh({ subscription: null, planTier: "free" }));
  page.route("**/api/auth/resend-verification", oh({}));
}

test.describe("password reset + verification", () => {
  test("forgot-password always shows the neutral success copy", async ({ page }) => {
    let posted: unknown = null;
    await page.route("**/api/auth/forgot-password", (route) => {
      posted = route.request().postDataJSON();
      return oh({})(route);
    });
    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill("auth@example.com");
    await page.getByRole("button", { name: "Send reset link" }).click();

    await expect(page.getByText(/If that email has an account/)).toBeVisible();
    expect(posted).toEqual({ email: "auth@example.com" });
  });

  test("reset-password sets a new password and sends the user to sign in", async ({ page }) => {
    const bodies: unknown[] = [];
    await page.route("**/api/auth/reset-password", (route) => {
      bodies.push(route.request().postDataJSON());
      return oh({})(route);
    });
    await page.goto("/reset-password?token=reset-token-0123456789");
    await page.getByLabel("New password").fill("supersecret1");
    await page.getByLabel("Confirm password").fill("supersecret1");
    await page.getByRole("button", { name: "Set new password" }).click();

    await expect(page.getByText("Password updated.")).toBeVisible();
    expect(bodies).toEqual([{ token: "reset-token-0123456789", password: "supersecret1" }]);
  });

  test("reset-password maps an invalid token to recovery copy", async ({ page }) => {
    await page.route("**/api/auth/reset-password", (route) =>
      route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          status: false,
          statusCode: 400,
          message: "This reset link is invalid or expired.",
          error: { code: "VALIDATION_ERROR", details: { reason: "reset_invalid" } },
        }),
      }),
    );
    await page.goto("/reset-password?token=reset-token-0123456789");
    await page.getByLabel("New password").fill("supersecret1");
    await page.getByLabel("Confirm password").fill("supersecret1");
    await page.getByRole("button", { name: "Set new password" }).click();
    const alert = page.getByRole("main").getByRole("alert");
    await expect(alert).toContainText("This reset link is invalid or has expired.");
    await expect(
      alert.getByRole("link", { name: "Request a new reset link" }),
    ).toHaveAttribute("href", "/forgot-password");
  });

  test("verify-email maps an invalid token to link-specific copy", async ({ page }) => {
    await page.route("**/api/auth/verify-email", (route) =>
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({
          status: false,
          statusCode: 401,
          message: "Verification token is invalid.",
          error: { code: "AUTH_INVALID_CREDENTIALS", details: { reason: "verification_invalid" } },
        }),
      }),
    );
    await page.goto("/verify-email?token=verify-token-0123456789");

    const alert = page.getByRole("main").getByRole("alert");
    await expect(alert).toContainText("This verification link is invalid or has expired.");
    // Signed out: the action is to sign in and request a fresh link.
    await expect(page.getByText("Sign in to request a new verification link.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to sign in" })).toBeVisible();
  });

  test("verify-email confirms the token", async ({ page }) => {
    const bodies: unknown[] = [];
    await page.route("**/api/auth/verify-email", (route) => {
      bodies.push(route.request().postDataJSON());
      return oh({})(route);
    });
    await page.goto("/verify-email?token=verify-token-0123456789");
    await expect(page.getByText("Email verified.")).toBeVisible();
    expect(bodies).toEqual([{ token: "verify-token-0123456789" }]);
  });

  test("verify-email without a token explains the link is incomplete", async ({ page }) => {
    await page.goto("/verify-email");
    await expect(page.getByText(/no verification token/)).toBeVisible();
  });

  test("unverified banner resends verification", async ({ page }) => {
    const unverified = { ...USER, emailVerifiedAt: null };
    mockPortal(page, unverified);
    let resent = 0;
    page.route("**/api/auth/resend-verification", (route) => {
      resent += 1;
      return oh({})(route);
    });
    await page.addInitScript(AUTH_SAVE);
    await page.goto("/library");

    const banner = page.getByRole("status").filter({ hasText: "Verify" });
    await expect(banner).toBeVisible();
    await page.getByRole("button", { name: "Resend email" }).click();
    await expect(page.getByRole("button", { name: "Email sent" })).toBeVisible();
    expect(resent).toBe(1);
  });
});

test.describe("account deletion", () => {
  test("requires the password, then signs out on success", async ({ page }) => {
    const bodies: unknown[] = [];
    mockPortal(page);
    page.route("**/api/users/me", (route) => {
      if (route.request().method() !== "DELETE") return route.fallback();
      bodies.push(route.request().postDataJSON());
      return oh(null)(route);
    });
    // One-shot seed: the post-delete navigation must not re-create the identity.
    await page.addInitScript(`
      if (window.sessionStorage.getItem("sda:seeded") === null) {
        window.sessionStorage.setItem("sda:seeded", "1");
        window.sessionStorage.setItem("sda:auth:user", JSON.stringify({ user: ${JSON.stringify(USER)} }));
      }
    `);
    await page.goto("/settings");

    await page.getByRole("button", { name: "Delete account" }).click();
    const dialog = page.getByRole("dialog", { name: "Delete this account?" });
    const confirm = dialog.getByRole("button", { name: "Delete account" });
    await expect(confirm).toBeDisabled();

    await page.getByLabel("Password").fill("supersecret1");
    await expect(confirm).toBeEnabled();
    await confirm.click();

    await expect(page).toHaveURL(/\/login$/);
    expect(bodies).toEqual([{ password: "supersecret1" }]);
    expect(await page.evaluate(() => window.sessionStorage.getItem("sda:auth:user"))).toBeNull();
  });
});

test.describe("billing", () => {
  test("pricing → stub checkout → success refreshes the plan", async ({ page }) => {
    let meCalls = 0;
    await page.route("**/api/billing/plans", oh(PLANS));
    await page.route("**/api/billing/checkout", (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      return oh({
        checkoutId: "chk_1",
        url: "http://localhost:3000/billing/checkout/chk_1",
        provider: "stub",
      }, 201)(route);
    });
    await page.route("**/api/billing/checkout/chk_1/complete", (route) => oh({})(route));
    await page.route("**/api/auth/refresh", oh({
      user: USER,
      accessToken: "token_auth_e2e",
      tokenType: "Bearer",
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    }));
    // `me` returns Free on the first call and Pro once checkout completed.
    await page.route("**/api/auth/me", (route) => {
      meCalls += 1;
      const user = meCalls > 1 ? { ...USER, planTier: "pro" } : USER;
      return oh(user)(route);
    });
    await page.addInitScript(AUTH_SAVE);

    await page.goto("/pricing");
    await expect(page.getByRole("region", { name: "Pro plan" })).toBeVisible();
    await page.getByRole("button", { name: "Upgrade to Pro" }).click();

    await expect(page).toHaveURL(/\/billing\/checkout\/chk_1$/);
    await page.getByRole("button", { name: "Complete upgrade (no charge)" }).click();

    await expect(page).toHaveURL(/\/billing\/success$/);
    await expect(page.getByText("You are on Pro")).toBeVisible();
  });

  test("settings billing cancels a stub subscription", async ({ page }) => {
    let planTier = "pro";
    let subscription: unknown = {
      plan: "pro",
      status: "active",
      provider: "stub",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      updatedAt: "t",
    };
    mockPortal(page);
    page.route("**/api/billing/subscription", (route) => oh({ subscription, planTier })(route));
    page.route("**/api/billing/cancel", (route) => {
      planTier = "free";
      subscription = null;
      return oh({})(route);
    });
    page.route("**/api/auth/me", oh({ ...USER, planTier: "free" }));
    await page.addInitScript(AUTH_SAVE);

    await page.goto("/settings");
    const billing = page.getByRole("region", { name: "Billing" });
    await expect(billing.getByText("Pro subscription active")).toBeVisible();
    // Stub provider has no hosted portal: the control is absent, not dead.
    await expect(billing.getByRole("button", { name: "Manage billing" })).toHaveCount(0);

    await billing.getByRole("button", { name: "Cancel plan" }).click();
    // The destructive action confirms inside a focused dialog first.
    const confirmCancel = page.getByRole("dialog", { name: "Cancel the Pro plan?" });
    await expect(
      confirmCancel.getByRole("button", { name: "Keep Pro" }),
    ).toBeVisible();
    await confirmCancel.getByRole("button", { name: "Cancel Pro plan" }).click();
    await expect(billing.getByRole("status")).toContainText("Downgraded to the Free plan");
    await expect(billing.getByRole("button", { name: "Upgrade to Pro" })).toBeVisible();
  });

  test("mobile tap targets stay at least 44px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    mockPortal(page);
    page.route("**/api/billing/subscription", oh({
      subscription: {
        plan: "pro",
        status: "active",
        provider: "stub",
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        updatedAt: "t",
      },
      planTier: "pro",
    }));
    page.route("**/api/billing/checkout/chk_1/complete", oh({}));
    await page.addInitScript(AUTH_SAVE);

    const expectTapTarget = async (locator: ReturnType<Page["getByRole"]>) => {
      // Dialogs animate in (zoom-in), so poll until the entrance settles.
      await expect
        .poll(async () => (await locator.boundingBox())?.height ?? 0, {
          message: "tap target height",
        })
        .toBeGreaterThanOrEqual(44);
    };

    await page.goto("/billing/checkout/chk_1");
    await expectTapTarget(page.getByRole("button", { name: "Complete upgrade (no charge)" }));

    await page.goto("/settings");
    await page.getByRole("button", { name: "Delete account" }).click();
    const deleteDialog = page.getByRole("dialog", { name: "Delete this account?" });
    await expectTapTarget(deleteDialog.getByRole("button", { name: "Delete account" }));
    await expectTapTarget(deleteDialog.getByRole("button", { name: "Keep my account" }));
    await page.keyboard.press("Escape");
    await expect(deleteDialog).toBeHidden();

    await page.getByRole("button", { name: "Cancel plan" }).click();
    const cancelDialog = page.getByRole("dialog", { name: "Cancel the Pro plan?" });
    await expectTapTarget(cancelDialog.getByRole("button", { name: "Cancel Pro plan" }));
    await expectTapTarget(cancelDialog.getByRole("button", { name: "Keep Pro" }));
  });

  test("dashboard plan gate links to pricing", async ({ page }) => {
    mockPortal(page);
    page.route("**/api/dashboard?*", ofail("PLAN_UPGRADE_REQUIRED", "Pro only", 402));
    page.route("**/api/dashboard", ofail("PLAN_UPGRADE_REQUIRED", "Pro only", 402));
    await page.addInitScript(AUTH_SAVE);
    await page.goto("/dashboard");

    await expect(page.getByText("Plan-gated data")).toBeVisible();
    await page.getByRole("link", { name: /Compare plans/ }).click();
    await expect(page).toHaveURL(/\/pricing$/);
  });
});

test.describe("access-token refresh", () => {
  test("a new tab with only the refresh cookie restores the signed-in library", async ({ page }) => {
    // No identity snapshot: only the cookie pair (the refresh cookie is
    // httpOnly; the readable CSRF companion proxies its presence).
    await page.addInitScript(`
      document.cookie = "sda_csrf=new-tab-nonce; path=/";
    `);
    mockAuthRoutes(page, USER);
    page.route("**/api/projects?*", oh({
      projects: [
        {
          id: "proj_1",
          idea: "Restored from cookie",
          ownerId: USER.id,
          status: "architecture_ready",
          createdAt: "t",
          updatedAt: "t",
          confirmedAt: "t",
          currentArchitectureVersion: 1,
        },
      ],
      nextCursor: null,
    }));

    await page.goto("/library");
    await expect(page).toHaveURL(/\/library$/);
    await expect(page.getByText("Restored from cookie")).toBeVisible();
    await expect(page.locator("header").getByText(USER.email)).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.sessionStorage.getItem("sda:auth:user")))
      .not.toBeNull();
  });

  test("a reload without an in-memory token refreshes before the authenticated call", async ({ page }) => {
    let authorized = 0;
    await page.route("**/api/auth/refresh", oh({
      user: USER,
      accessToken: "token_boot_refresh",
      tokenType: "Bearer",
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    }));
    await page.route("**/api/projects?*", (route) => {
      const header = route.request().headers()["authorization"];
      if (header === "Bearer token_boot_refresh") authorized += 1;
      return oh({
        projects: [
          {
            id: "proj_1",
            idea: "Refresh path project",
            ownerId: USER.id,
            status: "architecture_ready",
            createdAt: "t",
            updatedAt: "t",
            confirmedAt: "t",
            currentArchitectureVersion: 1,
          },
        ],
        nextCursor: null,
      })(route);
    });
    await page.addInitScript(AUTH_SAVE);
    await page.goto("/library");

    await expect(page.getByText("Refresh path project")).toBeVisible();
    expect(authorized).toBeGreaterThan(0);
  });
});

test.describe("auth redirect hardening", () => {
  test("?next= cannot bounce a signed-in user off-origin", async ({ page }) => {
    mockPortal(page);
    await page.route("**/api/auth/login", oh({
      user: USER,
      accessToken: "token_next_guard",
      tokenType: "Bearer",
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    }));

    await page.goto("/login?next=%2F%2Fevil.example");
    await fillAuthForm(page, "next@example.com", "supersecret1");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/library$/);
  });
});
