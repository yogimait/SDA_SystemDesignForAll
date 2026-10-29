const STEPS = [
  {
    tag: "01 · Idea",
    title: "Describe the system",
    body: "Paste anything — “Build Spotify”, a URL shortener, or a full spec up to 8,000 characters. Sign in, then a design session opens; first time, you set your model key in one dialog.",
  },
  {
    tag: "02 · Requirements",
    title: "A specification you own",
    body: "The idea becomes an editable requirements specification. Edit it before anything generates — nothing runs until you confirm the spec.",
  },
  {
    tag: "03 · Canonical model",
    title: "One validated model",
    body: "The confirmed spec generates a single canonical architecture model. Validation errors block the view and tell you what to fix; warnings surface without blocking.",
  },
  {
    tag: "04 · Three lenses",
    title: "LLD, HLD and DSA",
    body: "Every view renders from the same model. Selecting a class, edge, component or operation opens its responsibility, rationale and alternatives.",
  },
  {
    tag: "05 · Guided",
    title: "Walked, not dumped",
    body: "Guided mode steps through each view with explanations, so you learn the whys — resume where you left off in the same session.",
  },
  {
    tag: "06 · Export",
    title: "Take it with you",
    body: "Export the design as a document from the browser (SVG diagrams included) and print it to PDF. Nothing leaves your machine.",
  },
] as const;

const CONTROLS = [
  {
    tag: "BYOK",
    title: "Your model, your key",
    body: "Runs use your own provider key — OpenRouter or Groq, with provider-specific models (GLM-5.3 Flash on OpenRouter by default). The key lives in this browser tab only (sessionStorage), is sent only with generation requests via the x-provider-api-key header, and is never persisted server-side or logged.",
    chips: ["openrouter · groq", "session-only key", "never persisted"],
  },
  {
    tag: "Control",
    title: "Iterate at any scope",
    body: "Regenerate the whole model or a single view, jump back into the requirements editor, annotate the diagram, or hide side panels in focus mode — every change is explicit, nothing rewrites your design silently.",
    chips: ["regenerate per view", "annotate", "focus mode"],
  },
  {
    tag: "Honest state",
    title: "Progress you can verify",
    body: "Run stages reflect persisted generation stages, validation results come from the real model validation, and dashboards summarize actual provider runs — no simulated loading or made-up telemetry.",
    chips: ["persisted stages", "real validation", "usage from runs"],
  },
] as const;

/**
 * Text-led landing detail sections (no screenshots): the idea → requirements →
 * canonical model flow, and the control/BYOK/verification story.
 */
export function HowItWorks() {
  return (
    <>
      <section
        id="how-it-works"
        className="mx-auto mb-16 w-full max-w-[1100px] px-6"
      >
        <h2 className="text-foreground text-xl font-medium tracking-tight md:text-2xl">
          How it works
        </h2>
        <p className="text-muted-foreground mt-2 max-w-[70ch] text-sm leading-relaxed">
          One pipeline: your idea becomes a specification you confirm, the
          confirmed spec becomes a canonical architecture, and every view
          explains a different layer of that architecture.
        </p>
        <p
          aria-hidden="true"
          className="text-muted-foreground border-border/60 font-mono mt-6 hidden border-y border-solid py-2 text-xs lg:block"
        >
          idea&nbsp;→&nbsp;requirements&nbsp;(edit · confirm)&nbsp;→&nbsp;canonical
          model&nbsp;→&nbsp;LLD&thinsp;/&thinsp;HLD&thinsp;/&thinsp;DSA&nbsp;→&nbsp;export
        </p>

        <ol className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:gap-6">
          {STEPS.map((step) => (
            <li
              key={step.tag}
              className="bg-card border-border hover:border-foreground/25 rounded-xl border border-solid p-5 transition-[border-color] duration-200 md:p-6"
            >
              <p className="text-primary font-mono text-xs">{step.tag}</p>
              <h3 className="text-foreground mt-2 text-base font-medium">
                {step.title}
              </h3>
              <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto mb-16 w-full max-w-[1100px] px-6">
        <h2 className="text-foreground text-xl font-medium tracking-tight md:text-2xl">
          Control and verification
        </h2>
        <p className="text-muted-foreground mt-2 max-w-[70ch] text-sm leading-relaxed">
          The tool keeps you in charge of the model, the provider and the
          truthfulness of what you see.
        </p>
        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
          {CONTROLS.map((control) => (
            <article
              key={control.tag}
              className="bg-card border-border hover:border-foreground/25 rounded-xl border border-solid p-6 transition-[border-color] duration-200"
            >
              <p className="text-primary font-mono text-xs">{control.tag}</p>
              <h3 className="text-foreground mt-2 font-medium">
                {control.title}
              </h3>
              <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                {control.body}
              </p>
              <div className="border-border/60 mt-4 flex flex-wrap gap-2 border-t border-solid pt-4">
                {control.chips.map((chip) => (
                  <span
                    key={chip}
                    className="text-muted-foreground border-input rounded border border-solid px-2 py-0.5 font-mono text-[11px]"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
