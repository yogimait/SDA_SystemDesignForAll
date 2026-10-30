"use client";

/**
 * /verify-email?token=… — consumes the single-use token from the email link.
 * Works signed out (fresh registration link in another tab) and signed in (the
 * identity refreshes so the unverified banner disappears immediately).
 */

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CircleCheckIcon, CircleAlertIcon } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { apiFetch, ApiError } from "@/lib/api/client";
import { authRateLimitCopy } from "@/lib/auth/messages";
import { refreshSessionUser } from "@/lib/session/refresh-user";
import { useSession } from "@/hooks/use-session";

type State =
  | { kind: "verified" }
  | { kind: "error"; user: string; detail: string };

const verificationTasks = new Map<string, Promise<void>>();

/** Dev StrictMode runs effects twice; a single-use token must be sent once. */
function verifyEmailOnce(token: string): Promise<void> {
  const cached = verificationTasks.get(token);
  if (cached !== undefined) return cached;
  const task = apiFetch("/api/auth/verify-email", {
    method: "POST",
    body: JSON.stringify({ token }),
  }).then(() => undefined);
  verificationTasks.set(token, task);
  return task;
}

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const session = useSession();
  const missingToken = token.trim().length < 16;
  const [state, setState] = useState<State | null>(null);
  const [resend, setResend] = useState<"idle" | "busy" | "sent" | "error">("idle");

  useEffect(() => {
    if (missingToken) return;
    let cancelled = false;
    void (async () => {
      try {
        await verifyEmailOnce(token);
        if (cancelled) return;
        setState({ kind: "verified" });
        if (session !== null) await refreshSessionUser().catch(() => undefined);
      } catch (caught) {
        if (cancelled) return;
        const reason =
          caught instanceof ApiError ? caught.details?.reason : undefined;
        if (reason === "verification_invalid") {
          setState({
            kind: "error",
            user: "This verification link is invalid or has expired.",
            detail:
              "Links work once and expire after 24 hours. Request a new one below.",
          });
          return;
        }
        setState({
          kind: "error",
          user:
            authRateLimitCopy(caught) ??
            (caught instanceof ApiError
              ? caught.userMessage
              : "Verifying the email failed."),
          detail:
            caught instanceof ApiError ? caught.message : "Unexpected client error.",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
    // Runs once per token (the request itself is deduped); session only affects
    // the post-verify identity refresh.
  }, [token, missingToken]); // eslint-disable-line react-hooks/exhaustive-deps

  async function resendVerification(): Promise<void> {
    setResend("busy");
    try {
      await apiFetch("/api/auth/resend-verification", { method: "POST", auth: true });
      setResend("sent");
    } catch {
      setResend("error");
    }
  }

  const signedIn = session !== null;
  const next = signedIn ? "/library" : "/login";

  return (
    <AuthShell
      title="Confirm your email"
      lead="Email confirmation keeps account recovery working and unlocks generation when the server requires a verified address."
    >
      {!missingToken && state === null ? (
        <p role="status" className="text-muted-foreground text-sm">
          Verifying your link…
        </p>
      ) : null}

      {missingToken ? (
        <div className="space-y-4">
          <p role="alert" className="text-warning flex items-start gap-2 text-sm">
            <CircleAlertIcon className="mt-0.5 size-4 flex-none" aria-hidden="true" />
            This link has no verification token.
          </p>
          <ResendBlock
            signedIn={signedIn}
            state={resend}
            onResend={() => void resendVerification()}
          />
        </div>
      ) : null}

      {state?.kind === "verified" ? (
        <div className="space-y-4">
          <p role="status" className="text-success flex items-start gap-2 text-sm font-medium">
            <CircleCheckIcon className="mt-0.5 size-4 flex-none" aria-hidden="true" />
            Email verified.
          </p>
          <Link href={next} className="text-primary hover:underline inline-block text-sm underline-offset-4">
            {signedIn ? "Go to your library" : "Sign in"}
          </Link>
        </div>
      ) : null}

      {state?.kind === "error" ? (
        <div className="space-y-4">
          <div role="alert" className="bg-destructive/10 rounded-lg p-3">
            <p className="text-destructive text-sm font-medium">{state.user}</p>
            <p className="text-muted-foreground font-mono mt-0.5 text-[11px]">{state.detail}</p>
          </div>
          <ResendBlock
            signedIn={signedIn}
            state={resend}
            onResend={() => void resendVerification()}
          />
        </div>
      ) : null}

      {state?.kind !== "verified" ? (
        <p className="mt-4">
          <Link
            href={signedIn ? "/library" : "/login"}
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            {signedIn ? "Back to the library" : "Back to sign in"}
          </Link>
        </p>
      ) : null}
    </AuthShell>
  );
}

function ResendBlock({
  signedIn,
  state,
  onResend,
}: {
  signedIn: boolean;
  state: "idle" | "busy" | "sent" | "error";
  onResend: () => void;
}) {
  if (!signedIn) {
    return (
      <p className="text-muted-foreground text-sm">
        Sign in to request a new verification link.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        className="min-h-11 sm:min-h-9"
        onClick={onResend}
        disabled={state === "busy"}
      >
        {state === "busy" ? "Sending…" : "Resend verification email"}
      </Button>
      {state === "sent" ? (
        <p role="status" className="text-success text-xs">
          A new verification link is on its way to your inbox.
        </p>
      ) : null}
      {state === "error" ? (
        <p role="alert" className="text-destructive text-xs">
          Sending failed. Wait a moment and retry.
        </p>
      ) : null}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={<p className="text-muted-foreground p-10 text-sm" role="status">Loading…</p>}
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
