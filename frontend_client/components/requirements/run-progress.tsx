"use client";

import type { GenerationRun, RunError, StageStatus } from "@sda/contracts";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { RotateCcwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import { formatTokens } from "@/lib/format";
import type { RunConnection } from "@/hooks/use-run-stream";

const STATUS_DOT_CLASS: Record<StageStatus | GenerationRun["status"], string> = {
  queued: "bg-border",
  pending: "bg-border",
  running: "bg-warning animate-pulse motion-reduce:animate-none",
  succeeded: "bg-success",
  failed: "bg-destructive",
  interrupted: "bg-destructive",
};

const STATUS_LABEL: Record<StageStatus | GenerationRun["status"], string> = {
  queued: "queued",
  pending: "pending",
  running: "running",
  succeeded: "done",
  failed: "failed",
  interrupted: "interrupted",
};

const STATUS_TEXT_CLASS: Record<StageStatus | GenerationRun["status"], string> = {
  queued: "text-muted-foreground",
  pending: "text-muted-foreground",
  running: "text-warning",
  succeeded: "text-success",
  failed: "text-destructive",
  interrupted: "text-destructive",
};

/** Status = color + shape + text, never color alone (design system rule). */
export function StatusChip({ status }: { status: StageStatus | GenerationRun["status"] }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-1.5 w-1.5 flex-none rounded-full ${STATUS_DOT_CLASS[status]}`} />
      <span className={`font-mono text-[11px] ${STATUS_TEXT_CLASS[status]}`}>
        {STATUS_LABEL[status]}
      </span>
    </span>
  );
}

const CONNECTION_DOT: Record<RunConnection, string> = {
  connecting: "bg-border",
  live: "bg-success",
  reconnecting: "bg-warning animate-pulse motion-reduce:animate-none",
  polling: "bg-border",
  closed: "bg-border",
};

/** Small live connection indicator: dot + word (text carries the meaning). */
function ConnectionIndicator({ connection }: { connection: RunConnection }) {
  if (connection === "closed") return null;
  return (
    <span
      role="status"
      aria-label={`Run updates: ${connection}`}
      className="border-border/60 text-muted-foreground flex items-center gap-1.5 rounded-full border border-solid px-2 py-0.5"
    >
      <span className={`inline-block h-1.5 w-1.5 flex-none rounded-full ${CONNECTION_DOT[connection]}`} />
      <span className="font-mono text-[10px]">{connection}</span>
    </span>
  );
}

function RunErrorBanner({ error, retryAfter: retryAfter }: { error: RunError; retryAfter: number | null }) {
  return (
    <div
      role="alert"
      className="bg-destructive/10 mt-4 rounded-lg p-4"
    >
      <p className="text-destructive text-sm font-medium">
        Generation failed with a{" "}
        <span className="font-mono text-[12px]">{error.code}</span> error
      </p>
      <p className="text-muted-foreground mt-1 text-xs leading-relaxed">{error.message}</p>
      {retryAfter !== null && retryAfter > 0 ? (
        <p className="text-warning mt-1 font-mono text-[11px]">
          Provider asks to wait ~{retryAfter}s before retrying.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Live stage list for one generation run. Renders the run's own rows only —
 * the page shell (JourneyShell) provides the card, heading, and position.
 */
export function RunProgress({
  run,
  error,
  isLoading,
  context,
  onRetry,
  connection = "polling",
}: {
  /** Latest run dto (streamed or polled); null while the first fetch is in flight. */
  run: GenerationRun | null;
  error: Error | null;
  isLoading: boolean;
  /** Drives the friendly running description ("session quote"). */
  context: "requirements" | "architecture";
  onRetry: () => void;
  /** Live stream state; polling is the fallback. Hidden once terminal. */
  connection?: RunConnection;
}) {
  const pathname = usePathname();
  const terminal = run !== null && run.status !== "queued" && run.status !== "running";
  /** Indicator shows while connecting/reconnecting even before the first
   * run frame arrives (D6) — only terminal runs and hard-closed states hide it. */
  const showConnection = connection !== "closed" && (run === null || !terminal);
  const apiError = error instanceof ApiError ? error : null;
  const retryAfter =
    run?.error !== null && run?.error?.details?.retryAfterSeconds !== undefined &&
    typeof run.error.details.retryAfterSeconds === "number"
      ? run.error.details.retryAfterSeconds
      : null;

  const quote =
    context === "requirements"
      ? "Drafting functional and non-functional requirements from your idea."
      : "Composing the HLD, the class model, the DSA picks, and the learning steps.";
  const technical = run !== null ? `${run.provider} · ${run.model}` : undefined;

  return (
    <div aria-busy={run === null || (!terminal && error === null)} aria-live="polite">
      <div className="flex items-center justify-between gap-3 border-b border-solid border-border/60 pb-3">
        <div className="min-w-0">
          <p className="text-foreground/85 text-sm" title={technical}>
            {quote}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            {run !== null ? <StatusChip status={run.status} /> : null}
            {showConnection ? <ConnectionIndicator connection={connection} /> : null}
            {run !== null ? (
              <span className="text-muted-foreground font-mono text-[11px]" title={technical}>
                {formatTokens(run.usage.totalTokens)} tokens used
              </span>
            ) : null}
          </div>
        </div>
        {terminal && run.status !== "succeeded" ? (
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="focus-visible:ring-ring flex-none"
          >
            <RotateCcwIcon />
            Retry generation
          </Button>
        ) : null}
      </div>

      {isLoading && run === null ? (
        <p className="text-muted-foreground mt-4 text-sm">Fetching run status…</p>
      ) : null}

      {error !== null && run === null ? (
        <div role="alert" className="bg-destructive/10 mt-4 rounded-lg p-4">
          <p className="text-destructive text-sm font-medium">
            {apiError?.userMessage ?? "Run status unavailable."}
          </p>
          <p className="text-muted-foreground font-mono mt-1 text-xs">{error.message}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {apiError?.code === "AUTH_REQUIRED" ? (
              <Link
                href={`/login?next=${encodeURIComponent(pathname)}`}
                className="text-primary hover:underline text-sm underline-offset-4"
              >
                Sign in
              </Link>
            ) : (
              <Button variant="outline" size="sm" onClick={onRetry}>
                <RotateCcwIcon />
                Retry
              </Button>
            )}
          </div>
        </div>
      ) : null}

      {run !== null ? (
        <ol aria-label="Run stages" className="mt-4 space-y-2">
          {run.stages.map((stage) => {
            const active = stage.status === "running";
            return (
              <li
                key={stage.name}
                aria-current={active ? "step" : undefined}
                className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-solid px-3 py-2 transition-colors ${
                  active
                    ? "border-warning/70 bg-warning/10"
                    : "border-border/60"
                }`}
              >
                <StatusChip status={stage.status} />
                <span className={`font-mono text-xs ${active ? "text-foreground font-medium" : "text-foreground"}`}>
                  {stage.name}
                </span>
                {stage.attempt > 1 ? (
                  <span className="text-warning font-mono text-[11px]">
                    attempt {stage.attempt}
                  </span>
                ) : null}
                {stage.usage !== null ? (
                  <span className="text-muted-foreground font-mono text-[11px]">
                    {formatTokens(stage.usage.totalTokens)} tok
                  </span>
                ) : null}
                {stage.error !== null ? (
                  <span className="text-destructive truncate text-[11px]">
                    {stage.error.message}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}

      {run?.error !== null && run?.error != null ? (
        <RunErrorBanner error={run.error} retryAfter={retryAfter} />
      ) : null}
    </div>
  );
}
