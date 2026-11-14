"use client";

/**
 * Ops-only abuse/usage view. The API enforces ADMIN_EMAILS; this page is not
 * linked from public navigation. It intentionally shows account emails and
 * aggregate token usage, so keep the route off public docs and screenshots.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  AdminAbuseDataSchema,
  type AdminAbuseData,
  type DashboardRange,
} from "@sda/contracts";
import {
  ActivityIcon,
  AlertTriangleIcon,
  CoinsIcon,
  FolderKanbanIcon,
  LockIcon,
  PlayIcon,
  UsersIcon,
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
  formatTokensCompact,
  rangeLabel,
  usageBarPercent,
} from "@/lib/dashboard/format";
import { useAuthBootSettled, useHydrated, useSession } from "@/hooks/use-session";

const RANGES: DashboardRange[] = ["last_7_days", "last_30_days", "last_90_days"];

export function AdminAbuseContent() {
  const router = useRouter();
  const session = useSession();
  const hydrated = useHydrated();
  const bootSettled = useAuthBootSettled();
  const [range, setRange] = useState<DashboardRange>("last_30_days");
  const [data, setData] = useState<AdminAbuseData | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (hydrated && bootSettled && session === null) {
      router.replace("/login?next=/admin/abuse");
    }
  }, [hydrated, bootSettled, session, router]);

  useEffect(() => {
    if (session === null) return;
    const timer = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        setError(null);
        try {
          const loaded = await apiFetch(`/api/admin/abuse?range=${range}`, {
            auth: true,
            dataSchema: AdminAbuseDataSchema,
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
        <main className="mx-auto w-full max-w-[1200px] flex-1 px-6 py-10">
          <Skeleton className="h-64 w-full rounded-xl" />
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <PortalHeader current="dashboard" />
      <main className="mx-auto w-full max-w-[1200px] flex-1 px-6 py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-muted-foreground mb-2 flex items-center gap-2 font-mono text-[11px] tracking-[0.14em] uppercase">
              <LockIcon className="size-3.5" aria-hidden="true" />
              Ops / restricted
            </div>
            <h1 className="text-foreground text-2xl font-medium tracking-tight">
              Abuse &amp; usage
            </h1>
            <p className="text-muted-foreground mt-1 max-w-2xl text-sm leading-relaxed">
              Signups, runs, tokens, and failures across all accounts. Use this
              to spot a signup spike, a runaway account, or a failing generation
              queue before it becomes a support problem.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Abuse range">
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

        {loading && data === null ? (
          <div aria-busy="true" className="mt-6 grid gap-3 md:grid-cols-3">
            {["a", "b", "c", "d", "e", "f"].map((key) => (
              <Skeleton key={key} className="h-28 rounded-xl" />
            ))}
          </div>
        ) : null}

        {error !== null ? (
          <div
            role="alert"
            className="border-border bg-card mt-6 rounded-xl border border-solid p-6"
          >
            <p className="text-foreground flex items-center gap-2 text-sm font-medium">
              <LockIcon className="size-4" aria-hidden="true" />
              {error.code === "ADMIN_ACCESS_DENIED"
                ? "Admin access required"
                : error.userMessage}
            </p>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
              {error.code === "ADMIN_ACCESS_DENIED"
                ? "Add this account's email to ADMIN_EMAILS on the server, then reload."
                : USER_MESSAGES[error.code]}
            </p>
            <Link
              href="/dashboard"
              className="text-primary mt-4 inline-block text-sm underline-offset-4 hover:underline"
            >
              Back to dashboard
            </Link>
          </div>
        ) : null}

        {data !== null ? (
          <div className="mt-6 grid min-w-0 gap-4">
            <section
              aria-label="Abuse totals"
              className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3"
            >
              <TotalCard
                icon={<UsersIcon className="size-4" />}
                label="Total users"
                value={String(data.totals.totalUsers)}
                sub={`${data.totals.newUsers} new in this window`}
              />
              <TotalCard
                icon={<FolderKanbanIcon className="size-4" />}
                label="New projects"
                value={String(data.totals.newProjects)}
                sub="created in this window"
              />
              <TotalCard
                icon={<PlayIcon className="size-4" />}
                label="Runs"
                value={String(data.totals.runs)}
                sub="requirements + architecture"
              />
              <TotalCard
                icon={<CoinsIcon className="size-4" />}
                label="Tokens"
                value={formatTokensCompact(data.totals.tokens)}
                sub="provider usage in this window"
              />
              <TotalCard
                icon={<AlertTriangleIcon className="size-4" />}
                label="Failures"
                value={String(data.totals.failures)}
                sub="failed or interrupted runs"
              />
              <TotalCard
                icon={<ActivityIcon className="size-4" />}
                label="Active runs"
                value={String(data.totals.activeRuns)}
                sub="queued + running right now"
              />
            </section>

            <div className="grid min-w-0 gap-4 lg:grid-cols-2">
              <BucketChart
                buckets={data.buckets}
                metric="newUsers"
                label="New users / day"
                format={(value) => String(value)}
              />
              <BucketChart
                buckets={data.buckets}
                metric="runs"
                label="Runs / day"
                format={(value) => String(value)}
              />
              <BucketChart
                buckets={data.buckets}
                metric="tokens"
                label="Tokens / day"
                format={(value) => formatTokensCompact(value)}
              />
              <BucketChart
                buckets={data.buckets}
                metric="failures"
                label="Failures / day"
                format={(value) => String(value)}
              />
            </div>

            <section className="bg-card border-border min-w-0 overflow-hidden rounded-xl border border-solid">
              <div className="border-border/60 flex items-center justify-between gap-3 border-b border-solid px-4 py-3">
                <h2 className="text-foreground text-sm font-semibold tracking-tight">
                  Top accounts by tokens
                </h2>
                <span className="text-muted-foreground font-mono text-[10px] tracking-[0.12em] uppercase">
                  {rangeLabel(data.range)}
                </span>
              </div>
              {data.topUsers.length === 0 ? (
                <p className="text-muted-foreground px-4 py-4 text-xs italic">
                  No owned runs in this window.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead className="text-right">Runs</TableHead>
                      <TableHead className="text-right">Tokens</TableHead>
                      <TableHead>Last run</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.topUsers.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="text-foreground max-w-[320px] truncate font-mono text-[11px]">
                          {user.email}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {user.planTier}
                        </TableCell>
                        <TableCell className="text-right text-xs">{user.runs}</TableCell>
                        <TableCell className="text-right text-xs">
                          {formatTokensCompact(user.tokens)}
                        </TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap text-[11px]">
                          {user.lastRunAt
                            ? new Date(user.lastRunAt).toLocaleString("en-US", {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </section>

            <p className="text-muted-foreground pb-4 text-[11px] leading-relaxed">
              Snapshot generated {new Date(data.generatedAt).toLocaleTimeString("en-US")}.
              This view contains account emails; do not expose it in public
              screenshots, shared links, or analytics exports.
            </p>
          </div>
        ) : null}
      </main>
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
      <p className="text-muted-foreground flex items-center gap-2 text-[11px]">
        {icon}
        {label}
      </p>
      <p className="text-foreground mt-2 text-2xl font-semibold tracking-tight">
        {value}
      </p>
      <p className="text-muted-foreground mt-1 text-[11px]">{sub}</p>
    </div>
  );
}

type BucketMetric = "newUsers" | "newProjects" | "runs" | "tokens" | "failures";

function BucketChart({
  buckets,
  metric,
  label,
  format,
}: {
  buckets: AdminAbuseData["buckets"];
  metric: BucketMetric;
  label: string;
  format: (value: number) => string;
}) {
  const max = Math.max(1, ...buckets.map((bucket) => bucket[metric]));
  const start = buckets[0]?.periodStart;
  const end = buckets.at(-1)?.periodEnd;
  return (
    <section className="bg-card border-border min-w-0 rounded-xl border border-solid p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-foreground text-sm font-semibold tracking-tight">
          {label}
        </h2>
        <span className="text-muted-foreground font-mono text-[10px]">
          max {format(max)}
        </span>
      </div>
      <ul
        aria-label={label}
        className="border-border/60 mt-3 flex h-36 items-end gap-[3px] border-b border-solid"
      >
        {buckets.map((bucket) => (
          <li
            key={bucket.periodStart}
            className="bg-muted/50 flex h-full min-w-0 flex-1 items-end rounded-t-[2px]"
          >
            <span
              role="img"
              aria-label={`${new Date(bucket.periodStart).toLocaleDateString("en-US", { month: "short", day: "numeric" })}: ${format(bucket[metric])}`}
              title={`${new Date(bucket.periodStart).toLocaleDateString("en-US", { month: "short", day: "numeric" })}: ${format(bucket[metric])}`}
              className="bg-primary block w-full rounded-t-[2px]"
              style={{
                height: `${usageBarPercent(bucket[metric], max)}%`,
                minHeight: bucket[metric] > 0 ? 2 : 0,
              }}
            />
          </li>
        ))}
      </ul>
      <div className="text-muted-foreground mt-1 flex justify-between font-mono text-[10px]">
        <span>
          {start
            ? new Date(start).toLocaleDateString("en-US", { month: "short", day: "numeric" })
            : "—"}
        </span>
        <span>
          {end
            ? new Date(end).toLocaleDateString("en-US", { month: "short", day: "numeric" })
            : "—"}
        </span>
      </div>
    </section>
  );
}

export default function Page() {
  return <AdminAbuseContent />;
}
