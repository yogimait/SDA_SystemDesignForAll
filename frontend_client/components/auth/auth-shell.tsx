/**
 * Shared shell for the standalone auth pages (verify email, forgot/reset
 * password): brand header + one centered card. Keeps them consistent with the
 * login page without duplicating the floating-header markup.
 */
import Link from "next/link";
import {
  FLOATING_HEADER_CARD,
  FLOATING_HEADER_SHELL,
} from "@/components/ui/floating-header";

export function AuthShell({
  title,
  lead,
  children,
}: {
  title: string;
  lead: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className={FLOATING_HEADER_SHELL}>
        <div className={`${FLOATING_HEADER_CARD} mx-auto w-full max-w-[1100px] px-6 py-3`}>
          <Link
            href="/"
            className="focus-visible:ring-ring flex items-center gap-2 rounded focus-visible:ring-2 focus-visible:outline-1"
          >
            <span className="text-primary font-mono text-sm font-bold">sda/</span>
            <span className="text-foreground text-sm font-bold tracking-tight">
              System Design All-in-One
            </span>
          </Link>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-[1100px] flex-1 items-center justify-center px-6 py-10">
        <div className="w-full max-w-[460px] animate-fade-up">
          <h1 className="text-foreground text-balance text-xl font-medium tracking-tight">
            {title}
          </h1>
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{lead}</p>
          <div className="bg-card border-border mt-5 rounded-xl border border-solid p-6 sm:p-8">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
