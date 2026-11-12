"use client";

/**
 * Settings: account identity, email verification, billing, and deletion.
 * Generation runs use the hosted model configured by the server, so there is
 * no provider/model/API-key configuration for users.
 */

import { useEffect } from "react";
import { PortalHeader } from "@/components/portal/portal-header";
import { VerifyEmailBanner } from "@/components/portal/verify-email-banner";
import { AccountCard } from "@/components/settings/account-card";
import { BillingCard } from "@/components/settings/billing-card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthBootSettled, useHydrated, useSession } from "@/hooks/use-session";
import { useRouter } from "next/navigation";

export function SettingsContent() {
  const router = useRouter();
  const session = useSession();

  // Hold route-guard redirects until hydrated: during the hydration commit
  // the session still reads as the server snapshot (null).
  const hydrated = useHydrated();
  const bootSettled = useAuthBootSettled();
  useEffect(() => {
    if (hydrated && bootSettled && session === null) {
      router.replace("/login?next=/settings");
    }
  }, [hydrated, bootSettled, session, router]);

  if (!hydrated || session === null) {
    return (
      <div className="flex min-h-screen flex-col">
        <PortalHeader current="settings" />
        <main className="mx-auto w-full max-w-[1100px] flex-1 px-6 py-10">
          <Skeleton className="h-64 w-full rounded-xl" />
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <PortalHeader current="settings" />
      <main className="mx-auto w-full max-w-[1100px] flex-1 px-6 py-8">
        <div>
          <h1 className="text-foreground text-xl font-medium tracking-tight">
            Settings
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Account and billing for{" "}
            <span className="font-mono text-[11px]">{session.user.email}</span>.
          </p>
        </div>

        <div className="mt-6 grid gap-4">
          <VerifyEmailBanner />
          <BillingCard />
          <AccountCard />
          <section
            aria-label="How generation works"
            className="bg-card border-border rounded-xl border border-solid p-4"
          >
            <h2 className="text-foreground text-sm font-semibold tracking-tight">
              How generation works
            </h2>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
              Generation is included with your plan. The server selects and
              runs the hosted model; you do not need to provide an API key.
              Your plan limits are enforced automatically.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}

export default function SettingsPage() {
  return <SettingsContent />;
}
