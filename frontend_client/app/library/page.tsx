"use client";

/**
 * User project library: authenticated list of the user's designs with
 * status filtering and cursor pagination. Project rows open the workspace —
 * per-project access keys (sessionStorage, creator's tab) remain the
 * boundary, so a public-link style open shows the honest access error.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { ProjectStatus } from "@sda/contracts";
import { ListProjectsResponseSchema } from "@sda/contracts";
import { ArrowUpRightIcon, ChevronsDownIcon, CircleAlertIcon } from "lucide-react";
import { PortalHeader } from "@/components/portal/portal-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, ApiError } from "@/lib/api/client";
import { useHydrated, useSession } from "@/hooks/use-session";

type StatusOption = ProjectStatus | null;
type ListedProject = import("@sda/contracts").ProjectSummary;
type Page = { projects: ListedProject[]; nextCursor: string | null };

const STATUS_LABEL: Record<ProjectStatus, string> = {
  requirements_pending: "Awaiting requirements",
  requirements_ready: "Specification ready",
  requirements_confirmed: "Specification confirmed",
  architecture_ready: "Architecture ready",
};

const STATUS_OPTIONS: Array<{ value: StatusOption; label: string }> = [
  { value: null, label: "All" },
  { value: "requirements_ready", label: "Specification ready" },
  { value: "requirements_confirmed", label: "Confirmed" },
  { value: "architecture_ready", label: "Architecture ready" },
];

const listSchema = ListProjectsResponseSchema;

export function LibraryContent() {
  const router = useRouter();
  const session = useSession();
  const [status, setStatus] = useState<StatusOption>(null);
  const [page, setPage] = useState<Page | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  // Route access control: unauthenticated visitors ride to login. During
  // hydration the session reads as null (server snapshot), so hold the
  // redirect until hydrated to avoid signing real users out.
  const hydrated = useHydrated();
  useEffect(() => {
    if (hydrated && session === null) {
      router.replace("/login?next=/library");
    }
  }, [hydrated, session, router]);

  const load = useCallback(
    async (cursor: string | null, replace: boolean) => {
      if (session === null) return;
      setLoading(true);
      setError(null);
      try {
        const query = new URLSearchParams({ limit: "20" });
        if (status !== null) query.set("status", status);
        if (cursor !== null) query.set("cursor", cursor);
        const data = await apiFetch(`/api/projects?${query.toString()}`, {
          auth: true,
          dataSchema: listSchema,
        });
        setPage((prev) =>
          replace || prev === null
            ? data
            : {
                projects: [...prev.projects, ...data.projects],
                nextCursor: data.nextCursor,
              },
        );
      } catch (caught) {
        setError(caught instanceof ApiError ? caught : new ApiError("INTERNAL_ERROR", {
          userMessage: "Loading the library failed.",
          message: caught instanceof Error ? caught.message : String(caught),
        }));
      } finally {
        setLoading(false);
      }
    },
    [session, status],
  );

  // refetch when the filter or session changes (deferred off the effect body
  // so the first synchronous frame does not call setState)
  useEffect(() => {
    if (session === null) return;
    const timer = window.setTimeout(() => void load(null, true), 0);
    return () => window.clearTimeout(timer);
  }, [session, status, load]);

  if (!hydrated || session === null) {
    return (
      <div className="flex min-h-screen flex-col">
        <PortalHeader current="library" />
        <main className="mx-auto w-full max-w-[1100px] flex-1 px-6 py-10">
          <Skeleton className="h-64 w-full rounded-xl" />
        </main>
      </div>
    );
  }

  const projects = page?.projects ?? [];

  return (
    <div className="flex min-h-screen flex-col">
      <PortalHeader current="library" />
      <main className="mx-auto w-full max-w-[1100px] flex-1 px-6 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-foreground text-xl font-medium tracking-tight">Project library</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {`${session.user.email}’s designs`} — opening keeps access scoped to per-project
              keys.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by status">
            {STATUS_OPTIONS.map((option) => (
              <Button
                key={option.label}
                variant={status === option.value ? "secondary" : "outline"}
                size="sm"
                aria-pressed={status === option.value}
                onClick={() => setStatus(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>

        {error !== null ? (
          <div
            role="alert"
            className="bg-destructive/10 mt-6 rounded-lg p-4"
          >
            <p className="text-destructive flex items-start gap-2 text-sm font-medium">
              <CircleAlertIcon className="mt-0.5 size-4 flex-none" aria-hidden="true" />
              {error.userMessage}
            </p>
            <p className="text-muted-foreground mt-1 font-mono text-[11px]">{error.message}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void load(null, true)}>
              Retry
            </Button>
          </div>
        ) : null}

        {page === null && !loading && error === null ? (
          <SectionSkeleton />
        ) : null}

        {projects.length === 0 && page !== null && error === null ? (
          <EmptyState />
        ) : null}

        {projects.length > 0 ? (
          <ul className="mt-6 grid gap-3 md:grid-cols-2">
            {projects.map((project) => (
              <li key={project.id}>
                <article className="bg-card border-border rounded-xl border border-solid p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-foreground min-w-0 text-sm font-semibold tracking-tight">
                      {project.idea.length > 110 ? `${project.idea.slice(0, 109)}…` : project.idea}
                    </h2>
                  </div>
                  <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                    <span className="font-mono">{STATUS_LABEL[project.status]}</span>
                    <span aria-hidden="true">·</span>
                    <span>updated {new Date(project.updatedAt).toLocaleDateString("en-US")}</span>
                    {project.currentArchitectureVersion !== null ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono">v{project.currentArchitectureVersion}</span>
                      </>
                    ) : null}
                  </div>
                  <div className="mt-3">
                    <Link href={`/projects/${project.id}/workspace`}>
                      <Button size="sm" variant="outline">
                        <ArrowUpRightIcon />
                        Open workspace
                      </Button>
                    </Link>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        ) : null}

        {page?.nextCursor !== null && page !== null ? (
          <div className="mt-6 flex justify-center">
            <Button
              variant="outline"
              disabled={loading}
              onClick={() => void load(page.nextCursor, false)}
            >
              <ChevronsDownIcon />
              {loading ? "Loading…" : "Load more"}
            </Button>
          </div>
        ) : null}
      </main>
    </div>
  );
}

function SectionSkeleton() {
  return (
    <div aria-busy="true" className="mt-6 grid gap-3 md:grid-cols-2">
      {["a", "b", "c", "d"].map((key) => (
        <Skeleton key={key} className="h-32 rounded-xl" />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="border-border bg-card mt-6 rounded-xl border border-dashed p-8 text-center">
      <h2 className="text-foreground text-base font-medium">No projects here yet</h2>
      <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
        Start a design from the landing page — every confirmed architecture
        shows up in this library for its owner.
      </p>
      <Link href="/" className="text-primary hover:underline mt-4 inline-block text-sm underline-offset-4">
        Back to the landing page
      </Link>
    </div>
  );
}

export default function Page() {
  return <LibraryContent />;
}
