"use client";

/**
 * Settings → Account: identity, email-verification status (+ resend), and the
 * password-confirmed account deletion flow. Deletion is destructive and
 * irreversible, so it lives behind a focused dialog that restates the
 * consequence; success clears the local session and returns to /login.
 */

import { useState } from "react";
import { CircleCheckIcon, CircleAlertIcon, TrashIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiFetch, ApiError } from "@/lib/api/client";
import { deleteAccountBlockedReason } from "@/lib/account/delete-guard";
import { clearSession } from "@/lib/session/auth";
import { useSession } from "@/hooks/use-session";

export function AccountCard() {
  const session = useSession();
  const [resend, setResend] = useState<"idle" | "busy" | "sent" | "error">("idle");
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (session === null) return null;
  const verified = Boolean(session.user.emailVerifiedAt);
  const blockedReason = deleteAccountBlockedReason(password);

  async function resendVerification(): Promise<void> {
    setResend("busy");
    try {
      await apiFetch("/api/auth/resend-verification", { method: "POST", auth: true });
      setResend("sent");
    } catch {
      setResend("error");
    }
  }

  async function confirmDelete(): Promise<void> {
    if (blockedReason !== null) return;
    setDeleting(true);
    setError(null);
    try {
      await apiFetch("/api/users/me", {
        method: "DELETE",
        auth: true,
        body: JSON.stringify({ password }),
      });
      clearSession();
      // Full navigation beats the settings route guard (which would append
      // ?next=/settings for a deleted account).
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- run inside an event handler; a reload also drops all cached state
      window.location.assign("/login");
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.userMessage
          : "Deleting the account failed.",
      );
      setDeleting(false);
    }
  }

  return (
    <section aria-label="Account" className="bg-card border-border rounded-xl border border-solid p-4">
      <h2 className="text-foreground text-sm font-semibold tracking-tight">Account</h2>
      <p className="text-muted-foreground mt-1 text-xs">
        Identity and email confirmation for this account.
      </p>

      <dl className="mt-4 grid gap-2 text-sm">
        <div className="border-border/60 flex flex-wrap items-center justify-between gap-2 border-b border-solid py-2">
          <dt className="text-muted-foreground">Email</dt>
          <dd className="text-foreground font-mono text-[11px]">{session.user.email}</dd>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 py-2">
          <dt className="text-muted-foreground">Email status</dt>
          <dd className="flex items-center gap-2">
            {verified ? (
              <span className="text-success flex items-center gap-1.5 text-xs">
                <CircleCheckIcon className="size-3.5" aria-hidden="true" />
                verified
              </span>
            ) : (
              <>
                <span className="text-warning flex items-center gap-1.5 text-xs">
                  <CircleAlertIcon className="size-3.5" aria-hidden="true" />
                  not verified
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-11 sm:min-h-9"
                  onClick={() => void resendVerification()}
                  disabled={resend === "busy"}
                >
                  {resend === "busy" ? "Sending…" : resend === "sent" ? "Email sent" : "Resend email"}
                </Button>
              </>
            )}
          </dd>
        </div>
      </dl>
      {resend === "error" ? (
        <p role="alert" className="text-destructive mt-2 text-xs">
          Resending failed. Wait a moment and retry.
        </p>
      ) : null}

      <div className="border-border mt-4 border-t border-solid pt-4">
        <p className="text-foreground text-sm font-medium">Delete account</p>
        <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
          Removes the account, its projects access, saved defaults, and billing
          record. This cannot be undone.
        </p>
        <Button
          variant="destructive"
          size="sm"
          className="mt-3 min-h-11 px-4 sm:min-h-9"
          onClick={() => {
            setPassword("");
            setError(null);
            setOpen(true);
          }}
        >
          <TrashIcon />
          Delete account
        </Button>
      </div>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setError(null);
        }}
      >
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Delete this account?</DialogTitle>
            <DialogDescription>
              Enter your password to confirm. Your projects stay readable through
              their access keys, but the account, sessions, and billing record are
              gone permanently.
            </DialogDescription>
          </DialogHeader>

          <div>
            <label htmlFor="delete-password" className="text-foreground text-sm font-medium">
              Password
            </label>
            <Input
              id="delete-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1.5 font-mono text-xs"
            />
            {blockedReason !== null ? (
              <p className="text-muted-foreground mt-1 text-xs">{blockedReason}</p>
            ) : null}
          </div>

          {error !== null ? (
            <div role="alert" className="bg-destructive/10 rounded-lg p-3">
              <p className="text-destructive text-sm font-medium">{error}</p>
            </div>
          ) : null}

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" className="min-h-[44px] sm:min-h-9" />}>
              Keep my account
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              className="min-h-[44px] sm:min-h-9"
              onClick={() => void confirmDelete()}
              disabled={deleting || blockedReason !== null}
            >
              <TrashIcon />
              {deleting ? "Deleting…" : "Delete account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
