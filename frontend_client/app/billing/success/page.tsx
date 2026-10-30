"use client";

/**
 * /billing/success — Stripe returns here after a hosted checkout, and the stub
 * checkout navigates here after completion. Re-reads the user (plan tier) and
 * refreshes billing/dashboard queries so limits update without a reload.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { CheckIcon } from "lucide-react";
import { SiteHeader } from "@/components/landing/site-header";
import { Skeleton } from "@/components/ui/skeleton";
import { refreshSessionUser } from "@/lib/session/refresh-user";
import { useSession } from "@/hooks/use-session";

export default function BillingSuccessPage() {
  const queryClient = useQueryClient();
  const session = useSession();
  const [state, setState] = useState<"loading" | "ready">("loading");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await refreshSessionUser();
      await queryClient.invalidateQueries();
      if (!cancelled) setState("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [queryClient]);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-[560px] flex-1 px-6 py-12">
        {state === "loading" ? (
          <div aria-busy="true" className="space-y-3">
            <Skeleton className="h-8 w-2/3 rounded" />
            <Skeleton className="h-24 w-full rounded-xl" />
            <span className="sr-only" role="status">
              Updating your plan…
            </span>
          </div>
        ) : (
          <div className="animate-fade-up">
            <p className="text-success flex items-center gap-2 text-sm font-medium">
              <CheckIcon className="size-4" aria-hidden="true" />
              Payment confirmed
            </p>
            <h1 className="text-foreground mt-2 text-2xl font-medium tracking-tight">
              {session?.user.planTier === "pro" ? "You are on Pro" : "Upgrade received"}
            </h1>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
              {session?.user.planTier === "pro"
                ? "The higher project, run, and token limits apply to your next request. Scoped regeneration and export are unlocked."
                : "The provider has not confirmed the plan yet. This page updates as soon as the subscription webhook lands — refresh in a moment."}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/library" className="text-primary hover:underline text-sm underline-offset-4 self-center">
                Go to your library
              </Link>
              <Link href="/settings" className="text-muted-foreground hover:text-foreground text-sm self-center">
                Billing settings
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
