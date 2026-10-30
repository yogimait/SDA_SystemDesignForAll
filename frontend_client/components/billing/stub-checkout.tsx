"use client";

/**
 * Local stub checkout (`<APP_BASE_URL>/billing/checkout/<id>`): the dev billing
 * provider has no hosted page, so completion happens here through
 * `POST /api/billing/checkout/:id/complete` (404 in production / unknown ids).
 * No card data is collected or sent.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleAlertIcon, ShieldCheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch, ApiError } from "@/lib/api/client";
import { completeCheckoutPath } from "@/lib/billing/checkout";
import { refreshSessionUser } from "@/lib/session/refresh-user";
import { useHydrated, useSession } from "@/hooks/use-session";

export function StubCheckout({ checkoutId }: { checkoutId: string }) {
  const router = useRouter();
  const session = useSession();
  const hydrated = useHydrated();
  const [state, setState] = useState<"idle" | "busy">("idle");
  const [error, setError] = useState<string | null>(null);

  if (!hydrated) {
    return <p className="text-muted-foreground text-sm" role="status">Checking your session…</p>;
  }

  if (session === null) {
    return (
      <div className="space-y-3">
        <p className="text-foreground text-sm font-medium">Sign in to finish this checkout.</p>
        <Link
          href={`/login?next=${encodeURIComponent(`/billing/checkout/${checkoutId}`)}`}
          className="text-primary hover:underline text-sm underline-offset-4"
        >
          Sign in
        </Link>
      </div>
    );
  }

  async function complete(): Promise<void> {
    setState("busy");
    setError(null);
    try {
      await apiFetch(completeCheckoutPath(checkoutId), { method: "POST", auth: true });
      await refreshSessionUser();
      router.replace("/billing/success");
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.userMessage
          : "Completing the checkout failed.",
      );
      setState("idle");
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-primary/10 border-primary/40 rounded-lg border border-dashed p-4">
        <p className="text-foreground flex items-center gap-2 text-sm font-medium">
          <ShieldCheckIcon className="text-primary size-4" aria-hidden="true" />
          Sandbox checkout
        </p>
        <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
          This deployment uses the local billing stub. Completing activates Pro
          on your account immediately; no card is charged and nothing is sent to
          a payment provider.
        </p>
      </div>

      <dl className="text-sm">
        <div className="border-border/60 flex items-center justify-between border-b border-solid py-2">
          <dt className="text-muted-foreground">Plan</dt>
          <dd className="text-foreground font-medium">Pro</dd>
        </div>
        <div className="border-border/60 flex items-center justify-between border-b border-solid py-2">
          <dt className="text-muted-foreground">Account</dt>
          <dd className="text-foreground font-mono text-[11px]">{session.user.email}</dd>
        </div>
        <div className="flex items-center justify-between py-2">
          <dt className="text-muted-foreground">Checkout</dt>
          <dd className="text-muted-foreground font-mono text-[11px]">{checkoutId}</dd>
        </div>
      </dl>

      {error !== null ? (
        <div role="alert" className="bg-destructive/10 rounded-lg p-3">
          <p className="text-destructive flex items-start gap-2 text-sm font-medium">
            <CircleAlertIcon className="mt-0.5 size-4 flex-none" aria-hidden="true" />
            {error}
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => void complete()}
          disabled={state === "busy"}
          className="min-h-[44px] sm:min-h-9"
        >
          {state === "busy" ? "Completing…" : "Complete upgrade (no charge)"}
        </Button>
        <Link href="/pricing" className="text-muted-foreground hover:text-foreground self-center text-sm">
          Cancel
        </Link>
      </div>
    </div>
  );
}
