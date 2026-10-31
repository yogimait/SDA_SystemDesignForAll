"use client";

/**
 * Workspace outline sidebar (F4): search input + named groups of entries.
 * Shared by the LLD view (classes, patterns) and the HLD view (components,
 * flows, scalability notes, failure scenarios, technology decisions).
 * Two orientations: vertical (sheets + narrow asides) and horizontal
 * (the desktop top strip — search on the left, groups as columns).
 */
import { Input } from "@/components/ui/input";
import { cn } from "cn";

export type SidebarEntry = {
  id: string;
  primary: string;
  secondary: string;
  selected: boolean;
  onSelect: () => void;
};

export type SidebarGroup = {
  title: string;
  emptyText: string;
  entries: SidebarEntry[];
};

export function WorkspaceSidebar({
  ariaLabel,
  search,
  onSearchChange,
  groups,
  orientation = "vertical",
  className,
}: {
  ariaLabel: string;
  search: string;
  onSearchChange: (next: string) => void;
  groups: SidebarGroup[];
  orientation?: "vertical" | "horizontal";
  className?: string;
}) {
  const query = search.trim().toLowerCase();
  const vertical = orientation === "vertical";
  return (
    <nav
      aria-label={ariaLabel}
      className={cn(
        "bg-card border-border flex h-full min-h-0 overflow-hidden rounded-xl border border-solid",
        vertical ? "flex-col" : "flex-row",
        className,
      )}
    >
      <div
        className={cn(
          "border-border border-solid p-3",
          vertical ? "border-b" : "w-52 flex-none border-r",
        )}
      >
        <p className="text-muted-foreground text-[10px]">Outlines</p>
        <Input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Filter by name…"
          aria-label="Filter outline entries by name"
          className="mt-2 h-8 text-xs"
        />
      </div>
      <div
        className={cn(
          "p-2",
          vertical
            ? "min-h-0 flex-1 overflow-y-auto"
            : "flex min-h-0 flex-1 gap-x-3 overflow-x-auto overflow-y-hidden",
        )}
      >
        {groups.map((group) => {
          const shown =
            query === ""
              ? group.entries
              : group.entries.filter((entry) => entry.primary.toLowerCase().includes(query));
          return (
            <div
              key={group.title}
              className={cn(
                vertical ? "mb-3" : "flex h-full min-h-0 w-44 flex-none flex-col",
              )}
            >
              <p
                className={cn(
                  "text-muted-foreground px-1.5 py-1 text-[10px]",
                  !vertical && "whitespace-nowrap",
                )}
              >
                {group.title}
              </p>
              {shown.length === 0 ? (
                <p className="text-muted-foreground px-1.5 py-1 text-xs italic">
                  {group.emptyText}
                </p>
              ) : (
                <ul
                  className={cn(
                    "space-y-0.5",
                    !vertical && "min-h-0 flex-1 overflow-y-auto pr-1",
                  )}
                >
                  {shown.map((entry) => (
                    <li key={entry.id}>
                      <button
                        type="button"
                        aria-pressed={entry.selected}
                        onClick={entry.onSelect}
                        className={cn(
                          "flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1.5 text-left text-xs transition-colors",
                          entry.selected
                            ? "bg-primary/10 text-primary"
                            : "text-foreground/85 hover:bg-muted",
                        )}
                      >
                        <span className="truncate">{entry.primary}</span>
                        <span className="text-muted-foreground flex-none font-mono text-[9.5px]">
                          {entry.secondary}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
