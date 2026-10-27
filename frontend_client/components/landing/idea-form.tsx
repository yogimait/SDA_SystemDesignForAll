"use client";

import {
  CreateProjectRequestSchema,
  CreateProjectResponseSchema,
} from "@sda/contracts";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
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
  "Design a URL shortener",
  "Design WhatsApp",
  "Design a job queue",
  "Build a food delivery app",
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
    ? `Too long — shorten the idea to ${MAX_IDEA_LENGTH} characters or fewer.`
    : `Describe anything from "Build Spotify" to a detailed spec. Up to ${MAX_IDEA_LENGTH} characters.`;

  return (
    <div
      id="idea-capture"
      className="border-border bg-card rounded-xl border border-solid p-6 md:p-8"
    >
      <label
        htmlFor="system-idea"
        className="text-foreground text-sm font-medium"
      >
        Your system idea
      </label>
      <textarea
        id="system-idea"
        className="placeholder:text-muted-foreground/60 focus-visible:ring-ring text-foreground border-input bg-background focus-visible:border-ring focus-visible:ring-2 mt-2 min-h-[7.5rem] w-full resize-y rounded-lg border p-4 transition-colors focus-visible:outline-1"
        placeholder="e.g. Design a distributed rate limiter for a public API…"
        rows={4}
        value={idea}
        disabled={submitting}
        onChange={(event) => setIdea(event.target.value)}
        aria-describedby={hintId}
      />
      <p
        id={hintId}
        data-too-long={tooLong}
        className={`mt-2 text-xs ${tooLong ? "text-destructive" : "text-muted-foreground"}`}
      >
        {hint}
      </p>

      <div className="mt-6 flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground font-mono text-xs">
            Try an example:
          </span>
          {EXAMPLE_IDEAS.map((example) => (
            <button
              key={example}
              type="button"
              className="hover:border-ring hover:bg-popover hover:text-foreground text-muted-foreground bg-background border-input font-mono rounded border px-3 py-1.5 text-xs transition-[color,background-color,border-color,transform] duration-150 hover:-translate-y-px focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-1 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={submitting}
              onClick={() => setIdea(example)}
            >
              {example}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="bg-primary text-primary-foreground hover:brightness-105 hover:-translate-y-px active:translate-y-0 active:brightness-95 focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-1 h-10 flex-none rounded-xl px-6 text-sm font-medium transition-[filter,transform] duration-150 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!canSubmit}
          onClick={startSession}
        >
          {submitting ? "Creating session…" : "Start design session"}
        </button>
      </div>

      {failed ? (
        <div
          role="alert"
          className="bg-card border-destructive/40 mt-6 rounded-lg border border-solid border-t p-4"
        >
          <p className="text-destructive text-sm font-medium">{failed.user}</p>
          <p className="text-muted-foreground font-mono mt-1 text-xs">
            {failed.detail}
          </p>
        </div>
      ) : null}

      <div className="border-border mt-6 flex items-center gap-2 border-t border-solid pt-4">
        <span className="bg-primary inline-block h-1.5 w-1.5 flex-none rounded-full" />
        <p className="text-muted-foreground font-mono text-xs">
          First session? You will set your model provider key in one dialog — it
          stays in this browser tab only.
        </p>
      </div>
    </div>
  );
}
