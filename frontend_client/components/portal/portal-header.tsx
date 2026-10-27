"use client";

/**
 * Shared chrome for the signed-in portal pages (library / dashboard /
 * settings): brand link, primary nav, account identity + sign out.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOutIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
import { clearSession } from "@/lib/session/auth";
import { cn } from "cn";

const NAV = [
  { href: "/library", label: "Library" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/settings", label: "Settings" },
];

export function PortalHeader({ current }: { current: "library" | "dashboard" | "settings" }) {
  const router = useRouter();
  const session = useSession();

  return (
    <header className="border-border bg-card sticky top-0 z-40 w-full border-b border-solid">
      <div className="mx-auto flex w-full max-w-[1100px] items-center justify-between gap-4 px-6 py-3">
        <div className="flex min-w-0 items-center gap-4">
          <Link href="/" className="focus-visible:ring-ring flex items-center gap-2 rounded focus-visible:ring-2 focus-visible:outline-1">
            <span className="text-primary font-mono text-sm font-bold">sda/</span>
            <span className="text-foreground hidden text-sm font-bold tracking-tight sm:block">
              System Design All-in-One
            </span>
          </Link>
          <nav aria-label="Portal sections" className="flex items-center gap-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={current === item.href.slice(1) ? "page" : undefined}
                className={cn(
                  "focus-visible:ring-ring rounded px-2.5 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-1",
                  current === item.href.slice(1)
                    ? "bg-primary/10 text-primary"
                    : "text-secondary-foreground hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex flex-none items-center gap-3">
          {session !== null ? (
            <>
              <span
                className="text-muted-foreground max-w-[220px] truncate font-mono text-[11px]"
                title={session.user.email}
              >
                {session.user.email}
              </span>
              <span className="text-muted-foreground border-border/60 rounded border border-solid px-1.5 py-0.5 font-mono text-[10px] uppercase">
                {session.user.planTier}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Sign out"
                onClick={() => {
                  clearSession();
                  router.push("/login");
                }}
              >
                <LogOutIcon />
              </Button>
            </>
          ) : (
            <Link href="/login">
              <Button variant="outline" size="sm">Sign in</Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
