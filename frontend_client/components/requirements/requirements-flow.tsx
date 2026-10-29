"use client";

import {
  ProjectSchema,
  RequirementsResponseSchema,
  StartRunResponseSchema,
  type GenerationOptions,
  type RequirementsSpec,
} from "@sda/contracts";
import { CircleCheckIcon, ListChecksIcon, RotateCcwIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { JourneyShell } from "@/components/journey-shell";
import { Button } from "@/components/ui/button";
import { RunProgress } from "@/components/requirements/run-progress";
import { SpecEditor } from "@/components/requirements/spec-editor";
import { useRunTerminalEffect } from "@/hooks/use-generation-run";
import { useRunLive } from "@/hooks/use-run-stream";
import { apiFetch, ApiError } from "@/lib/api/client";
import { queryKeys } from "@/lib/query-keys";
import {
  loadProjectAccessKey,
  loadProviderSetup,
} from "@/lib/session/keys";
import { loadSession } from "@/lib/session/auth";

type Phase =
  | { kind: "loading" }
  | { kind: "error"; user: string; detail: string }
  | { kind: "start"; idea: string }
  | { kind: "run"; runId: string; context: "requirements" | "architecture" }
  | { kind: "editor" }
  | { kind: "ready"; version: number | null };

/**
 * Single controller for the requirements experience: access gate, load,
 * generation runs, and routing between states. Payloads validate against
 * contracts at the trust boundary.
 */
export function RequirementsFlow({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [projectKey, setProjectKey] = useState<string | null>(null);
  const [spec, setSpec] = useState<RequirementsSpec | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<{
    user: string;
    detail: string;
  } | null>(null);

  // Initial load: access key (creator's tab) OR owner Bearer → project →
  // requirements. Single gate, single error path.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const session = loadSession();
      const key = loadProjectAccessKey(projectId);
      if (key === null && session === null) {
        setPhase({
          kind: "error",
          user: "The access key for this project is not in this browser tab.",
          detail:
            "Project access keys live in sessionStorage and die with the tab. Start a new design session from the landing page, or sign in with the owner account.",
        });
        return;
      }
      setProjectKey(key);

      try {
        const project = await apiFetch(`/api/projects/${projectId}`, {
          projectKey: key ?? undefined,
          auth: session !== null,
          dataSchema: ProjectSchema,
        });
        if (cancelled) return;
        const requirements = await apiFetch(
          `/api/projects/${projectId}/requirements`,
          {
            projectKey: key ?? undefined,
            auth: session !== null,
            dataSchema: RequirementsResponseSchema,
          },
        );
        if (cancelled) return;

        if (requirements.spec === null) {
          setSpec(null);
          setPhase({ kind: "start", idea: project.idea });
        } else {
          setSpec(requirements.spec);
          setPhase({ kind: "editor" });
        }
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError) {
          setPhase({
            kind: "error",
            user: error.userMessage,
            detail: error.message,
          });
        } else {
          setPhase({
            kind: "error",
            user: "Loading the project failed unexpectedly.",
            detail: error instanceof Error ? error.message : String(error),
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // Intentionally runs once per mount.
  }, [projectId]);

  async function startRunOnce(context: "requirements" | "architecture"): Promise<string | null> {
    if (projectKey === null && loadSession() === null) return null;
    setStarting(true);
    setStartError(null);
    try {
      const setup = loadProviderSetup();
      const options: GenerationOptions = {
        // Provider and key must match: a Groq key on the default provider fails.
        ...(setup === null || setup.provider === ""
          ? {}
          : { provider: setup.provider }),
        ...(setup === null || setup.model.trim() === ""
          ? {}
          : { model: setup.model.trim() }),
      };
      const started = await apiFetch(
        context === "requirements"
          ? `/api/projects/${projectId}/requirements`
          : `/api/projects/${projectId}/architecture`,
        {
          method: "POST",
          body: JSON.stringify(options),
          projectKey: projectKey ?? undefined,
          auth: loadSession() !== null,
          ...(setup === null || setup.apiKey.trim() === ""
            ? {}
            : { providerKey: setup.apiKey.trim() }),
          dataSchema: StartRunResponseSchema,
        },
      );
      return started.runId;
    } catch (error) {
      if (error instanceof ApiError) {
        setStartError({ user: error.userMessage, detail: error.message });
      } else {
        setStartError({
          user: "Starting the generation failed unexpectedly.",
          detail: error instanceof Error ? error.message : String(error),
        });
      }
      return null;
    } finally {
      setStarting(false);
    }
  }

  function withRun(context: "requirements" | "architecture") {
    void (async () => {
      const runId = await startRunOnce(context);
      if (runId !== null) setPhase({ kind: "run", runId, context });
    })();
  }

  /** RunProgress reports terminal outcomes; route + invalidate accordingly. */
  const handleTerminal = useCallback(
    (outcome: "succeeded" | "failed" | "interrupted", runContext: "requirements" | "architecture") => {
      if (outcome !== "succeeded") return; // failures render inside RunProgress
      if (runContext === "requirements") {
        void (async () => {
          await queryClient.invalidateQueries({
            queryKey: queryKeys.requirements(projectId),
          });
          const response = await apiFetch(
            `/api/projects/${projectId}/requirements`,
            {
              projectKey: projectKey ?? undefined,
              auth: loadSession() !== null,
              dataSchema: RequirementsResponseSchema,
            },
          );
          if (response.spec === null) {
            setPhase({
              kind: "error",
              user: "The run finished but produced no readable specification.",
              detail: "Retry the generation from the run view.",
            });
          } else {
            setSpec(response.spec);
            setPhase({ kind: "editor" });
          }
        })();
      } else {
        void (async () => {
          await queryClient.invalidateQueries({
            queryKey: queryKeys.architecture(projectId),
          });
          await queryClient.invalidateQueries({
            queryKey: queryKeys.requirements(projectId),
          });
          await queryClient.invalidateQueries({
            queryKey: queryKeys.project(projectId),
          });
          const project = await apiFetch(`/api/projects/${projectId}`, {
            projectKey: projectKey ?? undefined,
            auth: loadSession() !== null,
            dataSchema: ProjectSchema,
          });
          setPhase({ kind: "ready", version: project.currentArchitectureVersion });
        })();
      }
    },
    [projectId, projectKey, queryClient],
  );

  return (
    <div className="space-y-6">
      {phase.kind === "error" ? (
        <JourneyShell
          stage="specification"
          tone="error"
          title={phase.user}
          lead="Nothing was lost — recover here or start a fresh session from the landing page."
        >
          <p className="text-muted-foreground font-mono text-xs">{phase.detail}</p>
          <div className="mt-5">
            <Link
              href="/"
              className="text-primary hover:underline inline-block text-sm underline-offset-4"
            >
              Back to the landing page
            </Link>
          </div>
        </JourneyShell>
      ) : null}

      {phase.kind === "loading" ? (
        <JourneyShell
          stage="specification"
          tone="loading"
          title="Loading your project…"
          lead="Reading the saved idea and any specification already produced."
        >
          <div className="space-y-2.5" role="status">
            <div className="bg-muted h-3 w-full animate-pulse rounded-full" />
            <div className="bg-muted h-3 w-[85%] animate-pulse rounded-full" />
            <div className="bg-muted h-3 w-[55%] animate-pulse rounded-full" />
          </div>
        </JourneyShell>
      ) : null}

      {phase.kind === "start" ? (
        <JourneyShell
          stage="specification"
          title="Idea saved — now shape the specification"
          lead="The model reads your idea and proposes an editable specification. Nothing is final until you confirm it."
        >
          <p className="text-muted-foreground border-border/70 border-l border-solid pl-4 text-sm leading-relaxed">
            {phase.idea}
          </p>

          <ol className="text-muted-foreground mt-5 space-y-2 text-sm">
            {[
              <>The model proposes functional and non-functional requirements from the idea.</>,
              <>You add assumptions, answer clarifying questions, and confirm the spec.</>,
              <>Confirmation starts the architecture run and the interactive workspace.</>,
            ].map((line, index) => (
              <li key={index} className="flex items-start gap-2.5">
                <span
                  aria-hidden="true"
                  className="border-border text-foreground/85 mt-0.5 flex size-5 flex-none items-center justify-center rounded-full border font-mono text-[10px]"
                >
                  {index + 1}
                </span>
                <span className="leading-relaxed">{line}</span>
              </li>
            ))}
          </ol>

          <div className="flex flex-wrap items-center gap-3 pt-6">
            <Button
              onClick={() => withRun("requirements")}
              disabled={starting}
              className="min-h-9 px-5"
            >
              <ListChecksIcon />
              {starting ? "Queuing requirements run…" : "Generate requirements"}
            </Button>
            <p className="text-muted-foreground text-xs">
              Confirming later publishes the specification snapshot — drafts stay editable.
            </p>
          </div>

          {startError !== null ? (
            <div
              role="alert"
              className="bg-destructive/10 mt-4 rounded-lg p-4"
            >
              <p className="text-destructive text-sm font-medium">{startError.user}</p>
              <p className="text-muted-foreground font-mono mt-1 text-xs">
                {startError.detail}
              </p>
            </div>
          ) : null}
        </JourneyShell>
      ) : null}

      {phase.kind === "run" ? (
        <JourneyShell
          stage={phase.context === "requirements" ? "specification" : "architecture"}
          title={
            phase.context === "requirements"
              ? "Analyzing your idea…"
              : "Generating the architecture…"
          }
          lead={
            phase.context === "requirements"
              ? "The run is real backend work — every stage below is a persisted step, not a mock loader."
              : "The HLD, the class/DSA model, then validation and persistence run in order."
          }
        >
          <RunPhase
            runId={phase.runId}
            projectKey={projectKey}
            context={phase.context}
            onTerminal={handleTerminal}
            onRetry={() => withRun(phase.context)}
          />
        </JourneyShell>
      ) : null}

      {phase.kind === "editor" && spec !== null ? (
        <div className="animate-fade-up">
          <SpecEditor
            projectId={projectId}
            projectKey={projectKey}
            spec={spec}
            setup={loadProviderSetup()}
            onArchitectureStarted={(runId) =>
              setPhase({ kind: "run", runId, context: "architecture" })
            }
            onSpecSynced={setSpec}
          />
        </div>
      ) : null}

      {phase.kind === "ready" ? (
        <JourneyShell
          stage="workspace"
          title="Architecture ready"
          lead="The canonical model is persisted and validated server-side. The workspace reads exactly that model live."
        >
          <ul className="flex flex-wrap gap-2">
            {["Requirements confirmed", `Architecture version ${phase.version ?? "—"} persisted`, "Validation passed"].map(
              (label) => (
                <li
                  key={label}
                  className="border-border/70 text-foreground/85 flex items-center gap-1.5 rounded-full border border-solid px-3 py-1 text-xs"
                >
                  <CircleCheckIcon className="text-success size-3.5" aria-hidden="true" />
                  {label}
                </li>
              ),
            )}
          </ul>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link href={`/projects/${projectId}/workspace`}>
              <Button className="min-h-9 px-5">
                <ListChecksIcon />
                Open workspace
              </Button>
            </Link>
            <Button
              variant="outline"
              className="min-h-9"
              onClick={() => setPhase({ kind: "editor" })}
            >
              <RotateCcwIcon />
              Back to the specification
            </Button>
          </div>
        </JourneyShell>
      ) : null}
    </div>
  );
}

/** Hooks must live in one stable component instance per run phase. */
function RunPhase({
  runId,
  projectKey,
  context,
  onTerminal,
  onRetry,
}: {
  runId: string;
  projectKey: string | null;
  context: "requirements" | "architecture";
  onTerminal: (
    outcome: "succeeded" | "failed" | "interrupted",
    context: "requirements" | "architecture",
  ) => void;
  onRetry: () => void;
}) {
  const { run, isLoading, error, connection } = useRunLive(runId, projectKey);
  useRunTerminalEffect(run, (outcome) => onTerminal(outcome, context));

  return (
    <div className="animate-fade-up">
      <RunProgress
        run={run}
        error={error}
        isLoading={isLoading}
        context={context}
        onRetry={onRetry}
        connection={connection}
      />
    </div>
  );
}
