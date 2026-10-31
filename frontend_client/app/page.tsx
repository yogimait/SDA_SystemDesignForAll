import Link from "next/link";
import { BoxIcon, GlobeIcon, LayersIcon } from "lucide-react";
import { Capabilities } from "@/components/landing/capabilities";
import { HowItWorks } from "@/components/landing/how-it-works";
import { IdeaForm } from "@/components/landing/idea-form";
import { SamplePreview } from "@/components/landing/sample-preview";
import { SiteHeader } from "@/components/landing/site-header";

const CTA_PILLARS = [
  {
    icon: BoxIcon,
    label: "LLD",
    detail: "Class diagrams & patterns",
  },
  {
    icon: GlobeIcon,
    label: "HLD",
    detail: "Architecture & scaling",
  },
  {
    icon: LayersIcon,
    label: "DSA",
    detail: "Algorithms & complexity",
  },
] as const;

export default function LandingPage() {
  return (
    <div className="font-landing bg-background text-foreground flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex-grow">
        {/* Hero: badge, split copy/form + static product window. */}
        <section className="relative overflow-hidden pt-12 pb-12 lg:pt-16">
          <div
            className="bg-primary/5 pointer-events-none absolute top-1/4 left-1/2 -z-10 h-[350px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
            aria-hidden="true"
          />
          <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-5">
              <span className="bg-card border-border text-muted-foreground font-landing-mono inline-flex items-center rounded-full border border-solid px-3 py-1 text-xs font-medium tracking-wide">
                <span className="text-primary mr-1.5" aria-hidden="true">
                  ●
                </span>
                AI-powered • LLD • HLD • DSA • Design Patterns
              </span>
            </div>

            <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-12">
              <div className="animate-fade-up space-y-6 lg:col-span-6">
                <div className="space-y-4">
                  <h1 className="text-foreground font-heading text-4xl leading-[1.12] font-bold tracking-tight sm:text-5xl 3xl:text-6xl">
                    Design any system.
                    <br />
                    <span className="text-primary">
                      Understand every decision.
                    </span>
                  </h1>
                  <p className="text-muted-foreground max-w-xl text-base leading-relaxed sm:text-lg">
                    Describe an idea or interview problem, get a clear
                    specification, and explore interactive LLD, HLD and DSA
                    views with explanations.
                  </p>
                </div>
                <IdeaForm />
              </div>

              <div className="animate-fade-up animation-delay-2 lg:col-span-6">
                <SamplePreview />
              </div>
            </div>
          </div>
        </section>

        <Capabilities />
        <HowItWorks />

        {/* Closing CTA banner with the three-view pillars. */}
        <section className="bg-background py-20">
          <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="border-border bg-card coffee-dot-grid-subtle relative overflow-hidden rounded-3xl border border-solid p-8 shadow-2xl sm:p-12 lg:p-14">
              <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12">
                <div className="space-y-6 lg:col-span-7">
                  <span className="text-primary font-landing-mono text-xs font-bold tracking-widest uppercase">
                    Build • Learn • Improve
                  </span>
                  <h2 className="text-foreground font-heading text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl md:text-[2.5rem]">
                    Ready to design your next system?
                  </h2>
                  <p className="text-muted-foreground max-w-lg text-sm leading-relaxed sm:text-base">
                    Start from one idea, confirm the spec, then inspect the
                    model and the trade-offs it explains.
                  </p>
                  <div className="flex flex-wrap items-center gap-4 pt-2">
                    <Link
                      href="#idea-capture"
                      className="bg-primary text-primary-foreground hover:bg-primary-hover focus-visible:ring-ring font-heading inline-flex min-h-11 items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold shadow-md transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-1"
                    >
                      <span>Start design session</span>
                      <span aria-hidden="true">→</span>
                    </Link>
                    <Link
                      href="#examples"
                      className="border-border bg-popover hover:bg-background text-foreground font-heading inline-flex min-h-11 items-center rounded-xl border border-solid px-6 py-3 text-sm font-medium transition-colors"
                    >
                      View examples
                    </Link>
                  </div>
                </div>

                <div className="border-border grid grid-cols-3 gap-4 border-t border-solid pt-8 lg:col-span-5 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-10">
                  {CTA_PILLARS.map((pillar) => {
                    const Icon = pillar.icon;
                    return (
                      <div
                        key={pillar.label}
                        className="flex flex-col items-center space-y-2 text-center"
                      >
                        <div className="bg-popover border-border text-primary flex size-11 items-center justify-center rounded-xl border border-solid">
                          <Icon className="size-5" aria-hidden="true" />
                        </div>
                        <div className="text-foreground font-heading text-sm font-bold">
                          {pillar.label}
                        </div>
                        <p className="text-muted-foreground text-[11px] leading-tight">
                          {pillar.detail}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-border/60 bg-background border-t border-solid py-8">
        <div className="text-muted-foreground mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-4 px-4 text-xs sm:flex-row sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <span className="text-primary font-heading font-semibold">sda/</span>
            <span>© 2026 System Design All-in-One.</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/pricing" className="hover:text-muted-foreground transition-colors">
              Plans &amp; pricing
            </Link>
            <a href="#how-it-works" className="hover:text-muted-foreground transition-colors">
              How it works
            </a>
            <a href="#examples" className="hover:text-muted-foreground transition-colors">
              Examples
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
