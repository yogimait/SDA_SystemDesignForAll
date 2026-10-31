"use client";

/**
 * Settings → Billing: current plan, subscription state, portal, and cancel.
 * Provider-aware: the local stub has no hosted portal page (`/account/billing`
 * does not exist in this app), so the portal button is hidden there instead of
 * shipping a dead control; Stripe deployments get the hosted portal.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BillingPlansResponseSchema,
  BillingPortalResponseSchema,
  BillingSubscriptionResponseSchema,
  type BillingPlansResponse,
  type BillingSubscriptionResponse,
} from "@sda/contracts";
import { CreditCardIcon, SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, ApiError } from "@/lib/api/client";
import { checkoutTarget } from "@/lib/billing/checkout";
import { refreshSessionUser } from "@/lib/session/refresh-user";

function statusCopy(subscription: BillingSubscriptionResponse["subscription"]): string {
  if (subscription === null) return "Free plan — no subscription.";
  const status = subscription.status.replace("_", " ");
  if (subscription.cancelAtPeriodEnd && subscription.currentPeriodEnd !== null) {
    return `Cancels on ${new Date(subscription.currentPeriodEnd).toLocaleDateString("en-US")} (${status}).`;
  }
  const renews =
    subscription.currentPeriodEnd !== null
      ? ` renews ${new Date(subscription.currentPeriodEnd).toLocaleDateString("en-US")}`
      : "";
  return `Pro subscription ${status}${renews}.`;
}

export function BillingCard() {
  const [billing, setBilling] = useState<BillingSubscriptionResponse | null>(null);
  const [plans, setPlans] = useState<BillingPlansResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"portal" | "cancel" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [cancelNote, setCancelNote] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  async function loadBilling(): Promise<void> {
    const [subscription, catalogue] = await Promise.all([
      apiFetch("/api/billing/subscription", {
        auth: true,
        dataSchema: BillingSubscriptionResponseSchema,
      }),
      apiFetch("/api/billing/plans", { dataSchema: BillingPlansResponseSchema }),
    ]);
    setBilling(subscription);
    setPlans(catalogue);
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [subscription, catalogue] = await Promise.all([
          apiFetch("/api/billing/subscription", {
            auth: true,
            dataSchema: BillingSubscriptionResponseSchema,
          }),
          apiFetch("/api/billing/plans", { dataSchema: BillingPlansResponseSchema }),
        ]);
        if (cancelled) return;
        setBilling(subscription);
        setPlans(catalogue);
      } catch (caught) {
        if (cancelled) return;
        setLoadError(
          caught instanceof ApiError ? caught.userMessage : "Loading billing failed.",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function openPortal(): Promise<void> {
    setBusy("portal");
    setActionError(null);
    try {
      const portal = await apiFetch("/api/billing/portal", {
        method: "POST",
        auth: true,
        dataSchema: BillingPortalResponseSchema,
      });
      const target = checkoutTarget(portal, window.location.origin);
      if (target.kind === "invalid") {
        setActionError("The billing portal returned an unsafe redirect.");
        setBusy(null);
        return;
      }
      window.location.assign(target.url);
    } catch (caught) {
      setActionError(
        caught instanceof ApiError ? caught.userMessage : "Opening the billing portal failed.",
      );
      setBusy(null);
    }
  }

  async function cancelPlan(): Promise<void> {
    setBusy("cancel");
    setActionError(null);
    setCancelNote(null);
    try {
      await apiFetch("/api/billing/cancel", { method: "POST", auth: true });
      await Promise.all([loadBilling(), refreshSessionUser()]);
      setCancelNote(
        billing?.subscription?.provider === "stripe"
          ? "Cancellation scheduled: Pro stays active until the period ends."
          : "Downgraded to the Free plan.",
      );
      setConfirmCancel(false);
    } catch (caught) {
      setActionError(
        caught instanceof ApiError ? caught.userMessage : "Cancelling the plan failed.",
      );
    } finally {
      setBusy(null);
    }
  }

  const subscription = billing?.subscription ?? null;
  const planTier = billing?.planTier ?? "free";
  const provider = plans?.provider ?? subscription?.provider ?? null;
  const canManage = provider === "stripe";

  return (
    <section aria-label="Billing" className="bg-card border-border rounded-xl border border-solid p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-foreground text-sm font-semibold tracking-tight">Billing</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Plan, renewal, and the provider portal.
          </p>
        </div>
        <span className="text-muted-foreground text-[10px]">{provider ?? "…"}</span>
      </div>

      {loadError !== null ? (
        <div role="alert" className="bg-destructive/10 mt-4 rounded-lg p-3">
          <p className="text-destructive text-sm font-medium">{loadError}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      ) : null}

      {billing === null && loadError === null ? <Skeleton className="mt-4 h-20 rounded-lg" /> : null}

      {billing !== null ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="border-border text-foreground rounded-full border border-solid px-2.5 py-0.5 text-[11px]">
              {planTier}
            </span>
            <p className="text-muted-foreground text-xs">{statusCopy(subscription)}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
      {planTier === "free" ? (
              <Link href="/pricing">
                <Button size="sm" className="min-h-11 sm:min-h-9">
                  <SparklesIcon />
                  Upgrade to Pro
                </Button>
              </Link>
            ) : null}

            {canManage ? (
              <Button
                variant="outline"
                size="sm"
                className="min-h-11 sm:min-h-9"
                onClick={() => void openPortal()}
                disabled={busy !== null}
              >
                <CreditCardIcon />
                {busy === "portal" ? "Opening…" : "Manage billing"}
              </Button>
            ) : null}

            {planTier === "pro" && subscription?.cancelAtPeriodEnd !== true ? (
              <Button
                variant="outline"
                size="sm"
                className="min-h-11 sm:min-h-9"
                onClick={() => setConfirmCancel(true)}
                disabled={busy !== null}
              >
                {busy === "cancel" ? "Cancelling…" : "Cancel plan"}
              </Button>
            ) : null}

            {planTier === "free" && provider === "stub" ? (
              <span className="text-muted-foreground text-xs">
                Local billing stub: upgrades complete on a sandbox checkout page.
              </span>
            ) : null}
          </div>

          {cancelNote !== null ? (
            <p role="status" className="text-success text-xs">{cancelNote}</p>
          ) : null}
          {actionError !== null ? (
            <div role="alert" className="bg-destructive/10 rounded-lg p-3">
              <p className="text-destructive text-sm font-medium">{actionError}</p>
            </div>
          ) : null}

          <p className="text-muted-foreground text-[11px] leading-relaxed">
            {canManage
              ? "Payments and invoices live in the provider portal; cancellation keeps Pro until the paid period ends."
              : "This deployment has no hosted billing portal. Cancel here; the stub downgrades immediately."}
          </p>
        </div>
      ) : null}

      <Dialog
        open={confirmCancel}
        onOpenChange={(next) => {
          setConfirmCancel(next);
          if (!next) setActionError(null);
        }}
      >
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Cancel the Pro plan?</DialogTitle>
            <DialogDescription>
              {provider === "stripe"
                ? `Pro stays active until the paid period ends (${subscription?.currentPeriodEnd !== null && subscription?.currentPeriodEnd !== undefined ? new Date(subscription.currentPeriodEnd).toLocaleDateString("en-US") : "period end"}), then the account runs on the Free plan limits.`
                : "On this deployment's billing stub the change applies immediately: Pro features (scoped regeneration, higher limits) end now and the account runs on Free limits."}
            </DialogDescription>
          </DialogHeader>
          {actionError !== null ? (
            <div role="alert" className="bg-destructive/10 rounded-lg p-3">
              <p className="text-destructive text-sm font-medium">{actionError}</p>
            </div>
          ) : null}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" className="min-h-[44px] sm:min-h-9" />}>
              Keep Pro
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              className="min-h-[44px] sm:min-h-9"
              onClick={() => void cancelPlan()}
              disabled={busy === "cancel"}
            >
              {busy === "cancel" ? "Cancelling…" : "Cancel Pro plan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
