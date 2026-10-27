"use client";

/**
 * Shared SVG diagram canvas (F3). Pan (drag / wheel-anchored zoom / +, -, 0
 * keys), click + keyboard selection of classes and relationships, pattern
 * highlighting, and a shape legend so no-meaning-is-color-only. The scene
 * (nodes/edges geometry) comes precomputed from lib/diagram — this component
 * only draws and interacts.
 */
import { useEffect, useMemo } from "react";
import { MinusIcon, PlusIcon, MaximizeIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import { AnnotationChips, type AnnotationChip } from "@/components/diagram/annotation-chips";
import type { RelationshipKind } from "@sda/contracts";
import { useDiagramViewport } from "@/hooks/use-diagram-viewport";
import { wrapLabel } from "@/lib/diagram/label-wrap";
import {
  KIND_STEREOTYPE,
  MARKER_BY_KIND,
  type LldScene,
} from "@/lib/diagram/lld-scene";

export type DiagramSelection = { type: "class" | "relationship"; id: string } | null;

function polyline(points: Array<{ x: number; y: number }>): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
}

/** Bounding box around the guided step's elements (nodes + edge points), padded. */
export function focusBoundingBox(
  scene: LldScene,
  classIds: Set<string>,
  relationshipIds: Set<string>,
): { x: number; y: number; width: number; height: number } | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let any = false;
  const widen = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    any = true;
  };
  for (const node of scene.nodes) {
    if (!classIds.has(node.id)) continue;
    widen(node.x, node.y);
    widen(node.x + node.width, node.y + node.height);
  }
  for (const edge of scene.edges) {
    if (!relationshipIds.has(edge.id)) continue;
    for (const point of edge.points) widen(point.x, point.y);
  }
  if (!any) return null;
  const pad = 48;
  return {
    x: minX - pad,
    y: minY - pad,
    width: maxX - minX + pad * 2,
    height: maxY - minY + pad * 2,
  };
}

const EDGE_DASH: Partial<Record<RelationshipKind, string>> = {
  realization: "6 3",
  dependency: "4 3",
};

const LEGEND_BY_KIND: Array<{ kind: RelationshipKind; label: string }> = [
  { kind: "inheritance", label: "inherits" },
  { kind: "realization", label: "implements" },
  { kind: "association", label: "association" },
  { kind: "aggregation", label: "aggregation" },
  { kind: "composition", label: "composition" },
  { kind: "dependency", label: "dependency" },
];

export function DiagramCanvas({
  scene,
  selection,
  onSelect,
  highlightClassIds,
  highlightRelationshipIds,
  guidedStep,
  patternNamesByClassId,
  annotationChips,
  onAnnotationSelect,
  className,
}: {
  scene: LldScene;
  selection: DiagramSelection;
  onSelect: (next: DiagramSelection) => void;
  highlightClassIds?: Set<string>;
  highlightRelationshipIds?: Set<string>;
  /** current guided-learning step; the canvas fits focus to its bbox */
  guidedStep?: { id: string; classIds: string[]; relationshipIds: string[] } | null;
  /** class id → names of design patterns the class participates in */
  patternNamesByClassId?: Map<string, string[]>;
  /** narrative annotation chips (Annotate toggle) */
  annotationChips?: AnnotationChip[];
  onAnnotationSelect?: (id: string) => void;
  className?: string;
}) {
  const viewport = useDiagramViewport(scene, () => onSelect(null));
  const { wrapRef, transform, fit, fitToBox, zoomBy } = viewport;

  useEffect(() => {
    if (guidedStep === undefined || guidedStep === null) return;
    const box = focusBoundingBox(
      scene,
      new Set(guidedStep.classIds),
      new Set(guidedStep.relationshipIds),
    );
    if (box !== null) fitToBox(box);
  }, [guidedStep?.id, fitToBox, scene, guidedStep]);

  // ---- drawing ------------------------------------------------------------

  const dimming =
    (highlightClassIds !== undefined && highlightClassIds.size > 0) ||
    (highlightRelationshipIds !== undefined && highlightRelationshipIds.size > 0);

  const markerDefinitions = useMemo(() => (
    <>
      {(["inheritance", "realization"] as const).map((kind) => (
        <marker
          key={kind}
          id={MARKER_BY_KIND[kind]}
          viewBox="0 0 12 10"
          refX="11"
          refY="5"
          markerWidth="12"
          markerHeight="10"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path
            d="M1,1 L11,5 L1,9 Z"
            className="fill-card"
            stroke="var(--foreground)"
            strokeWidth="1.4"
          />
        </marker>
      ))}
      {(["association", "dependency"] as const).map((kind) => (
        <marker
          key={kind}
          id={MARKER_BY_KIND[kind]}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="10"
          markerHeight="10"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path
            d="M1,1 L9,5 L1,9"
            fill="none"
            stroke="var(--foreground)"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </marker>
      ))}
      {(["aggregation", "composition"] as const).map((kind) => (
        <marker
          key={kind}
          id={MARKER_BY_KIND[kind]}
          viewBox="0 0 10 10"
          refX="1"
          refY="5"
          markerWidth="11"
          markerHeight="10"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path
            d="M1,5 L5,1 L9,5 L5,9 Z"
            className={kind === "composition" ? "fill-foreground" : "fill-card"}
            stroke="var(--foreground)"
            strokeWidth="1.4"
          />
        </marker>
      ))}
    </>
  ), []);

  const elementLabel = useMemo(
    () => `${scene.nodes.length} classes, ${scene.edges.length} relationships`,
    [scene.nodes.length, scene.edges.length],
  );

  return (
    <div
      className={cn("bg-card border-border relative flex h-full min-h-0 flex-col rounded-xl border border-solid", className)}
      onKeyDown={viewport.onKeyDown}
    >
      <div
        ref={wrapRef}
        tabIndex={0}
        aria-label={`UML class diagram: ${elementLabel}. Zoom with +, -, 0; Escape clears the selection.`}
        className="focus-visible:ring-ring relative min-h-0 flex-1 overflow-hidden rounded-xl outline-none focus-visible:ring-2"
      >
        <svg
          width="100%"
          height="100%"
          className="block"
          role="group"
          aria-label={elementLabel}
        >
          <title>LLD class diagram</title>
          <desc>UML class boxes with typed relationships. Select any box or line for details.</desc>
          <defs>{markerDefinitions}</defs>

          <rect
            width="100%"
            height="100%"
            className="fill-transparent"
            {...viewport.backgroundHandlers}
          />

          <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.k})`}>
            {scene.edges.map((edge) => {
              const selected = selection !== null && selection.type === "relationship" && selection.id === edge.id;
              const highlighted = highlightRelationshipIds?.has(edge.id) === true;
              const dimmed = dimming && !highlighted && !selected;
              const marker = MARKER_BY_KIND[edge.kind];
              const dash = EDGE_DASH[edge.kind];
              // Label anchored at the true midpoint (dagre's first point is on
              // the source border; an index-based mid sits against a node).
              const firstPoint = edge.points[0];
              const lastPoint = edge.points[edge.points.length - 1];
              const labelPoint =
                firstPoint !== undefined && lastPoint !== undefined
                  ? { x: (firstPoint.x + lastPoint.x) / 2, y: (firstPoint.y + lastPoint.y) / 2 }
                  : firstPoint;
              const fromPoint = edge.points[0];
              const toPoint = edge.points[edge.points.length - 1];

              return (
                <g key={edge.id} opacity={dimmed ? 0.3 : undefined}>
                  <path
                    d={polyline(edge.points)}
                    className="fill-none stroke-transparent"
                    strokeWidth={14}
                    tabIndex={0}
                    role="button"
                    aria-pressed={selected}
                    aria-label={`${edge.kind} relationship ${edge.from} to ${edge.to}`}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        event.stopPropagation();
                        onSelect(selected ? null : { type: "relationship", id: edge.id });
                      }
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelect(selected ? null : { type: "relationship", id: edge.id });
                    }}
                  />
                  <path
                    d={polyline(edge.points)}
                    className={cn("fill-none pointer-events-none", selected ? "stroke-primary" : "stroke-foreground/55")}
                    strokeWidth={selected ? 2.5 : 1.4}
                    strokeDasharray={dash}
                    markerEnd={`url(#${marker})`}
                  />
                  {edge.fromMultiplicity !== "" && fromPoint !== undefined ? (
                    <text
                      x={fromPoint.x}
                      y={fromPoint.y - 6}
                      textAnchor="middle"
                      className="fill-muted-foreground pointer-events-none font-mono text-[10px]"
                      stroke="var(--card)"
                      paintOrder="stroke"
                      strokeWidth={3.5}
                    >
                      {edge.fromMultiplicity}
                    </text>
                  ) : null}
                  {edge.toMultiplicity !== "" && toPoint !== undefined ? (
                    <text
                      x={toPoint.x}
                      y={toPoint.y - 6}
                      textAnchor="middle"
                      className="fill-muted-foreground pointer-events-none font-mono text-[10px]"
                      stroke="var(--card)"
                      paintOrder="stroke"
                      strokeWidth={3.5}
                    >
                      {edge.toMultiplicity}
                    </text>
                  ) : null}
                  {edge.label !== "" && labelPoint !== undefined ? (
                    (() => {
                      // Long labels painted straight bled across neighbouring
                      // nodes — wrap into tspans under the line.
                      const lines = wrapLabel(edge.label, 26, 2);
                      return (
                        <text
                          x={labelPoint.x}
                          y={labelPoint.y + 10}
                          textAnchor="middle"
                          className={cn(
                            "pointer-events-none font-mono text-[10px]",
                            selected ? "fill-primary" : "fill-muted-foreground",
                          )}
                          stroke="var(--card)"
                          paintOrder="stroke"
                          strokeWidth={3.5}
                        >
                          {lines.map((line, index) => (
                            <tspan key={index} x={labelPoint.x} dy={index === 0 ? 0 : 11}>
                              {line}
                            </tspan>
                          ))}
                        </text>
                      );
                    })()
                  ) : null}
                </g>
              );
            })}

            {scene.nodes.map((node) => {
              const selected = selection !== null && selection.type === "class" && selection.id === node.id;
              const highlighted = highlightClassIds?.has(node.id) === true;
              const dimmed = dimming && !highlighted && !selected;
              const stereotype = KIND_STEREOTYPE[node.kind];
              const italic = node.kind === "abstract" || node.kind === "interface";
              const separatorY =
                node.attributeCount > 0 && node.hasMethods
                  ? 40 + node.attributeCount * 18 + 9
                  : null;
              const patternNames = patternNamesByClassId?.get(node.id) ?? [];

              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  tabIndex={0}
                  role="button"
                  aria-pressed={selected}
                  aria-label={`${node.name}${stereotype === "" ? "" : `, ${stereotype}`}${
                    patternNames.length > 0 ? `, design patterns: ${patternNames.join(", ")}` : ""
                  }`}
                  className={dimmed ? "opacity-30" : "group/node"}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      event.stopPropagation();
                      onSelect(selected ? null : { type: "class", id: node.id });
                    }
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelect(selected ? null : { type: "class", id: node.id });
                  }}
                >
                  <rect
                    width={node.width}
                    height={node.height}
                    rx={10}
                    className={cn(
                      "fill-card pointer-events-auto stroke-border transition-shadow",
                      selected && "stroke-primary",
                      selected && "stroke-[2]",
                    )}
                    strokeWidth={selected ? 2 : 1.2}
                  />
                  <rect
                    width={node.width}
                    height={40}
                    rx={10}
                    className={cn(
                      "fill-muted/40 pointer-events-none",
                      selected && "fill-primary/10",
                    )}
                  />
                  {patternNames.length > 0 ? (
                    (() => {
                      // Inside the header (right-anchored): floating above the
              // box collided with edge labels that sit in the same gap.
                      const count = patternNames.length;
                      const first = patternNames[0];
                      // ~96px budget (the scene reserves that name room);
                      // full names stay in the node's aria-label.
                      const shown =
                        first.length > 15 ? `${first.slice(0, 14)}…` : first;
                      const text =
                        count === 1
                          ? `◈ ${shown}`
                          : `◈ ${shown} +${count - 1}`;                      return (
                        <text
                          x={node.width - 8}
                          y={14}
                          textAnchor="end"
                          className="fill-primary pointer-events-none font-mono text-[9px]"
                        >
                          {text}
                        </text>
                      );
                    })()
                  ) : null}
                  {stereotype !== "" ? (
                    <text
                      x={node.width / 2}
                      y={14}
                      textAnchor="middle"
                      className="fill-muted-foreground pointer-events-none font-mono text-[9px]"
                    >
                      {`«${stereotype}»`}
                    </text>
                  ) : null}
                  <text
                    x={node.width / 2}
                    y={stereotype === "" ? 25 : 31}
                    textAnchor="middle"
                    className={cn(
                      "fill-foreground pointer-events-none text-[12.5px] font-semibold",
                      italic && "italic",
                    )}
                  >
                    {node.name}
                  </text>
                  <line
                    x1={0}
                    y1={40}
                    x2={node.width}
                    y2={40}
                    className="stroke-border pointer-events-none"
                    strokeWidth={1}
                  />
                  {separatorY !== null ? (
                    <line
                      x1={0}
                      y1={separatorY}
                      x2={node.width}
                      y2={separatorY}
                      className="stroke-border/70 pointer-events-none"
                      strokeWidth={0.8}
                      strokeDasharray="3 2"
                    />
                  ) : null}
                  {node.memberLines.map((line, index) => {
                    const baseline = 53 + index * 18;
                    return (
                      <text
                        key={`${node.id}-${index}`}
                        x={12}
                        y={baseline}
                        className="fill-foreground/80 pointer-events-none font-mono text-[10.5px]"
                      >
                        {line}
                      </text>
                    );
                  })}
                </g>
              );
            })}
            {annotationChips !== undefined && annotationChips.length > 0 ? (
              <AnnotationChips
                chips={annotationChips}
                onSelect={(id) => onAnnotationSelect?.(id)}
              />
            ) : null}
          </g>
        </svg>

        <div className="bg-card/80 border-border absolute right-3 bottom-3 flex items-center gap-1 rounded-lg border border-solid p-1 shadow-sm backdrop-blur">
          <Button variant="ghost" size="icon-xs" aria-label="Zoom out" onClick={() => zoomBy(0.8)}>
            <MinusIcon />
          </Button>
          <Button variant="ghost" size="icon-xs" aria-label="Fit diagram (key 0)" onClick={fit}>
            <MaximizeIcon />
          </Button>
          <Button variant="ghost" size="icon-xs" aria-label="Zoom in" onClick={() => zoomBy(1.25)}>
            <PlusIcon />
          </Button>
          <span className="text-muted-foreground w-10 text-center font-mono text-[10px]">
            {viewport.zoomPercent}%
          </span>
        </div>
      </div>

      <Legend />
    </div>
  );
}

function Legend() {
  return (
    <ul
      aria-label="Relationship marker legend"
      className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-[11px]"
    >
      {LEGEND_BY_KIND.map(({ kind, label }) => (
        <li key={kind} className="flex items-center gap-1.5">
          <svg width="34" height="12" aria-hidden="true">
            <defs>
              <marker id={`lg-${kind}`} viewBox="0 0 12 10" refX={kind === "aggregation" || kind === "composition" ? "1" : "11"} refY="5" markerWidth="11" markerHeight="10" orient="auto" markerUnits="userSpaceOnUse">
                {kind === "aggregation" || kind === "composition" ? (
                  <path
                    d="M1,5 L5,1 L9,5 L5,9 Z"
                    className={kind === "composition" ? "fill-foreground" : "fill-card"}
                    stroke="var(--foreground)"
                    strokeWidth="1.4"
                  />
                ) : kind === "association" || kind === "dependency" ? (
                  <path d="M3,1 L11,5 L3,9" fill="none" stroke="var(--foreground)" strokeWidth="1.4" />
                ) : (
                  <path d="M2,1 L12,5 L2,9 Z" className="fill-card" stroke="var(--foreground)" strokeWidth="1.4" />
                )}
              </marker>
            </defs>
            <path
              d="M2,6 L28,6"
              className="stroke-foreground/55"
              strokeDasharray={EDGE_DASH[kind]}
              strokeWidth={1.4}
              fill="none"
              markerEnd={kind === "aggregation" || kind === "composition" ? undefined : `url(#lg-${kind})`}
              markerStart={kind === "aggregation" || kind === "composition" ? `url(#lg-${kind})` : undefined}
            />
          </svg>
          <span>{label}</span>
        </li>
      ))}
    </ul>
  );
}
