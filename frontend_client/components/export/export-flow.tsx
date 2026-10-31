"use client";

/**
 * Export flow: loads the project + architecture through the same query keys
 * as the workspace (cache-shared when opened from there), gates on
 * key-or-owner-session like every other project surface, and refuses to
 * render when the model is missing or invalid — an error card, never a
 * blank print sheet.
 */

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  GetArchitectureResponseSchema,
  ProjectSchema,
} from "@sda/contracts";
import { CircleAlertIcon } from "lucide-react";
import { ExportDocument } from "@/components/export/export-document";
import { JourneyShell } from "@/components/journey-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { apiFetch, ApiError } from "@/lib/api/client";
import { queryKeys } from "@/lib/query-keys";
import { loadProjectAccessKey } from "@/lib/session/keys";
import { loadSession } from "@/lib/session/auth";
import { useHydrated } from "@/hooks/use-session";

export function ExportFlow({ projectId }: { projectId: string }) {
  const hydrated = useHydrated();
  const session = loadSession();
  const key = loadProjectAccessKey(projectId);
  const authorized = key !== null || session !== null;
  const [attempt, setAttempt] = useState(0);

  const project = useQuery({
    queryKey: queryKeys.project(projectId),
    enabled: hydrated && authorized,
    queryFn: () =>
      apiFetch(`/api/projects/${projectId}`, {
        projectKey: key ?? undefined,
        auth: session !== null,
        dataSchema: ProjectSchema,
      }),
  });

  const architecture = useQuery({
    queryKey: [...queryKeys.architecture(projectId), "export", attempt],
    enabled: hydrated && authorized,
    queryFn: () =>
      apiFetch(`/api/projects/${projectId}/architecture`, {
        projectKey: key ?? undefined,
        auth: session !== null,
        dataSchema: GetArchitectureResponseSchema,
      }),
  });

  if (!hydrated) {
    return <ExportSkeleton />;
  }

  if (!authorized) {
    return (
      <JourneyShell
        stage="architecture"
        tone="error"
        title="This export needs project access."
        lead="Project access keys live in this browser tab only. Reopen from the library with your account, or start a session from the landing page."
      >
        <div className="flex flex-wrap gap-3">
          <Link href="/login?next=/library" className="text-primary hover:underline text-sm underline-offset-4">
            Sign in
          </Link>
          <Link href="/" className="text-muted-foreground hover:text-foreground text-sm">
            Back to the landing page
          </Link>
        </div>
      </JourneyShell>
    );
  }

  const error = project.error ?? architecture.error;
  if (error !== null) {
    const api = error instanceof ApiError ? error : null;
    return (
      <JourneyShell
        stage="architecture"
        tone="error"
        title={api?.userMessage ?? "Loading the export failed."}
        lead="Nothing is exported until the model loads. Retry, or go back to the workspace."
      >
        <p className="text-muted-foreground font-mono text-xs">
          {api?.message ?? String(error)}
        </p>
        <div className="mt-5 flex gap-3">
          <Button variant="outline" size="sm" onClick={() => setAttempt((n) => n + 1)}>
            Retry
          </Button>
          <Link href={`/projects/${projectId}/workspace`} className="text-primary hover:underline text-sm underline-offset-4">
            Back to the workspace
          </Link>
        </div>
      </JourneyShell>
    );
  }

  if (
    project.isPending ||
    architecture.isPending ||
    project.data === undefined ||
    architecture.data === undefined
  ) {
    return <ExportSkeleton />;
  }

  const version = architecture.data.version;
  if (version === null) {
    return (
      <JourneyShell
        stage="architecture"
        tone="error"
        title="There is no architecture to export yet."
        lead="Generate and confirm an architecture first. The export renders the canonical model only."
      >
        <Link href={`/projects/${projectId}/requirements`} className="text-primary hover:underline text-sm underline-offset-4">
          Go to the requirements editor
        </Link>
      </JourneyShell>
    );
  }

  if (!version.validation.valid) {
    return (
      <JourneyShell
        stage="architecture"
        tone="error"
        title="The model failed validation. Export blocked."
        lead="An invalid model must not print as a trusted document. Fix validation in the workspace, then export again."
      >
        <p className="text-muted-foreground flex items-start gap-2 text-sm">
          <CircleAlertIcon className="mt-0.5 size-4 flex-none" aria-hidden="true" />
          {version.validation.errors.length} blocking error
          {version.validation.errors.length === 1 ? "" : "s"} · first:{" "}
          {version.validation.errors[0]?.message ?? "unknown"}
        </p>
        <Link href={`/projects/${projectId}/workspace`} className="text-primary hover:underline mt-4 inline-block text-sm underline-offset-4">
          Open the workspace
        </Link>
      </JourneyShell>
    );
  }

  return <ExportDocument project={project.data} version={version} />;
}

function ExportSkeleton() {
  return (
    <div aria-busy="true" className="space-y-4">
      <Skeleton className="h-8 w-2/3 rounded" />
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-72 w-full rounded-xl" />
      <span className="sr-only" role="status">
        Loading the export document…
      </span>
    </div>
  );
}
