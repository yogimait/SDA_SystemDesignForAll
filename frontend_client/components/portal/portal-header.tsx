"use client";

/**
 * Shared chrome for the signed-in portal pages (library / dashboard /
 * settings): brand link, primary nav, account identity + sign out. Desktop
 * scrolling cross-fades the card into the floating vertical dock; below lg a
 * hamburger sheet exposes nav + identity + provider setup (library only).
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  GaugeIcon,
  HomeIcon,
  LibraryIcon,
  LogOutIcon,
  SettingsIcon,
} from "lucide-react";
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
import { useSession } from "@/hooks/use-session";
import { signOut } from "@/hooks/use-session";
import { ProviderDialog } from "@/components/landing/provider-dialog";
import { cn } from "cn";

const NAV = [
  { href: "/library", label: "Library" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/settings", label: "Settings" },
];

const DOCK_ICON = { href: "/", label: "Home", Icon: HomeIcon } as const;
const DOCK_NAV = [
  { href: "/library", label: "Library", Icon: LibraryIcon },
  { href: "/dashboard", label: "Dashboard", Icon: GaugeIcon },
  { href: "/settings", label: "Settings", Icon: SettingsIcon },
] as const;

export function PortalHeader({ current }: { current: "library" | "dashboard" | "settings" }) {
  const router = useRouter();
  const session = useSession();
  const docked = useDock();
  const currentPath = `/${current}`;

  return (
    <>
      <header className={FLOATING_HEADER_SHELL}>
        <div className={cn(
          FLOATING_HEADER_CARD,
          "mx-auto flex w-full max-w-[1100px] items-center justify-between gap-4 px-6 py-3 transition-[opacity,transform] duration-200",
          docked && HORIZONTAL_HEADER_DOCKED,
        )}
        inert={docked || undefined}
      >
          <div className="flex min-w-0 items-center gap-4">
            <Link href="/" className="focus-visible:ring-ring flex items-center gap-2 rounded focus-visible:ring-2 focus-visible:outline-1">
              <span className="text-primary font-mono text-sm font-bold">sda/</span>
              <span className="text-foreground hidden text-sm font-bold tracking-tight sm:block">
                System Design All-in-One
              </span>
            </Link>
            {/* Text nav lives ≥md; phones get it inside the menu sheet —
                the 44px hamburger must never overlap these links (D2). */}
            <nav aria-label="Portal sections" className="hidden items-center gap-1 md:flex">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={currentPath === item.href ? "page" : undefined}
                  className={cn(
                    "focus-visible:ring-ring rounded px-2.5 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-1",
                    currentPath === item.href
                      ? "bg-primary/10 text-primary"
                      : "text-secondary-foreground hover:text-foreground",
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex flex-none items-center gap-2 sm:gap-3">
            <span className="lg:hidden">
              <MobileNavSheet
                links={NAV}
                providerSetup={current === "library"}
                onSignOut={() => {
                  void signOut();
                  router.push("/login");
                }}
              />
            </span>
            {session !== null ? (
              <>
                {/* Identity details are secondary: below md they collapse so
                    they cannot overlap or block the nav links (QA D2, 390px); the
                    sheet carries them on phones. */}
                <span
                  className="text-muted-foreground hidden max-w-[220px] truncate font-mono text-[11px] md:inline"
                  title={session.user.email}
                >
                  {session.user.email}
                </span>
                <span className="text-muted-foreground border-border/60 hidden rounded border border-solid px-1.5 py-0.5 font-mono text-[10px] uppercase md:inline">
                  {session.user.planTier}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Sign out"
                  onClick={() => {
                    void signOut();
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
      <ScrollDock docked={docked}>
        <DockLink href={DOCK_ICON.href} label={DOCK_ICON.label} icon={<DOCK_ICON.Icon className="size-5" />} />
        {DOCK_NAV.map((item) => (
          <DockLink
            key={item.href}
            href={item.href}
            label={item.label}
            icon={<item.Icon className="size-5" />}
            current={currentPath === item.href}
          />
        ))}
        {current === "library" ? (
          <DockSlot>
            <ProviderDialog />
          </DockSlot>
        ) : null}
        {session !== null ? (
          <DockButton
            label="Sign out"
            icon={<LogOutIcon className="size-5" />}
            onClick={() => {
              void signOut();
              router.push("/login");
            }}
          />
        ) : null}
      </ScrollDock>
    </>
  );
}
