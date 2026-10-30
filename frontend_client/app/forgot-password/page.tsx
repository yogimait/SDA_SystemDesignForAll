"use client";

/**
 * /forgot-password — requests a reset link. The backend answers 200 whether or
 * not the account exists (no enumeration), so the page always shows the same
 * success copy and never reveals which emails are registered.
 */

import { useState } from "react";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch, ApiError } from "@/lib/api/client";
import { authRateLimitCopy } from "@/lib/auth/messages";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  const [error, setError] = useState<{ user: string; detail: string } | null>(null);

  async function submit(): Promise<void> {
    setError(null);
    setState("busy");
    try {
      await apiFetch("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: email.trim() }),
      });
      setState("sent");
    } catch (caught) {
      setState("idle");
      setError({
        user:
          authRateLimitCopy(caught) ??
          (caught instanceof ApiError
            ? caught.userMessage
            : "Requesting the reset link failed."),
        detail: caught instanceof ApiError ? caught.message : "Unexpected client error.",
      });
    }
  }

  return (
    <AuthShell
      title="Reset your password"
      lead="Enter the email for your account and we will send a single-use reset link."
    >
      {state === "sent" ? (
        <div className="space-y-3">
          <p role="status" className="text-success text-sm font-medium">
            If that email has an account, a reset link is on its way.
          </p>
          <p className="text-muted-foreground text-sm leading-relaxed">
            The link expires in an hour and can be used once. Nothing changed if
            no email arrives — check the address and try again.
          </p>
          <Link href="/login" className="text-primary hover:underline text-sm underline-offset-4">
            Back to sign in
          </Link>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div>
            <label htmlFor="forgot-email" className="text-foreground text-sm font-medium">
              Email
            </label>
            <Input
              id="forgot-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className="mt-1.5 font-mono text-xs"
            />
          </div>

          {error !== null ? (
            <div role="alert" className="bg-destructive/10 rounded-lg p-3">
              <p className="text-destructive text-sm font-medium">{error.user}</p>
              <p className="text-muted-foreground font-mono mt-0.5 text-[11px]">{error.detail}</p>
            </div>
          ) : null}

          <Button
            type="submit"
            disabled={state === "busy" || email.trim() === ""}
            className="h-11 w-full sm:h-9"
          >
            {state === "busy" ? "Sending…" : "Send reset link"}
          </Button>
          <p className="text-center">
            <Link href="/login" className="text-muted-foreground hover:text-foreground text-sm">
              Back to sign in
            </Link>
          </p>
        </form>
      )}
    </AuthShell>
  );
}
