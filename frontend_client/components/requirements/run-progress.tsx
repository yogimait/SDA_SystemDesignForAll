"use client";

import type { GenerationRun, RunError, StageStatus } from "@sda/contracts";
import { RotateCcwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatTokens } from "@/lib/format";

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
  onRetry,
}: {
  /** Latest polled run dto; null while the first fetch is in flight. */
  run: GenerationRun | null;
  error: Error | null;
  isLoading: boolean;
  onRetry: () => void;
}) {
  const terminal = run !== null && run.status !== "queued" && run.status !== "running";
  const retryAfter =
    run?.error !== null && run?.error?.details?.retryAfterSeconds !== undefined &&
    typeof run.error.details.retryAfterSeconds === "number"
      ? run.error.details.retryAfterSeconds
      : null;

  return (
    <div aria-busy={run === null || (!terminal && error === null)} aria-live="polite">
      <div className="flex items-center justify-between gap-3 border-b border-solid border-border/60 pb-3">
        <div>
          <p className="text-foreground/85 font-mono text-xs">
            {run !== null ? (
              <>
                run {run.id.slice(0, 8)} · {run.provider} · {run.model}
              </>
            ) : (
              "connecting…"
            )}
          </p>
          {run !== null ? (
            <div className="mt-1.5 flex items-center gap-3">
              <StatusChip status={run.status} />
              <span className="text-muted-foreground font-mono text-[11px]">
                {formatTokens(run.usage.totalTokens)} tokens used
              </span>
            </div>
          ) : null}
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
        <div role="alert" className="text-destructive mt-4 text-sm">
          Polling the run failed: {error.message}
        </div>
      ) : null}

      {run !== null ? (
        <ol className="mt-4 space-y-2">
          {run.stages.map((stage) => (
            <li
              key={stage.name}
              className="border-border/60 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-solid px-3 py-2"
            >
              <StatusChip status={stage.status} />
              <span className="text-foreground font-mono text-xs">{stage.name}</span>
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
          ))}
        </ol>
      ) : null}

      {run?.error !== null && run?.error != null ? (
        <RunErrorBanner error={run.error} retryAfter={retryAfter} />
      ) : null}
    </div>
  );
}
