"use client";

/**
 * Full-page shell for the interim product states (idea → specification →
 * architecture → workspace). One shared composition — a quiet dotted-field
 * backdrop, a four-step journey map with status semantics (shape + color +
 * sr-only text), and one focused card for the state's body — replaces the
 * scattered small cards. Motion reuses the app's fade-up vocabulary (killed
 * by the global reduced-motion switch).
 */
import { CheckIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "cn";

export type JourneyStage =
  | "idea"
  | "specification"
  | "architecture"
  | "workspace";

const STAGES: Array<{ id: JourneyStage; label: string }> = [
  { id: "idea", label: "Idea" },
  { id: "specification", label: "Specification" },
  { id: "architecture", label: "Architecture" },
  { id: "workspace", label: "Workspace" },
];

export function JourneyShell({
  stage,
  title,
  lead,
  tone = "normal",
  fill = true,
  children,
}: {
  /** The currently emphasized stage; earlier steps render as done. */
  stage: JourneyStage;
  title: ReactNode;
  lead?: ReactNode;
  /** "error" mutes the map (no current-step pulse); "loading" renders it dimmed. */
  tone?: "normal" | "error" | "loading";
  /** Fill the viewport height (pages) or size to content (modals/overlays). */
  fill?: boolean;
  children?: ReactNode;
}) {
  const muted = tone !== "normal";
  const currentIndex = STAGES.findIndex((s) => s.id === stage);
  return (
    <div
      className={cn(
        "relative flex w-full flex-col items-center justify-center py-8",
        fill && "min-h-[calc(100dvh-11rem)]",
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 opacity-40 [background-image:radial-gradient(var(--border)_1px,transparent_1px)] [background-size:26px_26px] [mask-image:radial-gradient(65%_60%_at_50%_30%,black,transparent)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-80 bg-[radial-gradient(55%_60%_at_50%_0%,var(--primary),transparent_75%)] opacity-[0.06]"
      />

      <div className="w-full max-w-[860px]">
        <ol
          aria-label="Design journey"
          className="flex w-full items-start"
        >
          {STAGES.map((s, index) => {
            const state =
              muted
                ? index <= currentIndex && tone === "loading"
                  ? "dimmed"
                  : "ahead"
                : index < currentIndex
                  ? "done"
                  : index === currentIndex
                    ? "current"
                    : "ahead";
            return (
              <li
                key={s.id}
                className={cn(
                  "flex min-w-0 items-start",
                  index < STAGES.length - 1 && "flex-1",
                )}
              >
                <span className="flex flex-none flex-col items-center gap-1.5">
                  <span
                    className={cn(
                      "flex size-7 items-center justify-center rounded-full border transition-colors",
                      state === "done" && "border-primary bg-primary text-primary-foreground",
                      state === "current" &&
                        "border-primary bg-primary/15 text-primary ring-ring/35 ring-2 ring-offset-2 ring-offset-background",
                      (state === "ahead" || state === "dimmed") && "border-border",
                    )}
                  >
                    {state === "done" ? (
                      <CheckIcon className="size-3.5" aria-hidden="true" />
                    ) : state === "current" ? (
                      <span className="bg-primary size-1.5 rounded-full" aria-hidden="true" />
                    ) : null}
                  </span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "text-[11px] font-medium",
                      state === "current" && !muted
                        ? "text-primary"
                        : state === "done"
                          ? "text-foreground/80"
                          : "text-muted-foreground",
                    )}
                  >
                    {s.label}
                  </span>
                  <span className="sr-only">
                    {state === "done"
                      ? `${s.label}, done`
                      : state === "current" && !muted
                        ? `Current step: ${s.label}`
                        : state === "dimmed"
                          ? `${s.label}, loading`
                          : `${s.label}, not started`}
                  </span>
                </span>
                {index < STAGES.length - 1 ? (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mx-2 mt-3.5 h-px flex-1",
                      index < currentIndex && !muted ? "bg-primary/50" : "bg-border",
                    )}
                  />
                ) : null}
              </li>
            );
          })}
        </ol>

        <div className="bg-card border-border mt-5 w-full animate-fade-up rounded-2xl border border-solid shadow-sm">
          <div className="p-6 sm:p-8">
            <h2 className="text-foreground text-balance text-xl font-medium tracking-tight">
              {title}
            </h2>
            {lead !== undefined && lead !== null ? (
              <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{lead}</p>
            ) : null}
            {children !== undefined && children !== null ? (
              <div className={cn(lead !== undefined ? "mt-6" : "mt-5")}>{children}</div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
