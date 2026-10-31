"use client";

/**
 * Auth page: login + register in one card. On success the session is stored
 * in sessionStorage and the user continues to the library (or `?next=`).
 * The contract's register/login are the only auth endpoints defined so far.
 */

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AuthResponseSchema } from "@sda/contracts";
import { LightbulbIcon } from "lucide-react";
import { useHydrated } from "@/hooks/use-session";
import { peekPendingIdea } from "@/lib/session/keys";
import { CircleAlertIcon, LogInIcon, UserPlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiFetch, ApiError } from "@/lib/api/client";
import { authRateLimitCopy } from "@/lib/auth/messages";
import { safeNextPath } from "@/lib/auth/safe-next";
import { saveSession } from "@/lib/session/auth";
import {
  FLOATING_HEADER_CARD,
  FLOATING_HEADER_SHELL,
} from "@/components/ui/floating-header";

function AuthForms() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNextPath(searchParams.get("next"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [busy, setBusy] = useState<"login" | "register" | null>(null);
  const [error, setError] = useState<{ user: string; detail: string } | null>(null);

  async function submit(mode: "login" | "register"): Promise<void> {
    setError(null);
    if (email.trim() === "" || password.length < 8) {
      setError({
        user: "Enter your email and a password of at least 8 characters.",
        detail: "client-side check",
      });
      return;
    }
    if (mode === "register" && password !== passwordConfirm) {
      setError({ user: "The passwords do not match.", detail: "client-side check" });
      return;
    }
    setBusy(mode);
    try {
      const auth = await apiFetch(`/api/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), password }),
        dataSchema: AuthResponseSchema,
      });
      saveSession(auth);
      router.push(next);
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError({
          user: authRateLimitCopy(caught) ?? caught.userMessage,
          detail: caught.message,
        });
      } else {
        setError({
          user: "Signing in failed unexpectedly.",
          detail: caught instanceof Error ? caught.message : String(caught),
        });
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="bg-card border-border rounded-xl border border-solid p-6 sm:p-8">
      <Tabs defaultValue="login">
        <TabsList>
          <TabsTrigger value="login">Sign in</TabsTrigger>
          <TabsTrigger value="register">Create account</TabsTrigger>
        </TabsList>

        {(["login", "register"] as const).map((mode) => (
          <TabsContent key={mode} value={mode} className="mt-4 space-y-4">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void submit(mode);
              }}
              className="space-y-4"
            >
              <div>
                <label htmlFor={`email-${mode}`} className="text-foreground text-sm font-medium">
                  Email
                </label>
                <Input
                  id={`email-${mode}`}
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  className="mt-1.5 font-mono text-xs"
                  required
                />
              </div>
              <div>
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor={`password-${mode}`} className="text-foreground text-sm font-medium">
                    Password
                  </label>
                  {mode === "login" ? (
                    <Link
                      href="/forgot-password"
                      className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline"
                    >
                      Forgot password?
                    </Link>
                  ) : null}
                </div>
                <Input
                  id={`password-${mode}`}
                  type="password"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={mode === "register" ? "At least 8 characters" : "Your password"}
                  className="mt-1.5 font-mono text-xs"
                  required
                  minLength={8}
                />
              </div>
              {mode === "register" ? (
                <div>
                  <label htmlFor="password-confirm" className="text-foreground text-sm font-medium">
                    Confirm password
                  </label>
                  <Input
                    id="password-confirm"
                    type="password"
                    autoComplete="new-password"
                    value={passwordConfirm}
                    onChange={(event) => setPasswordConfirm(event.target.value)}
                    className="mt-1.5 font-mono text-xs"
                    required
                    minLength={8}
                  />
                </div>
              ) : null}

              {error !== null ? (
                <div role="alert" className="bg-destructive/10 rounded-lg p-4">
                  <p className="text-destructive flex items-start gap-2 text-sm font-medium">
                    <CircleAlertIcon className="mt-0.5 size-4 flex-none" aria-hidden="true" />
                    {error.user}
                  </p>
                  <p className="text-muted-foreground mt-1 font-mono text-[11px]">{error.detail}</p>
                </div>
              ) : null}

              <Button
                type="submit"
                disabled={busy !== null}
                className="w-full"
              >
                {mode === "login" ? <LogInIcon /> : <UserPlusIcon />}
                {busy === mode ? "Working…" : mode === "login" ? "Sign in" : "Create account"}
              </Button>
            </form>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function LoginContent() {
  // Sign-in-and-continue: when an idea waits from the landing page, say why
  // the visitor landed here (deferred read; the landing form consumes the
  // slot after sign-in).
  const hydrated = useHydrated();
  const [pendingIdea, setPendingIdea] = useState(false);
  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => {
      setPendingIdea(peekPendingIdea() !== null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [hydrated]);

  return (
    <div className="w-full max-w-[460px] animate-fade-up">
      <div className="mb-5">
        <h1 className="text-foreground text-balance text-xl font-medium tracking-tight">
          Your designs belong to you. Sign in to reach your library, dashboard, and settings.
        </h1>
        {pendingIdea ? (
          <p className="text-success mt-2 flex items-center gap-1.5 text-sm">
            <LightbulbIcon className="size-4 flex-none" aria-hidden="true" />
            Your idea is saved in this tab. Sign in to continue designing it.
          </p>
        ) : null}
      </div>
      <AuthForms />
      <p className="text-muted-foreground mt-4 text-xs leading-relaxed">
        Access tokens last 15 minutes and are refreshed automatically in this
        tab; the refresh credential is an httpOnly cookie. Project access keys
        stay per-project and are required to open a workspace.
      </p>
      <Link
        href="/"
        className="text-primary hover:underline mt-4 inline-block text-sm underline-offset-4"
      >
        Back to the landing page
      </Link>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className={FLOATING_HEADER_SHELL}>
        <div className={`${FLOATING_HEADER_CARD} mx-auto w-full max-w-[1100px] px-6 py-3`}>
          <Link href="/" className="focus-visible:ring-ring flex items-center gap-2 rounded focus-visible:ring-2 focus-visible:outline-1">
            <span className="text-primary font-mono text-sm font-bold">sda/</span>
            <span className="text-foreground text-sm font-bold tracking-tight">
              System Design All-in-One
            </span>
          </Link>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-[1100px] flex-1 items-center justify-center px-6 py-10">
        <Suspense
          fallback={<p className="text-muted-foreground text-sm" role="status">Loading…</p>}
        >
          <LoginContent />
        </Suspense>
      </main>
    </div>
  );
}
