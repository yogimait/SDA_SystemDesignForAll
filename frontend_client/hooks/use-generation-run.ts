import { useQuery } from "@tanstack/react-query";
import { GenerationRunSchema, type GenerationRun } from "@sda/contracts";
import { useEffect } from "react";
import { apiFetch, ApiError } from "@/lib/api/client";
import { queryKeys } from "@/lib/query-keys";
import { loadSession } from "@/lib/session/auth";

const ACTIVE_STATUSES = new Set(["queued", "running"]);
/** Mock provider runs finish quickly; saves an LLM round trip per stage. */
const POLL_INTERVAL_MS = 1200;

/**
 * Polls GET /api/runs/:runId while the run is queued|running. Stage state is
 * whatever the backend persisted (no client-side simulation). The project
 * key is optional when the caller authorizes as the owner via Bearer.
 */
export function useGenerationRun(runId: string, projectKey: string | null) {
  const query = useQuery<GenerationRun>({
    queryKey: queryKeys.run(runId),
    queryFn: () =>
      apiFetch(`/api/runs/${runId}`, {
        projectKey: projectKey ?? undefined,
        auth: loadSession() !== null,
        dataSchema: GenerationRunSchema,
      }),
    refetchInterval: (query) =>
      ACTIVE_STATUSES.has(query.state.data?.status ?? "queued")
        ? POLL_INTERVAL_MS
        : false,
    retry: (failureCount, error) => {
      // 4xx from the backend is deterministic; retrying would only spam.
      if (error instanceof ApiError && error.statusCode !== null && error.statusCode < 500) {
        return false;
      }
      return failureCount < 2;
    },
  });

  return {
    run: query.data ?? null,
    isLoading: query.isPending,
    error: query.error ?? null,
  };
}

/** True while a run should keep polling. */
export function isRunActive(run: GenerationRun | null): boolean {
  return run !== null && ACTIVE_STATUSES.has(run.status);
}

/**
 * Fires once when the run reaches a terminal state; falls are the caller's
 * opportunity to invalidate related queries (requirements, architecture,
 * project) through TanStack.
 */
export function useRunTerminalEffect(
  run: GenerationRun | null,
  onTerminal: (outcome: "succeeded" | "failed" | "interrupted") => void,
) {
  useEffect(() => {
    if (run !== null) {
      if (run.status === "succeeded" || run.status === "failed" || run.status === "interrupted") {
        onTerminal(run.status);
      }
    }
    // The callback changing itself must not retrigger; depend on status only.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- latest callback per status transition is enough
  }, [run?.status]);
}
