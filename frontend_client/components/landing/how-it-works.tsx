"use client";

/**
 * "How it works" (Stitch Coffee reference): four pipeline steps joined by a
 * dashed rail. The control/verification detail from the previous landing stays
 * as one collapsed disclosure so the honest BYOK/export facts are still one
 * click away without adding copy to the screen.
 */
import { useState } from "react";
import {
  ArrowRightIcon,
  BookOpenIcon,
  ChevronDownIcon,
  FilePenIcon,
  ListChecksIcon,
  SettingsIcon,
} from "lucide-react";

const STEPS = [
  {
    icon: FilePenIcon,
    title: "Describe your idea",
    body: "Enter a vague prompt or detailed specification.",
  },
  {
    icon: ListChecksIcon,
    title: "Review requirements",
    body: "Edit functional and non-functional requirements.",
  },
  {
    icon: SettingsIcon,
    title: "Generate architecture",
    body: "Get LLD, HLD and DSA based on your requirements.",
  },
  {
    icon: BookOpenIcon,
    title: "Explore and learn",
    body: "Interactive diagrams with guided explanations.",
  },
] as const;

const CONTROLS = [
  {
    title: "Your model, your key",
    body: "Runs use your own provider key (OpenRouter or Groq). The key lives in this browser tab only (sessionStorage), travels only with generation requests, and is never persisted server-side or logged.",
  },
  {
    title: "One validated model",
    body: "The confirmed spec generates a single canonical architecture model. Validation errors block the view and tell you what to fix; warnings surface without blocking.",
  },
  {
    title: "Iterate and export",
    body: "Regenerate the whole model or one view, annotate the diagram, and export the design as a printable document with SVG diagrams. Nothing leaves your machine.",
  },
] as const;

export function HowItWorks() {
  const [controlsOpen, setControlsOpen] = useState(false);

  return (
    <section
      id="how-it-works"
      className="border-border/60 bg-background/60 relative border-t border-solid py-20"
    >
      <div className="mx-auto w-full max-w-7xl space-y-14 px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <h2 className="text-foreground font-heading text-3xl font-bold tracking-tight sm:text-4xl md:text-[2.5rem]">
              How it works
            </h2>
            <p className="text-muted-foreground mt-2 text-sm sm:text-base">
              From a simple idea to a complete architecture in minutes.
            </p>
          </div>
          <div>
            <a
              href="#examples"
              className="text-primary hover:text-primary-hover inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
            >
              <span>Learn more</span>
              <ArrowRightIcon className="size-4" aria-hidden="true" />
            </a>
          </div>
        </div>

        <div className="relative">
          <div
            className="border-border absolute top-10 right-[12%] left-[12%] hidden h-0.5 border-t-2 border-dashed lg:block"
            aria-hidden="true"
          />
          <div className="relative z-10 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-[1.07fr_1fr_1fr_0.93fr]">
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.title}
                  className="flex flex-col items-center space-y-3 text-center"
                >
                  <div className="bg-card border-border text-primary flex size-14 items-center justify-center rounded-2xl border border-solid shadow-md transition-colors hover:border-primary">
                    <Icon className="size-6" aria-hidden="true" strokeWidth={1.8} />
                  </div>
                  <div className="text-foreground font-landing-mono text-sm font-bold">
                    {index + 1}
                  </div>
                  <h3 className="text-foreground font-heading text-base font-semibold">
                    {step.title}
                  </h3>
                  <p className="text-muted-foreground max-w-xs text-xs leading-relaxed sm:text-sm">
                    {step.body}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Secondary detail, collapsed by default (body mounts only when open). */}
        <details
          open={controlsOpen}
          onToggle={(event) => setControlsOpen(event.currentTarget.open)}
          className="border-border/60 group mx-auto max-w-3xl border-t border-solid pt-4"
        >
          <summary className="text-muted-foreground hover:text-foreground flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-medium transition-colors [&::-webkit-details-marker]:hidden">
            Controls, keys and export
            <ChevronDownIcon
              className="size-4 flex-none transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          {controlsOpen ? (
            <dl className="mt-4 grid gap-4 sm:grid-cols-3">
              {CONTROLS.map((control) => (
                <div key={control.title}>
                  <dt className="text-foreground text-xs font-semibold">
                    {control.title}
                  </dt>
                  <dd className="text-muted-foreground mt-1 text-xs leading-relaxed">
                    {control.body}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
        </details>
      </div>
    </section>
  );
}
