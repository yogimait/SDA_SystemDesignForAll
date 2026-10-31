"use client";

/**
 * Hero product preview (Stitch Coffee reference): a window frame with three
 * static illustrative views. The LLD/HLD/DSA switches are real preview tabs,
 * not workspace controls, so every panel is labelled as a static sample and
 * nothing here reads the user's model.
 */
import { useState } from "react";
import { MaximizeIcon, MinusIcon, PlusIcon } from "lucide-react";
import { cn } from "cn";

const VIEWS = ["LLD", "HLD", "DSA"] as const;
type View = (typeof VIEWS)[number];

export function SamplePreview() {
  const [view, setView] = useState<View>("LLD");

  return (
    <div className="relative">
      {/* Handwritten annotation, as in the reference (desktop only). */}
      <div
        className="text-primary font-hand pointer-events-none absolute -top-9 right-4 z-20 hidden select-none items-center gap-2 text-2xl md:flex"
        data-slot="sample-annotation"
      >
        <span className="-rotate-6 text-right leading-tight">
          Interactive diagrams with
          <br />
          explanations
        </span>
        <svg
          className="h-10 w-10 -rotate-12 translate-y-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          viewBox="0 0 50 50"
          aria-hidden="true"
        >
          <path d="M 40 10 Q 25 30 10 32" strokeLinecap="round" />
          <path d="M 18 25 L 10 32 L 15 40" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <div
        data-slot="sample-preview"
        className="coffee-dot-grid border-border bg-card overflow-hidden rounded-2xl border border-solid shadow-2xl"
        role="group"
        aria-label="Sample workspace preview (static illustration)"
      >
        <p className="sr-only">
          Static illustration of the three workspace views. It is not your model.
        </p>

        {/* Window chrome: traffic lights + segmented view switch. */}
        <div className="bg-popover/80 border-border flex items-center justify-between border-b border-solid px-4 py-3">
          <div className="flex items-center gap-2" aria-hidden="true">
            <span className="size-2.5 rounded-full bg-red-500/70" />
            <span className="size-2.5 rounded-full bg-yellow-500/70" />
            <span className="size-2.5 rounded-full bg-green-500/70" />
          </div>
          <div className="bg-background border-border/80 inline-flex rounded-lg border border-solid p-0.5">
            {VIEWS.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={view === option}
                onClick={() => setView(option)}
                className={cn(
                  "min-h-11 rounded px-3 py-1 font-landing-mono text-xs transition-colors sm:min-h-8",
                  view === option
                    ? "bg-popover text-primary font-semibold shadow-xs"
                    : "text-muted-foreground hover:text-secondary-foreground",
                )}
              >
                {option}
              </button>
            ))}
          </div>
          <div className="w-12" aria-hidden="true" />
        </div>

        <div className="relative flex min-h-[380px] flex-col justify-between p-5 sm:min-h-[460px] sm:p-6">
          {view === "LLD" ? <LldSample /> : null}
          {view === "HLD" ? <HldSample /> : null}
          {view === "DSA" ? <DsaSample /> : null}

          {/* Reference-style zoom cluster: illustrative, never interactive. */}
          <div
            className="bg-background/90 border-border relative z-10 mt-4 flex items-center gap-1 self-end rounded-lg border border-solid p-1 shadow-md"
            aria-hidden="true"
          >
            <span className="text-secondary-foreground hover:bg-popover rounded p-1 transition-colors">
              <PlusIcon className="size-4" />
            </span>
            <span className="text-secondary-foreground hover:bg-popover rounded p-1 transition-colors">
              <MinusIcon className="size-4" />
            </span>
            <span className="text-secondary-foreground hover:bg-popover rounded p-1 transition-colors">
              <MaximizeIcon className="size-4" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function LldSample() {
  return (
    <div className="relative z-10 grid grid-cols-1 gap-5 md:grid-cols-2">
      <div className="bg-background/95 border-border font-landing-mono space-y-2 rounded-xl border border-solid p-3.5 text-xs shadow-lg">
        <div className="text-foreground border-border flex items-center justify-between border-b border-solid pb-1.5 font-bold">
          <span>RateLimiter</span>
          <span className="text-muted-foreground text-[10px]">class</span>
        </div>
        <div className="text-muted-foreground space-y-1 text-[11px]">
          <div>- windowSeconds: number</div>
          <div>- maxRequests: number</div>
          <div>- store: TokenBucket</div>
        </div>
        <div className="text-foreground border-border/60 space-y-1 border-t border-solid pt-2 text-[11px]">
          <div>+ allow(key: string): boolean</div>
          <div>+ getRateLimitInfo(key: string)</div>
        </div>
      </div>

      <div className="bg-background/95 border-border font-landing-mono space-y-2 rounded-xl border border-solid p-3.5 text-xs shadow-lg">
        <div className="text-foreground border-border flex flex-col border-b border-solid pb-1.5 font-bold">
          <span className="text-primary text-[10px] font-normal italic">
            &lt;interface&gt;
          </span>
          <span>RateLimitStore</span>
        </div>
        <div className="text-muted-foreground space-y-1 text-[11px]">
          <div>+ get(key: string)</div>
          <div>+ set(key: string)</div>
          <div>+ increment(key: string)</div>
        </div>
      </div>

      <div className="bg-popover/90 border-primary/40 space-y-1.5 rounded-xl border border-solid p-3.5 shadow-lg">
        <div className="flex items-center gap-1.5">
          <span className="bg-primary size-1.5 rounded-full" />
          <span className="text-primary font-heading text-xs font-semibold">
            Strategy Pattern
          </span>
        </div>
        <p className="text-muted-foreground text-[11px] leading-snug">
          Used to support different rate limiting algorithms (e.g. Token Bucket,
          Fixed Window, Leaky Bucket).
        </p>
      </div>

      <div className="bg-background/95 border-border font-landing-mono space-y-2 rounded-xl border border-solid p-3.5 text-xs shadow-lg">
        <div className="text-foreground border-border flex items-center justify-between border-b border-solid pb-1.5 font-bold">
          <span>TokenBucket</span>
          <span className="text-muted-foreground text-[10px]">class</span>
        </div>
        <div className="text-muted-foreground space-y-1 text-[11px]">
          <div>- capacity: number</div>
          <div>- tokens: number</div>
          <div>- lastRefill: Date</div>
        </div>
        <div className="text-foreground border-border/60 space-y-1 border-t border-solid pt-2 text-[11px]">
          <div>+ consume(): boolean</div>
          <div>+ refill(): void</div>
        </div>
      </div>

      <svg
        className="pointer-events-none absolute inset-0 z-0 h-full w-full opacity-40"
        fill="none"
        stroke="var(--primary)"
        strokeDasharray="4 4"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        <path d="M 230 110 L 265 110" />
        <path d="M 120 180 L 120 250" />
        <path d="M 265 240 L 210 240" />
      </svg>
    </div>
  );
}

function HldSample() {
  return (
    <div className="font-landing-mono relative z-10 flex flex-col items-center gap-2 text-[10px]">
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
          Design Service
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

function DsaSample() {
  return (
    <div className="font-landing relative z-10 space-y-2 text-xs">
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
        R-Tree (range queries), QuadTree (spatial partitioning).
      </div>
    </div>
  );
}
