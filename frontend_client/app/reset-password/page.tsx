"use client";

/**
 * /reset-password?token=… — sets a new password from the emailed link. A
 * successful reset revokes every session, so the page sends the user to sign in
 * again instead of pretending they are still signed in.
 */

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CircleAlertIcon } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch, ApiError } from "@/lib/api/client";
import { authRateLimitCopy } from "@/lib/auth/messages";
import { clearSession } from "@/lib/session/auth";

type State = "idle" | "busy" | "done";

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<{ user: string; detail: string } | null>(null);
  const [invalidLink, setInvalidLink] = useState(false);

  const missingToken = token.trim().length < 16;
  const mismatch = confirm !== "" && password !== confirm;

  async function submit(): Promise<void> {
    if (password.length < 8 || password !== confirm) return;
    setError(null);
    setState("busy");
    try {
      await apiFetch("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      // Sessions and refresh tokens were revoked server-side.
      clearSession();
      setState("done");
    } catch (caught) {
      setState("idle");
      const reason =
        caught instanceof ApiError ? caught.details?.reason : undefined;
      if (reason === "reset_invalid") {
        setError({
          user: "This reset link is invalid or has expired.",
          detail:
            "Links work once and expire after an hour. Request a new link to continue.",
        });
        setInvalidLink(true);
        return;
      }
      setError({
        user:
          authRateLimitCopy(caught) ??
          (caught instanceof ApiError
            ? caught.userMessage
            : "Resetting the password failed."),
        detail: caught instanceof ApiError ? caught.message : "Unexpected client error.",
      });
    }
  }

  return (
    <AuthShell
      title="Choose a new password"
      lead="The reset link is single use. Setting a new password signs out every other session."
    >
      {missingToken ? (
        <div className="space-y-3">
          <p role="alert" className="text-warning flex items-start gap-2 text-sm">
            <CircleAlertIcon className="mt-0.5 size-4 flex-none" aria-hidden="true" />
            This link has no reset token.
          </p>
          <Link href="/forgot-password" className="text-primary hover:underline text-sm underline-offset-4">
            Request a new reset link
          </Link>
        </div>
      ) : state === "done" ? (
        <div className="space-y-3">
          <p role="status" className="text-success text-sm font-medium">
            Password updated.
          </p>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Every session was signed out. Use your new password to sign in again.
          </p>
          <Link href="/login" className="text-primary hover:underline text-sm underline-offset-4">
            Go to sign in
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
            <label htmlFor="new-password" className="text-foreground text-sm font-medium">
              New password
            </label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 8 characters"
              className="mt-1.5 font-mono text-xs"
            />
          </div>
          <div>
            <label htmlFor="confirm-password" className="text-foreground text-sm font-medium">
              Confirm password
            </label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              required
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              aria-invalid={mismatch || undefined}
              aria-describedby={mismatch ? "confirm-password-note" : undefined}
              className="mt-1.5 font-mono text-xs"
            />
            {mismatch ? (
              <p
                id="confirm-password-note"
                className="text-destructive mt-1 text-xs"
              >
                The passwords do not match.
              </p>
            ) : null}
          </div>

          {error !== null ? (
            <div role="alert" className="bg-destructive/10 rounded-lg p-3">
              <p className="text-destructive text-sm font-medium">{error.user}</p>
              <p className="text-muted-foreground font-mono mt-0.5 text-[11px]">{error.detail}</p>
              {invalidLink ? (
                <Link
                  href="/forgot-password"
                  className="text-primary hover:underline mt-2 inline-block text-sm underline-offset-4"
                >
                  Request a new reset link
                </Link>
              ) : null}
            </div>
          ) : null}

          <Button
            type="submit"
            className="h-11 w-full sm:h-9"
            aria-describedby={mismatch ? "confirm-password-note" : undefined}
            disabled={state === "busy" || password.length < 8 || password !== confirm}
          >
            {state === "busy" ? "Saving…" : "Set new password"}
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

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={<p className="text-muted-foreground p-10 text-sm" role="status">Loading…</p>}
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
