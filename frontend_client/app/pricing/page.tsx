"use client";

/**
 * /pricing — Free vs Pro from `GET /api/billing/plans` (the backend catalogue,
 * never a hardcoded copy). Signed-in users see their current plan highlighted
 * and upgrade through `POST /api/billing/checkout {plan:"pro"}`; the returned URL
 * is either Stripe-hosted (external redirect) or the local stub checkout page.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckIcon, SparklesIcon } from "lucide-react";
import type { BillingPlansResponse, Plan } from "@sda/contracts";
import { BillingPlansResponseSchema, CheckoutResponseSchema } from "@sda/contracts";
import { SiteHeader } from "@/components/landing/site-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, ApiError } from "@/lib/api/client";
import { checkoutTarget } from "@/lib/billing/checkout";
import { useHydrated, useSession } from "@/hooks/use-session";

function formatPrice(plan: Plan): string {
  return plan.priceMonthlyUsd === 0 ? "Free" : `$${plan.priceMonthlyUsd}/month`;
}

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

export default function PricingPage() {
  const router = useRouter();
  const session = useSession();
  const hydrated = useHydrated();
  const [plans, setPlans] = useState<BillingPlansResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiFetch("/api/billing/plans", {
          dataSchema: BillingPlansResponseSchema,
        });
        if (!cancelled) setPlans(data);
      } catch (caught) {
        if (cancelled) return;
        setLoadError(
          caught instanceof ApiError
            ? caught.userMessage
            : "Loading the plans failed.",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const currentTier = session?.user.planTier ?? null;

  async function upgrade(): Promise<void> {
    setBusy(true);
    setCheckoutError(null);
    try {
      const checkout = await apiFetch("/api/billing/checkout", {
        method: "POST",
        auth: true,
        body: JSON.stringify({ plan: "pro" }),
        dataSchema: CheckoutResponseSchema,
      });
      const target = checkoutTarget(checkout, window.location.origin);
      if (target.kind === "internal") {
        router.push(target.url);
        return;
      }
      if (target.kind === "external") {
        window.location.assign(target.url);
        return;
      }
      setCheckoutError("Checkout returned an unsafe redirect. Try again.");
      setBusy(false);
    } catch (caught) {
      setCheckoutError(
        caught instanceof ApiError ? caught.userMessage : "Starting checkout failed.",
      );
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-[1100px] flex-1 px-6 py-10">
        <header className="max-w-[60ch]">
          <h1 className="text-foreground text-2xl font-medium tracking-tight">Plans</h1>
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
            Both plans run the full pipeline: requirements, HLD, LLD, DSA, and
            export. Pro raises the project, run, and token limits and adds
            scoped regeneration.
          </p>
        </header>

        {loadError !== null ? (
          <div role="alert" className="bg-destructive/10 mt-6 rounded-lg p-4">
            <p className="text-destructive text-sm font-medium">{loadError}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => window.location.reload()}>
              Retry
            </Button>
          </div>
        ) : null}

        {plans === null && loadError === null ? (
          <div aria-busy="true" className="mt-6 grid gap-4 md:grid-cols-2">
            <Skeleton className="h-80 rounded-xl" />
            <Skeleton className="h-80 rounded-xl" />
          </div>
        ) : null}

        {checkoutError !== null ? (
          <div role="alert" className="bg-destructive/10 mt-6 rounded-lg p-4">
            <p className="text-destructive text-sm font-medium">{checkoutError}</p>
          </div>
        ) : null}

        {plans !== null ? (
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {plans.plans.map((plan) => {
              const current = hydrated && currentTier === plan.id;
              const pro = plan.id === "pro";
              return (
                <section
                  key={plan.id}
                  aria-label={`${plan.name} plan`}
                  className={
                    "bg-card rounded-xl border border-solid p-5 " +
                    (current ? "border-primary/60 ring-primary/20 ring-1" : "border-border")
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-foreground flex items-center gap-2 text-base font-semibold tracking-tight">
                        {plan.name}
                        {pro ? <SparklesIcon className="text-primary size-4" aria-hidden="true" /> : null}
                      </h2>
                      <p className="text-muted-foreground mt-1 text-xs">{plan.description}</p>
                    </div>
                    {current ? (
                      <span className="border-primary/40 text-primary flex-none rounded-full border border-solid px-2 py-0.5 text-[10px]">
                        current
                      </span>
                    ) : null}
                  </div>

                  <p className="text-foreground mt-4 text-2xl font-semibold tracking-tight">
                    {formatPrice(plan)}
                  </p>

                  <ul className="text-muted-foreground mt-4 grid gap-1.5 text-sm">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2">
                        <CheckIcon className="text-success mt-0.5 size-3.5 flex-none" aria-hidden="true" />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <dl className="border-border text-muted-foreground mt-4 grid grid-cols-3 gap-2 border-t border-solid pt-3 text-[11px]">
                    <div>
                      <dt>Projects</dt>
                      <dd className="text-foreground font-mono">{formatCount(plan.limits.projects)}</dd>
                    </div>
                    <div>
                      <dt>Runs / 30d</dt>
                      <dd className="text-foreground font-mono">{formatCount(plan.limits.runsPer30Days)}</dd>
                    </div>
                    <div>
                      <dt>Tokens / 30d</dt>
                      <dd className="text-foreground font-mono">{formatCount(plan.limits.tokensPer30Days)}</dd>
                    </div>
                  </dl>

                  <div className="mt-5">
                    {current ? (
                      <Button variant="outline" className="w-full" disabled>
                        Current plan
                      </Button>
                    ) : pro ? (
                      hydrated && session !== null ? (
                        <Button className="w-full h-11 sm:h-9" onClick={() => void upgrade()} disabled={busy}>
                          {busy ? "Starting checkout…" : "Upgrade to Pro"}
                        </Button>
                      ) : (
                        <Link href="/login?next=%2Fpricing" className="block">
                          <Button className="w-full h-11 sm:h-9">Sign in to upgrade</Button>
                        </Link>
                      )
                    ) : (
                      <p className="text-muted-foreground text-xs">
                        Included with every account. Downgrading happens in
                        Settings → Billing.
                      </p>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        ) : null}

        <p className="text-muted-foreground mt-6 text-xs">
          {plans?.provider === "stub"
            ? "This deployment uses the local billing stub. Upgrades complete on a sandbox checkout page and no card is charged."
            : "Payments are handled by the billing provider; you will be redirected to a secure checkout."}
        </p>

        <p className="mt-4">
          <Link href={session !== null ? "/settings" : "/"} className="text-muted-foreground hover:text-foreground text-sm">
            {session !== null ? "Back to settings" : "Back to the landing page"}
          </Link>
        </p>
      </main>
    </div>
  );
}
