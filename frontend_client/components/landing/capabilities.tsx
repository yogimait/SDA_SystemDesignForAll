import Link from "next/link";
import { ArrowRightIcon, BoxIcon, GlobeIcon, LayersIcon } from "lucide-react";

const CAPABILITIES = [
  {
    tag: "LLD",
    title: "Interactive UML class diagram",
    body: "Classes, methods, relations and patterns.",
    icon: BoxIcon,
    tint: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
  },
  {
    tag: "HLD",
    title: "System architecture walkthrough",
    body: "Components, flows, scaling and failure modes.",
    icon: GlobeIcon,
    tint: "bg-sky-500/10 border-sky-500/30 text-sky-400",
  },
  {
    tag: "DSA",
    title: "Operation-focused analysis",
    body: "Structures, algorithms and trade-offs.",
    icon: LayersIcon,
    tint: "bg-indigo-500/10 border-indigo-500/30 text-indigo-400",
  },
] as const;

/** "What you get": three pillars, each with a static miniature of its view.
 *  The miniatures are illustrative (no model data) and marked `data-slot` so
 *  they stay out of the page's readable copy budget. */
export function Capabilities() {
  return (
    <section
      id="examples"
      className="border-border/60 bg-background border-t border-solid py-20"
    >
      <div className="mx-auto w-full max-w-7xl space-y-12 px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <h2 className="text-foreground font-heading text-3xl font-bold tracking-tight sm:text-4xl md:text-[2.5rem]">
              What you get
            </h2>
            <p className="text-muted-foreground mt-2 max-w-2xl text-sm sm:text-base">
              A complete, structured breakdown with explanations and
              trade-offs.
            </p>
          </div>
          <div>
            <Link
              href="#idea-capture"
              className="text-primary hover:text-primary-hover inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
            >
              <span>See example</span>
              <ArrowRightIcon className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.07fr_1fr_0.93fr]">
          {CAPABILITIES.map((capability) => {
            const Icon = capability.icon;
            return (
              <article
                key={capability.tag}
                className="border-border bg-card hover:border-primary/50 flex flex-col justify-between rounded-2xl border border-solid p-6 shadow-md transition-colors"
              >
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex size-8 items-center justify-center rounded-lg border border-solid ${capability.tint}`}
                    >
                      <Icon className="size-4" aria-hidden="true" />
                    </div>
                    <span className="text-primary font-landing-mono text-xs font-semibold tracking-wider uppercase">
                      {capability.tag}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-foreground font-heading text-lg font-semibold">
                      {capability.title}
                    </h3>
                    <p className="text-muted-foreground mt-1 text-xs leading-relaxed sm:text-sm">
                      {capability.body}
                    </p>
                  </div>
                  <div className="pt-2" data-slot="capability-preview">
                    {capability.tag === "LLD" ? <LldMini /> : null}
                    {capability.tag === "HLD" ? <HldMini /> : null}
                    {capability.tag === "DSA" ? <DsaMini /> : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function LldMini() {
  return (
    <div className="bg-background border-border/80 font-landing-mono space-y-3 rounded-xl border border-solid p-3 text-[11px]">
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-popover border-border space-y-1 rounded-lg border border-solid p-2">
          <div className="text-foreground border-border/60 border-b border-solid pb-1 font-bold">
            User
          </div>
          <div className="text-muted-foreground space-y-0.5 text-[10px]">
            <div>- id: string</div>
            <div>- name: string</div>
            <div>- email: string</div>
          </div>
          <div className="text-foreground border-border/40 border-t border-solid pt-1 text-[10px]">
            <div>+ getProfile()</div>
            <div>+ updateProfile()</div>
          </div>
        </div>
        <div className="bg-popover border-border space-y-1 rounded-lg border border-solid p-2">
          <div className="text-foreground border-border/60 border-b border-solid pb-1 font-bold">
            Playlist
          </div>
          <div className="text-muted-foreground space-y-0.5 text-[10px]">
            <div>- id: string</div>
            <div>- name: string</div>
            <div>- songs: List</div>
          </div>
          <div className="text-foreground border-border/40 border-t border-solid pt-1 text-[10px]">
            <div>+ addSong()</div>
            <div>+ removeSong()</div>
          </div>
        </div>
      </div>
      <div className="text-muted-foreground flex items-center justify-center gap-2 text-[10px]">
        <span>1</span>
        <span className="bg-border h-px flex-1" />
        <span>1..*</span>
      </div>
    </div>
  );
}

function HldMini() {
  return (
    <div className="bg-background border-border/80 font-landing-mono flex flex-col items-center gap-2 rounded-xl border border-solid p-3 text-[10px]">
      <div className="bg-popover border-border text-foreground rounded-md border border-solid px-4 py-1 font-semibold">
        Client
      </div>
      <div className="bg-primary h-2.5 w-px" />
      <div className="bg-popover border-border text-primary rounded-md border border-solid px-4 py-1">
        Load Balancer
      </div>
      <div className="bg-primary h-2.5 w-px" />
      <div className="grid w-full grid-cols-3 gap-1.5 text-center">
        <div className="bg-popover border-border/80 text-muted-foreground rounded border border-solid p-1 text-[9px]">
          Auth Service
        </div>
        <div className="bg-popover border-border/80 text-muted-foreground rounded border border-solid p-1 text-[9px]">
          User Service
        </div>
        <div className="bg-popover border-border/80 text-muted-foreground rounded border border-solid p-1 text-[9px]">
          Playlist Service
        </div>
      </div>
      <div className="text-muted-foreground flex w-full justify-around">
        <span>↓</span>
        <span>↓</span>
        <span>↓</span>
      </div>
      <div className="grid w-full grid-cols-3 gap-1.5 text-center">
        <div className="bg-card border-border text-foreground rounded border border-solid p-1 text-[9px] font-medium">
          PostgreSQL
        </div>
        <div className="bg-card border-border text-foreground rounded border border-solid p-1 text-[9px] font-medium">
          Redis
        </div>
        <div className="bg-card border-border text-foreground rounded border border-solid p-1 text-[9px] font-medium">
          Message Queue
        </div>
      </div>
    </div>
  );
}

function DsaMini() {
  return (
    <div className="bg-background border-border/80 space-y-2 rounded-xl border border-solid p-3.5 text-xs">
      <div className="text-foreground border-border/60 font-heading border-b border-solid pb-1 text-xs font-semibold">
        Find nearest users
      </div>
      <div className="font-landing-mono space-y-1 text-[11px]">
        <div className="flex justify-between gap-3">
          <span className="text-muted-foreground">Data Structure:</span>
          <span className="text-foreground font-medium">Geohash + HashMap</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-muted-foreground">Time Complexity:</span>
          <span className="text-success font-medium">O(1) lookup</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-muted-foreground">Space Complexity:</span>
          <span className="text-primary font-medium">O(n)</span>
        </div>
      </div>
      <div className="text-muted-foreground border-border/40 border-t border-solid pt-1.5 text-[10px] leading-snug">
        <span className="text-foreground font-medium">Why:</span> Efficient
        geo-based lookup for nearby users without bounding box overhead.
      </div>
      <div className="text-muted-foreground pt-1 text-[10px]">
        <span className="text-secondary-foreground font-medium">Alternatives:</span>{" "}
        R-Tree (better for range queries), QuadTree (spatial partitioning).
      </div>
    </div>
  );
}
