"use client";

/**
 * Non-blocking "verify your email" banner for signed-in, unverified accounts.
 * It never blocks navigation; when the server gates generation behind
 * verification, the run error carries the same action (`/verify-email`).
 */

import { useState } from "react";
import Link from "next/link";
import { MailWarningIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/client";
import { useSession } from "@/hooks/use-session";

export function VerifyEmailBanner() {
  const session = useSession();
  const [state, setState] = useState<"idle" | "busy" | "sent" | "error">("idle");

  if (session === null || session.user.emailVerifiedAt) return null;

  async function resend(): Promise<void> {
    setState("busy");
    try {
      await apiFetch("/api/auth/resend-verification", { method: "POST", auth: true });
      setState("sent");
    } catch {
      setState("error");
    }
  }

  return (
    <div
      role="status"
      className="border-warning/40 bg-warning/10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-solid px-4 py-3"
    >
      <p className="text-foreground flex items-start gap-2 text-sm">
        <MailWarningIcon className="text-warning mt-0.5 size-4 flex-none" aria-hidden="true" />
        <span>
          Verify <span className="font-mono text-[11px]">{session.user.email}</span> to unlock
          generation when the server requires a confirmed address.
        </span>
      </p>
      <div className="flex items-center gap-2">
        <Link
          href="/verify-email"
          className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline"
        >
          Having trouble?
        </Link>
        <Button variant="outline" size="sm" onClick={() => void resend()} disabled={state === "busy"}>
          {state === "busy" ? "Sending…" : state === "sent" ? "Email sent" : "Resend email"}
        </Button>
      </div>
      {state === "error" ? (
        <p className="text-destructive w-full text-xs">
          Resending failed. Wait a moment and retry.
        </p>
      ) : null}
    </div>
  );
}
