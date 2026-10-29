"use client";

/**
 * Mobile navigation sheet (QA nav round): a hamburger opens a compact sheet
 * with the account identity, every portal link, provider setup where allowed
 * (landing + library only), and sign out — controls the narrow headers hide.
 * Escape/overlay close and focus return come from the shared Sheet.
 */

import { useState } from "react";
import Link from "next/link";
import { LogOutIcon, MenuIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ProviderDialog } from "@/components/landing/provider-dialog";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useSession } from "@/hooks/use-session";

export type SheetLink = { href: string; label: string };

const ROW_CLASS =
  "text-secondary-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring flex min-h-11 w-full items-center rounded-lg px-3 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-1";

/**
 * Hamburger + sheet. Links are routes or hash anchors; providerSetup renders
 * the shared BYOK dialog trigger inside the menu (only where permitted).
 * `onSignOut` differs per context: landing clears the session in place,
 * portal also routes back to /login.
 */
export function MobileNavSheet({
  links,
  providerSetup = false,
  onSignOut,
}: {
  links: SheetLink[];
  providerSetup?: boolean;
  onSignOut: () => void;
}) {
  const session = useSession();
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button
        variant="ghost"
        size="icon"
        className="size-11 shrink-0"
        aria-label="Open navigation menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <MenuIcon />
      </Button>
      <SheetContent side="right" className="w-72 gap-5 p-4">
        <SheetTitle className="text-foreground text-sm font-semibold">Navigation</SheetTitle>

        {session !== null ? (
          <div className="border-border/60 flex min-w-0 flex-col gap-1.5 border-b border-solid pb-4">
            <span className="text-muted-foreground truncate font-mono text-[11px]" title={session.user.email}>
              {session.user.email}
            </span>
            <span className="text-muted-foreground border-border/60 self-start rounded border border-solid px-1.5 py-0.5 font-mono text-[10px] uppercase">
              {session.user.planTier}
            </span>
          </div>
        ) : null}

        <nav aria-label="Site sections" className="flex flex-col gap-0.5">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className={ROW_CLASS}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {providerSetup ? (
          <div className="flex flex-col gap-1">
            <p className="text-muted-foreground text-[11px] uppercase">Model access</p>
            <ProviderDialog />
          </div>
        ) : null}

        <div className="border-border/60 mt-auto flex flex-col gap-1 border-t border-solid pt-2">
          {session !== null ? (
            <Button
              variant="ghost"
              size="sm"
              className="min-h-11 justify-start px-3 text-sm"
              onClick={() => {
                setOpen(false);
                onSignOut();
              }}
            >
              <LogOutIcon />
              Sign out
            </Button>
          ) : (
            <Link href="/login" className={ROW_CLASS} onClick={() => setOpen(false)}>
              Sign in
            </Link>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
