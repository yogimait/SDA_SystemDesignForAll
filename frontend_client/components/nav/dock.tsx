"use client";

/**
 * Desktop floating vertical dock (QA nav round): after scrolling ~120px the
 * horizontal header cross-fades into a fixed, contained vertical rail with
 * backdrop blur. Landing + portal headers compose it with their own items;
 * workspace/canvas pages never render it.
 */

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import type { LinkProps } from "next/link";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "cn";

const DOCK_THRESHOLD = 120;
/** Hysteresis: once docked, restore only below this — no flicker at the edge. */
const DOCK_RESTORE = 80;

/**
 * Scroll state + the body flag that applies the safe content offset
 * (globals.css: `body.dock-active main`). Only active at desktop widths.
 */
export function useDock(): boolean {
  const [docked, setDocked] = useState(false);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const update = () => {
      setDocked((previous) => {
        if (!desktop.matches) return previous ? false : previous;
        const next = previous
          ? window.scrollY > DOCK_RESTORE
          : window.scrollY > DOCK_THRESHOLD;
        return next === previous ? previous : next;
      });
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    desktop.addEventListener("change", update);
    return () => {
      window.removeEventListener("scroll", update);
      desktop.removeEventListener("change", update);
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle("dock-active", docked);
    return () => document.body.classList.remove("dock-active");
  }, [docked]);

  return docked;
}

const ITEM_CLASS =
  "text-secondary-foreground hover:text-foreground hover:bg-accent focus-visible:ring-ring flex h-11 w-11 items-center justify-center rounded-lg transition-colors focus-visible:ring-2 focus-visible:outline-1";

export function ScrollDock({
  docked,
  children,
}: {
  docked: boolean;
  children: ReactNode;
}) {
  return (
    <TooltipProvider delay={300}>
      {/* aria-hidden mirrors visual reality; inert keeps the hidden rail out
          of the tab order at both transition states. */}
      <nav
        aria-label="Floating quick dock"
        aria-hidden={!docked}
        className={cn(
          "border-border bg-card/80 shadow-lg fixed top-1/2 left-3 z-50 hidden -translate-y-1/2 flex-col items-center gap-1 rounded-xl border border-solid p-2 backdrop-blur-sm lg:flex",
          "transition-[opacity,transform] duration-200 motion-reduce:transition-none",
          docked
            ? "translate-x-0 opacity-100"
            : "pointer-events-none -translate-x-2 opacity-0",
        )}
        inert={!docked}
      >
        {children}
      </nav>
    </TooltipProvider>
  );
}

/** Icon-only dock entry for a route, with a right-side tooltip. */
export function DockLink({
  href,
  label,
  icon,
  current,
}: {
  href: LinkProps["href"];
  label: string;
  icon: ReactNode;
  current?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            href={href}
            aria-label={label}
            aria-current={current ? "page" : undefined}
            className={ITEM_CLASS}
          >
            {icon}
          </Link>
        }
      />
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

/** Icon-only dock action (e.g. sign out), with a right-side tooltip. */
export function DockButton({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button type="button" aria-label={label} className={ITEM_CLASS} onClick={onClick}>
            {icon}
          </button>
        }
      />
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Arbitrary self-contained control dropped into the dock (used for the
 * Provider dialog trigger on landing/library, which is blocked elsewhere).
 * The label span is suppressed so the trigger stays icon-only — the button
 * keeps its aria-label ("Provider setup" / "Provider ready").
 */
export function DockSlot({ children }: { children: ReactNode }) {
  return (
    <div className="dock-providers flex items-center justify-center">
      {children}
    </div>
  );
}

/** Classes for the horizontal header card's docked state (fade + rise out). */
export const HORIZONTAL_HEADER_DOCKED =
  "pointer-events-none -translate-y-2 opacity-0";

/** Attributes that fully remove the docked header card from the tab order. */
export const HORIZONTAL_HEADER_INERT = { inert: true } as const;
