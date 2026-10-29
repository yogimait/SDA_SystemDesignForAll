"use client";

/**
 * Analytics dashboard (user-auth round): usage totals, token usage buckets,
 * top models, recent runs, and range selection — everything renders from
 * `DashboardDataSchema` only. Plan-gate errors show the upgrade message.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  DashboardDataSchema,
  type DashboardData,
  type DashboardRange,
} from "@sda/contracts";
import {
  DatabaseIcon,
  GaugeIcon,
  ListChecksIcon,
  LockIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PortalHeader } from "@/components/portal/portal-header";
import { apiFetch, ApiError, USER_MESSAGES } from "@/lib/api/client";
import {
  bucketLabelStep,
  bucketTickIndices,
  formatTokensCompact,
  rangeLabel,
  sortRunsNewestFirst,
  usageBarPercent,
} from "@/lib/dashboard/format";
import { useHydrated, useSession } from "@/hooks/use-session";
import type { RunStatus } from "@sda/contracts";

/** Status label color; status is always spelled out — color never alone. */
const STATUS_CLASS: Record<RunStatus, string> = {
  queued: "text-muted-foreground",
  running: "text-foreground",
  succeeded: "text-success",
  failed: "text-destructive",
  interrupted: "text-muted-foreground",
};

const RANGES: DashboardRange[] = ["last_7_days", "last_30_days", "last_90_days"];

export function DashboardContent() {
  const router = useRouter();
  const session = useSession();
  const [range, setRange] = useState<DashboardRange>("last_30_days");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  // Hold route-guard redirects until hydrated: during the hydration commit
  // the session still reads as the server snapshot (null).
  const hydrated = useHydrated();
  useEffect(() => {
    if (hydrated && session === null) {
      router.replace("/login?next=/dashboard");
    }
  }, [hydrated, session, router]);

  useEffect(() => {
    if (session === null) return;
    const timer = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        setError(null);
        try {
          // Backend mounts analytics at /api/dashboard (not /users/me/…);
          // provider-config/preferences are likewise available under /users/me.
          const loaded = await apiFetch(`/api/dashboard?range=${range}`, {
            auth: true,
            dataSchema: DashboardDataSchema,
          });
          setData(loaded);
        } catch (caught) {
          setError(caught instanceof ApiError ? caught : null);
        } finally {
          setLoading(false);
        }
      })();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [session, range]);

  if (!hydrated || session === null) {
    return (
      <div className="flex min-h-screen flex-col">
        <PortalHeader current="dashboard" />
        <main className="mx-auto w-full max-w-[1100px] flex-1 px-6 py-10">
          <Skeleton className="h-64 w-full rounded-xl" />
        </main>
      </div>
    );
  }

  const planBlocked =
    error !== null &&
    (error.code === "PLAN_LIMIT_EXCEEDED" || error.code === "PLAN_UPGRADE_REQUIRED");

  return (
    <div className="flex min-h-screen flex-col">
      <PortalHeader current="dashboard" />
      <main className="mx-auto w-full max-w-[1100px] flex-1 px-6 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-foreground text-xl font-medium tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Model usage and run activity for your account.
            </p>
          </div>
          {/* Subtle busy state while a range switch refetches over the
              previous content — live data is never swapped for skeletons
              (QA D3). */}
          <div className="flex flex-wrap items-center justify-end gap-3">
            <span
              role="status"
              className={loading && data !== null ? "text-muted-foreground font-mono text-[11px]" : "sr-only"}
            >
              Updating…
            </span>
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Dashboard range">
              {RANGES.map((option) => (
                <Button
                  key={option}
                  variant={range === option ? "secondary" : "outline"}
                  size="sm"
                  aria-pressed={range === option}
                  onClick={() => setRange(option)}
                >
                  {rangeLabel(option)}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {loading && data === null ? (
          <div aria-busy="true" className="mt-6 grid gap-3 md:grid-cols-2">
            {["a", "b", "c", "d"].map((key) => (
              <Skeleton key={key} className="h-36 rounded-xl" />
            ))}
          </div>
        ) : null}

        {planBlocked ? (
          <PlanGateCard code={error!.code as import("@sda/contracts").ErrorCode} />
        ) : null}

        {!loading && error !== null && !planBlocked ? (
          <div role="alert" className="bg-destructive/10 mt-6 rounded-lg p-4">
            <p className="text-destructive text-sm font-medium">{error.userMessage}</p>
            <p className="text-muted-foreground mt-1 font-mono text-[11px]">{error.message}</p>
            {error.code === "AUTH_REQUIRED" ? (
              <Link href="/login?next=/dashboard" className="text-primary hover:underline mt-3 inline-block text-sm underline-offset-4">
                Sign in again
              </Link>
            ) : null}
          </div>
        ) : null}

        {!loading && error === null && data === null ? (
          <div aria-busy="true" className="mt-6 grid gap-3 md:grid-cols-2">
            <Skeleton className="h-36 rounded-xl" />
            <Skeleton className="h-36 rounded-xl" />
            <Skeleton className="h-36 rounded-xl" />
            <Skeleton className="h-36 rounded-xl" />
          </div>
        ) : null}

        {data !== null ? (
          <div aria-busy={loading || undefined}>
            <DashboardBody data={data} />
          </div>
        ) : null}
      </main>
    </div>
  );
}

function DashboardBody({ data }: { data: DashboardData }) {
  const empty = data.usage.runCount === 0 && data.topModels.length === 0;

  if (empty) {
    return (
      <div className="border-border bg-card mt-6 rounded-xl border border-dashed p-8 text-center">
        <h2 className="text-foreground text-base font-medium">Nothing measured yet</h2>
        <p className="text-muted-foreground mx-auto mt-2 max-w-[46ch] text-sm leading-relaxed">
          Generate an architecture from a confirmed specification and the runs,
          tokens, and models used appear here. Tips: telemetry covers provider
          runs only (mock or real), bucketed by {rangeLabel(data.range).toLowerCase()}.
        </p>
        <Link href="/" className="text-primary hover:underline mt-4 inline-block text-sm underline-offset-4">
          Start a design
        </Link>
      </div>
    );
  }

  const perModelMax = Math.max(1, ...data.topModels.map((model) => model.totalTokens));

  return (
    <div className="mt-6 grid min-w-0 gap-3">
      <section
        aria-label="Usage totals"
        className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        <TotalCard
          icon={<ListChecksIcon className="size-4" />}
          label="Runs"
          value={String(data.usage.runCount)}
          sub="architecture + requirements runs"
        />
        <TotalCard
          icon={<GaugeIcon className="size-4" />}
          label="Tokens"
          value={formatTokensCompact(data.usage.totalTokens)}
          sub={`prompt ${formatTokensCompact(data.usage.promptTokens)} · completion ${formatTokensCompact(data.usage.completionTokens)}`}
        />
        <TotalCard
          icon={<DatabaseIcon className="size-4" aria-hidden="true" />}
          label={`Projects · ${rangeLabel(data.range).toLowerCase()}`}
          value={String(data.usage.projectCount)}
          sub="projects with provider runs in this window"
        />
      </section>

      <section aria-label="Usage over time" className="bg-card border-border min-w-0 rounded-xl border border-solid p-4">
        <h2 className="text-foreground text-sm font-semibold tracking-tight">Token usage over time</h2>
        {data.buckets.length === 0 ? (
          <p className="text-muted-foreground mt-2 text-xs italic">No bucketed activity in this window.</p>
        ) : (
          <UsageBuckets buckets={data.buckets} />
        )}
      </section>

      <section aria-label="Top models" className="bg-card border-border min-w-0 rounded-xl border border-solid p-4">
        <h2 className="text-foreground text-sm font-semibold tracking-tight">Top models</h2>
        {data.topModels.length === 0 ? (
          <p className="text-muted-foreground mt-2 text-xs italic">No model usage recorded in this window.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {data.topModels.map((model) => (
              <li key={`${model.provider}·${model.model}`} className="flex items-center gap-3">
                <span className="text-foreground w-56 max-w-[38%] truncate font-mono text-[11px]" title={model.model}>
                  {model.model} <span className="text-muted-foreground">· {model.provider}</span>
                </span>
                <span className="bg-muted h-2.5 min-w-0 flex-1 overflow-hidden rounded-full">
                  <span
                    className="bg-primary block h-2.5 rounded-full"
                    style={{ width: `${usageBarPercent(model.totalTokens, perModelMax)}%` }}
                    aria-hidden="true"
                  />
                </span>
                <span className="text-muted-foreground flex-none whitespace-nowrap font-mono text-[10px]">
                  {formatTokensCompact(model.totalTokens)} tok · {model.runCount} runs
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Recent runs" className="bg-card border-border min-w-0 overflow-hidden rounded-xl border border-solid">
        <h2 className="text-foreground border-border/60 border-b border-solid px-4 py-2.5 text-sm font-semibold tracking-tight">
          Recent runs
        </h2>
        {data.recentRuns.length === 0 ? (
          <p className="text-muted-foreground px-4 pb-4 text-xs italic">No runs recorded in this window.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Started</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortRunsNewestFirst(data.recentRuns).map((run) => (
                <TableRow key={run.id}>
                  <TableCell className="text-muted-foreground text-xs">{run.type}</TableCell>
                  <TableCell className={`text-xs ${STATUS_CLASS[run.status]}`}>{run.status}</TableCell>
                  <TableCell className="text-muted-foreground max-w-[180px] truncate font-mono text-[11px]" title={`${run.provider} · ${run.model}`}>
                    {run.model}
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap text-[11px]">
                    {new Date(run.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <p className="text-muted-foreground pb-4 text-[11px] leading-relaxed">
        Snapshot generated {new Date(data.generatedAt).toLocaleTimeString("en-US")}.
        Usage covers provider calls only. An architecture run makes two provider
        calls (HLD, then LLD/DSA synthesis); a requirements run makes one.
      </p>
    </div>
  );
}

/**
 * Vertical bar chart of daily token usage, CSS only: one column per bucket,
 * height proportional to the bucket's total tokens, date ticks at
 * bucketLabelStep intervals anchored to both ends, each bar readable via
 * role="img" + aria-label.
 */
function UsageBuckets({
  buckets,
}: {
  buckets: import("@sda/contracts").DashboardData["buckets"];
}) {
  const max = Math.max(1, ...buckets.map((bucket) => bucket.totalTokens));
  const step = bucketLabelStep(buckets.length);
  const tickIndices = bucketTickIndices(buckets.length, step);
  const tickFormatter = (index: number) =>
    new Date(buckets[index].periodStart).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  return (
    <div className="mt-3">
      <div
        aria-hidden="true"
        className="bg-muted/40 text-muted-foreground mb-1 text-right font-mono text-[10px]"
      >
        max {formatTokensCompact(max)} tokens
      </div>
      <ul
        aria-label="Token usage per day"
        className="border-border/60 flex h-40 items-end gap-[3px] border-b border-solid"
      >
        {buckets.map((bucket, index) => {
          const short = tickFormatter(index);
          const tokens = formatTokensCompact(bucket.totalTokens);
          return (
            <li
              key={bucket.periodStart}
              className="bg-muted/50 flex h-full min-w-0 flex-1 items-end rounded-t-[2px]"
            >
              <span
                role="img"
                aria-label={`${short}: ${tokens} tokens`}
                title={`${short} — ${tokens} tokens`}
                className="bg-primary block w-full rounded-t-[2px] transition-[height] duration-200"
                style={{
                  height: `${usageBarPercent(bucket.totalTokens, max)}%`,
                  minHeight: bucket.totalTokens > 0 ? 2 : 0,
                }}
              />
            </li>
          );
        })}
      </ul>
      {/* Tick labels span their interval (edge-anchored, evenly spread) so
          they never get clipped by a narrow flex column (QA D4). */}
      <ul
        aria-hidden="true"
        className="text-muted-foreground mt-1 flex justify-between font-mono text-[10px]"
      >
        {tickIndices.map((index) => (
          <li
            key={buckets[index].periodStart}
            className="whitespace-nowrap"
          >
            {tickFormatter(index)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function TotalCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="bg-card border-border rounded-xl border border-solid p-4">
      <p className="text-muted-foreground flex items-center gap-2 text-[11px] uppercase">
        {icon}
        {label}
      </p>
      <p className="text-foreground mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="text-muted-foreground mt-1 text-[11px]">{sub}</p>
    </div>
  );
}

  /** Plan-gated messaging card for PLAN_LIMIT_EXCEEDED / PLAN_UPGRADE_REQUIRED. */
function PlanGateCard({ code }: { code: import("@sda/contracts").ErrorCode }) {
  return (
    <div role="alert" className="border-primary/40 bg-primary/10 mt-6 rounded-xl border border-dashed p-6">
      <p className="text-foreground flex items-center gap-2 text-sm font-medium">
        <LockIcon className="text-primary size-4" aria-hidden="true" />
        Plan-gated data
      </p>
      <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{USER_MESSAGES[code]}</p>
      <p className="text-muted-foreground mt-1 font-mono text-[11px]">code: {code}</p>
      <Button
        variant="outline"
        size="sm"
        className="mt-4"
        tabIndex={-1}
        aria-disabled="true"
        onClick={(event: React.MouseEvent<HTMLButtonElement>) => event.preventDefault()}
      >
        Upgrade to Pro (backend pending)
      </Button>
    </div>
  );
}

export default function Page() {
  return <DashboardContent />;
}
