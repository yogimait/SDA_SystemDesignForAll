"use client";

import Link from "next/link";
import { ProviderDialog } from "./provider-dialog";

export function SiteHeader() {
  return (
    <header className="border-border bg-card sticky top-0 z-40 w-full border-b border-solid">
      <div className="mx-auto flex w-full max-w-[1100px] items-center justify-between px-6 py-3">
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
              href="#what-you-get"
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
          </nav>
          <ProviderDialog />
        </div>
      </div>
    </header>
  );
}
