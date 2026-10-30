"use client";

import Link from "next/link";
import { LogOutIcon } from "lucide-react";
import { ProviderDialog } from "./provider-dialog";
import { Button } from "@/components/ui/button";
import {
  DockButton,
  DockLink,
  DockSlot,
  HORIZONTAL_HEADER_DOCKED,
  ScrollDock,
  useDock,
} from "@/components/nav/dock";
import { MobileNavSheet } from "@/components/nav/mobile-nav-sheet";
import {
  FLOATING_HEADER_CARD,
  FLOATING_HEADER_SHELL,
} from "@/components/ui/floating-header";
import { useSession, signOut } from "@/hooks/use-session";
import { cn } from "cn";
import {
  GaugeIcon,
  HomeIcon,
  LibraryIcon,
  SettingsIcon,
} from "lucide-react";

export function SiteHeader() {
  const session = useSession();
  const docked = useDock();

  return (
    <>
    <header className={FLOATING_HEADER_SHELL}>
      <div className={cn(
        FLOATING_HEADER_CARD,
        "mx-auto flex w-full max-w-[1100px] items-center justify-between px-6 py-3 transition-[opacity,transform] duration-200",
        docked && HORIZONTAL_HEADER_DOCKED,
      )}
      inert={docked || undefined}>
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
        <div className="flex items-center gap-2 md:gap-3">
          <span className="md:hidden">
            <MobileNavSheet
              links={[
                { href: "/#how-it-works", label: "How it works" },
                { href: "/#idea-capture", label: "Examples" },
                { href: "/pricing", label: "Plans & pricing" },
                ...(session !== null
                  ? [
                      { href: "/library", label: "Library" },
                      { href: "/dashboard", label: "Dashboard" },
                      { href: "/settings", label: "Settings" },
                    ]
                  : []),
              ]}
              providerSetup
              onSignOut={() => void signOut()}
            />
          </span>
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
            <Link
              href="/pricing"
              className="text-secondary-foreground hover:text-foreground text-sm transition-colors"
            >
              Plans
            </Link>
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
    <ScrollDock docked={docked}>
      <DockLink href="/" label="Home" icon={<HomeIcon className="size-5" />} current />
      {session !== null ? (
        <>
          <DockLink href="/library" label="Library" icon={<LibraryIcon className="size-5" />} />
          <DockLink href="/dashboard" label="Dashboard" icon={<GaugeIcon className="size-5" />} />
          <DockLink href="/settings" label="Settings" icon={<SettingsIcon className="size-5" />} />
        </>
      ) : null}
      <DockSlot>
        <ProviderDialog />
      </DockSlot>
      {session !== null ? (
        <DockButton
          label="Sign out"
          icon={<LogOutIcon className="size-5" />}
          onClick={() => void signOut()}
        />
      ) : (
        <DockLink href="/login" label="Sign in" icon={<LogOutIcon className="size-5" />} />
      )}
    </ScrollDock>
    </>
  );
}
