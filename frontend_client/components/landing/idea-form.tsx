"use client";

import {
  CreateProjectRequestSchema,
  CreateProjectResponseSchema,
} from "@sda/contracts";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { KeyRoundIcon } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api/client";
import {
  consumePendingIdea,
  savePendingIdea,
  saveProjectAccessKey,
} from "@/lib/session/keys";
import { useHydrated } from "@/hooks/use-session";
import { loadSession } from "@/lib/session/auth";

const EXAMPLE_IDEAS = [
  "Build Spotify",
  "URL shortener",
  "Design WhatsApp",
  "Design a job queue",
  "Food delivery app",
  "Distributed cache",
];

const MAX_IDEA_LENGTH = 8000;

export function IdeaForm() {
  const router = useRouter();
  const hintId = useId();
  const [idea, setIdea] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState<{ user: string; detail: string } | null>(
    null,
  );

  // Sign-in-and-continue: after the login redirect, restore the idea the user
  // typed before being asked to sign in (deferred off the effect body).
  const hydrated = useHydrated();
  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => {
      const pending = consumePendingIdea();
      if (pending !== null) setIdea(pending);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [hydrated]);

  const trimmed = idea.trim();
  const tooLong = trimmed.length > MAX_IDEA_LENGTH;
  const empty = trimmed.length === 0;
  const canSubmit = !submitting && !tooLong && !empty;

  async function startSession() {
    if (!canSubmit) return;
    setSubmitting(true);
    setFailed(null);
    try {
      const request = CreateProjectRequestSchema.parse({ idea: trimmed });
      const created = await apiFetch("/api/projects", {
        method: "POST",
        body: JSON.stringify(request),
        auth: loadSession() !== null,
        dataSchema: CreateProjectResponseSchema,
      });
      saveProjectAccessKey(created.project.id, created.accessKey);
      router.push(`/projects/${created.project.id}/requirements`);
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === "AUTH_REQUIRED") {
          // Backend enforces signed-in design sessions: keep the idea and
          // ask for sign-in; the form pre-fills after the login redirect.
          savePendingIdea(trimmed);
          router.push("/login?next=/");
          return;
        }
        setFailed({ user: error.userMessage, detail: error.message });
      } else {
        setFailed({
          user: "Starting the session failed unexpectedly. Retry shortly.",
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  const hint = tooLong
    ? `Too long. Shorten the idea to ${MAX_IDEA_LENGTH} characters or fewer.`
    : `Describe anything from “Build Spotify” to a detailed spec. Up to ${MAX_IDEA_LENGTH.toLocaleString("en-US")} characters.`;

  return (
    <form
      id="idea-capture"
      className="bg-card border-border space-y-4 rounded-2xl border border-solid p-5 shadow-xl sm:p-6"
      onSubmit={(event) => {
        event.preventDefault();
        void startSession();
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <label
          htmlFor="system-idea"
          className="text-muted-foreground font-landing-mono text-xs font-medium tracking-wider uppercase"
        >
          Your system idea
        </label>
        <span className="text-muted-foreground font-landing-mono text-xs">
          {idea.length}/{MAX_IDEA_LENGTH}
        </span>
      </div>

      <textarea
        id="system-idea"
        className="bg-background/80 border-muted-foreground/60 text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-primary/40 font-landing w-full resize-y rounded-xl border border-solid p-3.5 text-sm transition-all focus:ring-1 focus:outline-none"
        placeholder="e.g. Design a distributed rate limiter for a public API…"
        rows={3}
        value={idea}
        disabled={submitting}
        aria-describedby={hintId}
        onChange={(event) => setIdea(event.target.value)}
      />
      <p id={hintId} className="sr-only" data-too-long={tooLong}>
        {hint}
      </p>

      {failed ? (
        <div role="alert" className="bg-destructive/10 rounded-xl p-3">
          <p className="text-destructive text-sm font-medium">{failed.user}</p>
          <p className="text-muted-foreground font-landing-mono mt-1 text-[11px]">
            {failed.detail}
          </p>
        </div>
      ) : null}

      <span className="sr-only" id="example-ideas-label">
        Example ideas
      </span>
      <div
        role="group"
        aria-labelledby="example-ideas-label"
        className="flex flex-wrap gap-2 pt-1"
      >
        {EXAMPLE_IDEAS.map((example) => (
          <button
            key={example}
            type="button"
            className="bg-background border-border text-muted-foreground hover:bg-popover hover:text-foreground focus-visible:ring-ring font-landing-mono inline-flex min-h-11 items-center rounded-lg border border-solid px-3 py-1.5 text-xs whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:outline-1 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={submitting}
            onClick={() => setIdea(example)}
          >
            {example}
          </button>
        ))}
      </div>

      <div className="border-border/60 flex flex-col justify-between gap-3 border-t border-solid pt-3 sm:flex-row sm:items-center">
        <div className="text-muted-foreground font-landing flex items-center gap-1.5 text-xs">
          <KeyRoundIcon className="text-primary size-3.5 flex-none" aria-hidden="true" />
          <span>Use your own API key (OpenRouter, Groq)</span>
        </div>
        <button
          type="submit"
          className="bg-primary text-primary-foreground hover:bg-primary-hover focus-visible:ring-ring focus-visible:ring-offset-background font-heading inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold shadow-md transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-1 disabled:cursor-not-allowed disabled:opacity-50 md:min-h-12"
          disabled={!canSubmit}
        >
          <span>{submitting ? "Creating session…" : "Start design session"}</span>
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </form>
  );
}
