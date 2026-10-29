import { Capabilities } from "@/components/landing/capabilities";
import { HowItWorks } from "@/components/landing/how-it-works";
import { IdeaForm } from "@/components/landing/idea-form";
import { SiteHeader } from "@/components/landing/site-header";

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-[1100px] flex-grow px-6">
        <section className="pt-14 pb-10 md:pt-16">
          <h1 className="text-foreground max-w-[880px] text-3xl leading-[1.15] font-medium tracking-tight md:text-5xl animate-fade-up">
            Design any system. Understand every decision.
          </h1>
          <p className="text-muted-foreground mt-4 max-w-[760px] text-base leading-relaxed animate-fade-up animation-delay-1">
            Describe an idea or interview problem. It becomes a specification
            you confirm, then interactive LLD, HLD and DSA views that explain
            why every choice works.
          </p>
        </section>

        <div className="mb-16 animate-fade-up animation-delay-2">
          <IdeaForm />
        </div>

        <Capabilities />

        <HowItWorks />
      </main>
      <footer className="border-border bg-card border-t border-solid">
        <div className="mx-auto w-full max-w-[1100px] px-6 py-8">
          <p className="text-muted-foreground text-xs">
            Bring your own key — OpenRouter or Groq, per-provider models. Keys
            stay in this browser tab (sessionStorage) and are sent only with
            generation requests via the x-provider-api-key header; they are
            never persisted server-side.
          </p>
        </div>
      </footer>
    </div>
  );
}
