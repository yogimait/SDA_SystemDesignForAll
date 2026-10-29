"use client";

import Link from "next/link";
import { LogOutIcon } from "lucide-react";
import { ProviderDialog } from "./provider-dialog";
import {
  Button,
} from "@/components/ui/button";
import {
  FLOATING_HEADER_CARD,
  FLOATING_HEADER_SHELL,
} from "@/components/ui/floating-header";
import { useSession, signOut } from "@/hooks/use-session";

export function SiteHeader() {
  const session = useSession();

  return (
    <header className={FLOATING_HEADER_SHELL}>
      <div className={`${FLOATING_HEADER_CARD} mx-auto flex w-full max-w-[1100px] items-center justify-between px-6 py-3`}>
        <Link
          href="/"
          className="focus-visible:ring-ring group flex items-center gap-2 rounded focus-visible:ring-2 focus-visible:outline-1"
        >
          <span className="text-primary font-mono text-sm font-bold">
            sda/
          </span>
          <span className="text-foreground text-sm font-bold tracking-tight md:text-base">
            System Design All-in-One
          </span>
        </Link>
        <div className="flex items-center gap-4 md:gap-6">
          <nav
            aria-label="Landing sections"
            className="hidden items-center gap-6 md:flex"
          >
            <a
              href="#how-it-works"
              className="text-secondary-foreground hover:text-foreground text-sm transition-colors"
            >
              How it works
            </a>
            <a
              href="#idea-capture"
              className="text-secondary-foreground hover:text-foreground text-sm transition-colors"
            >
              Examples
            </a>
            {session !== null ? (
              <>
                <Link
                  href="/library"
                  className="text-secondary-foreground hover:text-foreground text-sm transition-colors"
                >
                  Library
                </Link>
                <Link
                  href="/dashboard"
                  className="text-secondary-foreground hover:text-foreground text-sm transition-colors"
                >
                  Dashboard
                </Link>
              </>
            ) : null}
          </nav>
          <ProviderDialog />
          {session !== null ? (
            <div className="flex items-center gap-2">
              <Link
                href="/settings"
                className="text-secondary-foreground hover:text-foreground hidden text-sm transition-colors sm:block"
              >
                Settings
              </Link>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Sign out"
                title="Sign out"
                onClick={() => void signOut()}
              >
                <LogOutIcon />
              </Button>
            </div>
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
