const CAPABILITIES = [
  {
    tag: "LLD",
    title: "Interactive UML class diagram",
    body: "Select any class or relationship to read its responsibility, rationale and alternatives.",
    chips: ["classes", "patterns", "multiplicity"],
  },
  {
    tag: "HLD",
    title: "Architecture walkthrough",
    body: "Components, request/event flows, scaling notes and failure scenarios.",
    chips: ["components", "flows", "scaling"],
  },
  {
    tag: "DSA",
    title: "Operation-scoped analysis",
    body: "Which data structures and algorithms power the design, with honest complexity claims.",
    chips: ["structures", "complexity", "trade-offs"],
  },
] as const;

/** Static, text-led capability cards + a clearly-labelled sample preview. */
export function Capabilities() {
  return (
    <section
      id="what-you-get"
      className="mx-auto mb-16 w-full max-w-[1100px] px-6 animate-fade-up animation-delay-3"
    >
      <h2 className="text-foreground text-xl font-medium tracking-tight md:text-2xl">
        What you get
      </h2>
      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
        {CAPABILITIES.map((capability) => (
          <article
            key={capability.tag}
            className="bg-card border-border hover:border-foreground/25 rounded-xl border border-solid p-6 transition-[transform,border-color] duration-200 hover:-translate-y-1"
          >
            <p className="text-primary font-mono text-xs">{capability.tag}</p>
            <h3 className="text-foreground mt-2 font-medium">
              {capability.title}
            </h3>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
              {capability.body}
            </p>
            <div className="border-border/60 mt-4 flex flex-wrap gap-2 border-t border-solid pt-4">
              {capability.chips.map((chip) => (
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

      {/* Sample preview — static fixture material only, never generated content. */}
      <div className="bg-card border-border mt-6 rounded-xl border border-solid p-6">
        <div className="flex items-center justify-between gap-3">
          <p className="text-muted-foreground font-mono text-xs">
            Sample workspace preview
          </p>
          <span className="text-warning border-warning/40 text-warning rounded border border-solid px-2 py-0.5 font-mono text-[11px]">
            static sample
          </span>
        </div>
        <dl className="mt-4 space-y-2 font-mono text-xs md:grid md:grid-cols-3 md:gap-6 md:space-y-0">
          <div>
            <dt className="text-muted-foreground">LLD</dt>
            <dd className="text-foreground mt-1">
              RateLimiter · TokenBucket · Cache
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">HLD</dt>
            <dd className="text-foreground mt-1">
              Client → Gateway → Service → Store
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">DSA</dt>
            <dd className="text-foreground mt-1">
              sliding window · O(1) amortized avg
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
