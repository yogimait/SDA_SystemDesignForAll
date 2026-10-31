"use client";

import Link from "next/link";
import { LogOutIcon } from "lucide-react";
import type { ReactNode } from "react";
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
import { useSession, signOut } from "@/hooks/use-session";
import { cn } from "cn";
import {
  GaugeIcon,
  HomeIcon,
  LibraryIcon,
  SettingsIcon,
} from "lucide-react";

/** Landing header, matching the Stitch Coffee reference: flat sticky bar. */
export function SiteHeader() {
  const session = useSession();
  const docked = useDock();

  const navLink = (href: string, label: string, node?: ReactNode) => (
    <Link
      key={href}
      href={href}
      className="text-muted-foreground hover:text-foreground whitespace-nowrap text-sm font-medium transition-colors"
    >
      {node}
      {label}
    </Link>
  );

  return (
    <>
      <header className="border-border/70 bg-background/95 sticky top-0 z-50 border-b border-solid backdrop-blur-md">
        <div
          className={cn(
            "mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 transition-[opacity,transform] duration-200 sm:px-6 lg:px-8",
            docked && HORIZONTAL_HEADER_DOCKED,
          )}
          inert={docked || undefined}
        >
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="focus-visible:ring-ring group flex items-center gap-2 rounded focus-visible:ring-2 focus-visible:outline-1"
            >
              <span className="text-primary font-heading text-xl font-bold tracking-tight transition-opacity group-hover:opacity-90">
                sda/
              </span>
              <span className="text-muted-foreground hidden text-sm font-medium sm:inline-block">
                System Design All-in-One
              </span>
            </Link>
          </div>

          <nav
            aria-label="Landing sections"
            className="text-muted-foreground hidden items-center gap-8 text-sm font-medium md:flex"
          >
            {navLink("/#how-it-works", "How it works")}
            {navLink("/#examples", "Examples")}
            {navLink("/pricing", "Plans")}
            {session !== null ? (
              <>
                {navLink("/library", "Library")}
                {navLink("/dashboard", "Dashboard")}
              </>
            ) : null}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <span className="md:hidden">
              <MobileNavSheet
                links={[
                  { href: "/#how-it-works", label: "How it works" },
                  { href: "/#examples", label: "Examples" },
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
            <ProviderDialog marketing />
            {session !== null ? (
              <div className="flex items-center gap-2">
                <Link
                  href="/settings"
                  className="text-muted-foreground hover:text-foreground hidden text-sm font-medium transition-colors sm:block"
                >
                  Settings
                </Link>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="size-11"
                  aria-label="Sign out"
                  title="Sign out"
                  onClick={() => void signOut()}
                >
                  <LogOutIcon />
                </Button>
              </div>
            ) : (
              <Link href="/login">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-border bg-card text-foreground hover:bg-popover h-11 rounded-lg px-3.5 text-xs font-medium"
                >
                  Sign in
                </Button>
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
          <ProviderDialog marketing />
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
