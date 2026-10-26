"use client";

/**
 * DSA view (F4, bento layout 2026-10-26): a responsive grid of tiles — one
 * per recommendation (operation shown in the tile), per algorithmic pattern,
 * plus a full-width comparison table. Content-driven spans keep the bento
 * rhythm (dense tiles get a two-column slot on large screens). All content
 * comes from contract fields — "when alternatives beat this" shows each
 * rejected alternative with its reason; the table's trade-off column is the
 * first limitation.
 */

import type { ArchitectureModel } from "@sda/contracts";
import { useEffect, useRef, type RefObject } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  complexityChips,
  layerLabel,
  tradeOffText,
} from "@/lib/dsa/format";
import { cn } from "cn";

const SPAN_THRESHOLD = 3;

export function WorkspaceDsa({
  model,
  guidedStep,
  className,
}: {
  model: ArchitectureModel;
  /** current guided-learning step; matching cards get a ring, the first scrolls into view */
  guidedStep?: { id: string; recommendationIds: string[] } | null;
  className?: string;
}) {
  const scrollRef = useRecScroll(guidedStep);
  const guided = guidedStep !== undefined && guidedStep !== null;
  const recommended = (id: string): boolean => guidedStep?.recommendationIds.includes(id) ?? false;
  const recommendations = model.dsa.recommendations;

  return (
    <div ref={scrollRef} className={cn("flex h-full min-h-0 flex-col overflow-y-auto pr-1", className)}>
      <div className="mx-auto w-full max-w-[1180px] px-2 py-1">
        <h2 className="text-foreground border-border text-lg font-medium tracking-tight">Data-structure decisions</h2>

        {recommendations.length === 0 ? (
          <p className="text-muted-foreground mt-4 border-border border-b border-solid pb-4 text-sm">
            No data-structure recommendations were generated for this project.
            Regenerate with the DSA scope enabled.
          </p>
        ) : null}

        <section
          aria-label="Data-structure recommendations"
          className="grid w-full grid-flow-dense items-start gap-3 pb-4 pt-4 md:grid-cols-2 xl:grid-cols-3"
        >
          {recommendations.map((rec) => {
            const dense =
              rec.assumptions.length + rec.alternatives.length + rec.limitations.length >= SPAN_THRESHOLD;
            return (
              <article
                key={rec.id}
                data-rec-id={rec.id}
                className={cn(
                  "bg-card border-border rounded-xl border border-solid p-4 transition-opacity",
                  dense && "xl:col-span-2",
                  guided && recommended(rec.id) && "ring-ring ring-2",
                  guided && !recommended(rec.id) && "opacity-40",
                )}
                aria-label={`${rec.operation}: ${rec.dataStructure}`}
              >
                <p className="text-muted-foreground border-border/60 border-b border-solid pb-1.5 font-mono text-[10.5px] uppercase">
                  {rec.operation}
                </p>
                <header className="flex items-start justify-between gap-2 pt-3">
                  <div className="min-w-0">
                    <p className="text-foreground text-sm font-semibold tracking-tight">{rec.dataStructure}</p>
                    <p className="text-muted-foreground mt-0.5 font-mono text-[11px]">{rec.algorithm}</p>
                  </div>
                  <Badge className="flex-none bg-secondary text-secondary-foreground font-mono">
                    {layerLabel(rec.layer)}
                  </Badge>
                </header>

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span
                    className="bg-primary/10 text-primary rounded px-1.5 py-0.5 font-mono text-[10.5px]"
                    title="average-case complexity"
                  >
                    {complexityChips(rec.complexity).average}
                  </span>
                  <span
                    className="bg-warning/10 text-warning rounded px-1.5 py-0.5 font-mono text-[10.5px]"
                    title="worst-case complexity"
                  >
                    {complexityChips(rec.complexity).worst}
                  </span>
                </div>
                {rec.complexity.notes !== "" ? (
                  <p className="text-muted-foreground mt-1.5 text-[11px] italic">{rec.complexity.notes}</p>
                ) : null}

                <p className="text-foreground/85 mt-3 text-xs leading-relaxed">{rec.rationale}</p>

                {rec.assumptions.length > 0 ? (
                  <CardList title="Assumptions" items={rec.assumptions} />
                ) : null}

                {rec.alternatives.length > 0 ? (
                  <div className="mt-3">
                    <p className="text-muted-foreground text-[10px] uppercase">
                      when alternatives beat this
                    </p>
                    <ul className="mt-1 space-y-1.5">
                      {rec.alternatives.map((alt) => (
                        <li key={alt.option} className="text-xs leading-relaxed">
                          <span className="text-foreground font-medium">{alt.option}</span>
                          <span className="text-muted-foreground"> — {alt.rejectedBecause}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {rec.limitations.length > 0 ? <CardList title="Limitations" items={rec.limitations} /> : null}

                {rec.requirementRefs.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {rec.requirementRefs.map((ref) => (
                      <span
                        key={ref}
                        className="text-muted-foreground border-border/60 rounded border border-solid px-1.5 py-0.5 font-mono text-[10px]"
                      >
                        {ref}
                      </span>
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })}

          {model.dsa.algorithmicPatterns.map((pattern) => (
            <article
              key={pattern.id}
              className="bg-card border-border rounded-xl border border-solid p-4"
              aria-label={pattern.name}
            >
              <p className="text-muted-foreground border-border/60 border-b border-solid pb-1.5 font-mono text-[10.5px] uppercase">
                algorithmic pattern
              </p>
              <p className="text-foreground pt-3 text-sm font-semibold tracking-tight">{pattern.name}</p>
              <p className="text-muted-foreground mt-1.5 text-xs leading-relaxed">{pattern.problem}</p>
              <p className="text-foreground/85 mt-2 text-xs leading-relaxed">{pattern.approach}</p>
              <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
                <span className="font-medium">trade-offs:</span> {pattern.tradeOffs}
              </p>
            </article>
          ))}

          <section aria-label="Comparison table" className="bg-card border-border md:col-span-2 xl:col-span-3 overflow-hidden rounded-xl border border-solid">
            <p className="text-muted-foreground border-border/60 border-b border-solid px-4 py-2 font-mono text-[10.5px] uppercase">
              comparison
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Operation</TableHead>
                  <TableHead>Structure</TableHead>
                  <TableHead>Complexity</TableHead>
                  <TableHead>Trade-off</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recommendations.map((rec) => (
                  <TableRow key={rec.id}>
                    <TableCell className="text-foreground text-xs">{rec.operation}</TableCell>
                    <TableCell className="text-xs">
                      <span className="text-foreground font-medium">{rec.dataStructure}</span>
                      <span className="text-muted-foreground block font-mono text-[10.5px]">{rec.algorithm}</span>
                    </TableCell>
                    <TableCell className="text-muted-foreground font-mono text-[10.5px]">
                      {complexityChips(rec.complexity).average}
                      <span className="block">{complexityChips(rec.complexity).worst}</span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">{tradeOffText(rec)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        </section>
      </div>
    </div>
  );
}

function useRecScroll(
  guidedStep?: { id: string; recommendationIds: string[] } | null,
): RefObject<HTMLDivElement | null> {
  const scrollRef = useRef<HTMLDivElement>(null);
  const firstRecId = guidedStep?.recommendationIds[0] ?? null;
  const guidedId = guidedStep?.id ?? null;

  useEffect(() => {
    if (guidedId === null || firstRecId === null) return;
    const card = scrollRef.current?.querySelector(`[data-rec-id="${firstRecId}"]`);
    if (card != null) card.scrollIntoView({ block: "center", behavior: "auto" });
  }, [guidedId, firstRecId]);
  return scrollRef;
}

function CardList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mt-3">
      <p className="text-muted-foreground text-[10px] uppercase">{title}</p>
      <ul className="text-muted-foreground mt-1 list-disc space-y-0.5 pl-4">
        {items.map((item) => (
          <li key={item} className="text-xs leading-relaxed">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
