"use client";

/**
 * HLD canvas (F4): component boxes per type (icon + text chip, single
 * palette), directional labeled edges with sync/async/data line styles, flow
 * step-order badges, and a legend so no-meaning-is-color-only. Pan/zoom and
 * selection mechanics are shared with the LLD canvas (use-diagram-viewport).
 */
import { useEffect, useMemo } from "react";
import {
  ArrowLeftRightIcon,
  BoxIcon,
  CogIcon,
  DatabaseIcon,
  GlobeIcon,
  GaugeIcon,
  KeyRoundIcon,
  MailIcon,
  MaximizeIcon,
  MinusIcon,
  MonitorIcon,
  PlusIcon,
  RadioIcon,
  ScaleIcon,
  SearchIcon,
  WaypointsIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import type { ComponentType, ConnectionKind } from "@sda/contracts";
import { useDiagramViewport } from "@/hooks/use-diagram-viewport";
import {
  HLD_EDGE_DASH,
  HLD_MARKER_BY_KIND,
  hldFocusBoundingBox,
  type HldScene,
} from "@/lib/diagram/hld-scene";

export type HldSelection = { type: "component" | "connection"; id: string } | null;

const GLYPHS: Record<ComponentType, LucideIcon> = {
  client: MonitorIcon,
  gateway: WaypointsIcon,
  service: BoxIcon,
  store: DatabaseIcon,
  cache: ZapIcon,
  broker: RadioIcon,
  worker: CogIcon,
  external: GlobeIcon,
  observability: GaugeIcon,
};

/**
 * Keyword → glyph refinements layered over the type icon: the canonical
 * `type` enum has no load-balancer/proxy/etc. variants, so recognizable
 * roles named in `name`/`technology` get their own icon. First match wins.
 */
const KEYWORD_GLYPHS: Array<[RegExp, LucideIcon]> = [
  [/load balancer|balancer/, ScaleIcon],
  [/\b(proxy|reverse proxy|gateway agent)\b/, ArrowLeftRightIcon],
  [/\b(auth|identity|sso|oauth)\b/, KeyRoundIcon],
  [/\b(search|index(er)?|elasticsearch|opensearch)\b/, SearchIcon],
  [/\b(mail|email|smtp)\b/, MailIcon],
  [/\b(cdn|edge|cache)\b/, ZapIcon],
  [/\b(notification|alert|push)\b/, RadioIcon],
];

function pickGlyph(node: { name: string; technology: string; type: ComponentType }): LucideIcon {
  const haystack = `${node.name} ${node.technology}`.toLowerCase();
  for (const [pattern, glyph] of KEYWORD_GLYPHS) {
    if (pattern.test(haystack)) return glyph;
  }
  return GLYPHS[node.type];
}

const KIND_LABEL: Record<ConnectionKind, string> = {
  sync: "sync call",
  async: "async event",
  data: "data flow",
};

function polyline(points: Array<{ x: number; y: number }>): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
}

export function HldCanvas({
  scene,
  selection,
  onSelect,
  highlightComponentIds,
  highlightConnectionIds,
  /** element id → step order number, rendered as a badge while a flow is active */
  stepOrder,
  guidedStep,
  className,
}: {
  scene: HldScene;
  selection: HldSelection;
  onSelect: (next: HldSelection) => void;
  highlightComponentIds?: Set<string>;
  highlightConnectionIds?: Set<string>;
  stepOrder?: Map<string, number>;
  /** current guided-learning step; the canvas fits focus to its bbox */
  guidedStep?: { id: string; componentIds: string[]; connectionIds: string[] } | null;
  className?: string;
}) {
  const viewport = useDiagramViewport(scene, () => onSelect(null));
  const { wrapRef, transform, fit, fitToBox, zoomBy } = viewport;

  useEffect(() => {
    if (guidedStep === undefined || guidedStep === null) return;
    const box = hldFocusBoundingBox(
      scene,
      new Set(guidedStep.componentIds),
      new Set(guidedStep.connectionIds),
    );
    if (box !== null) fitToBox(box);
  }, [guidedStep?.id, fitToBox, scene, guidedStep]);

  const dimming =
    (highlightComponentIds !== undefined && highlightComponentIds.size > 0) ||
    (highlightConnectionIds !== undefined && highlightConnectionIds.size > 0);

  const elementLabel = useMemo(
    () => `${scene.nodes.length} components, ${scene.edges.length} connections`,
    [scene.nodes.length, scene.edges.length],
  );

  return (
    <div
      className={cn(
        "bg-card border-border relative flex h-full min-h-0 flex-col rounded-xl border border-solid",
        className,
      )}
      onKeyDown={viewport.onKeyDown}
    >
      <div
        ref={wrapRef}
        tabIndex={0}
        aria-label={`System diagram: ${elementLabel}. Zoom with +, -, 0; Escape clears the selection.`}
        className="focus-visible:ring-ring relative min-h-0 flex-1 overflow-hidden rounded-xl outline-none focus-visible:ring-2"
      >
        <svg width="100%" height="100%" className="block" role="group" aria-label={elementLabel}>
          <title>HLD system diagram</title>
          <desc>
            Components with typed connections; solid lines are sync calls, long dashes async
            events, short dashes data flows. Select any box or line for details.
          </desc>
          <defs>
            {(Object.keys(HLD_MARKER_BY_KIND) as Array<ConnectionKind>).map((kind) => (
              <marker
                key={kind}
                id={HLD_MARKER_BY_KIND[kind]}
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
          </defs>

          <rect width="100%" height="100%" className="fill-transparent" {...viewport.backgroundHandlers} />

          <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.k})`}>
            {scene.edges.map((edge) => {
              const selected =
                selection !== null && selection.type === "connection" && selection.id === edge.id;
              const highlighted = highlightConnectionIds?.has(edge.id) === true;
              const dimmed = dimming && !highlighted && !selected;

              return (
                <g key={edge.id} opacity={dimmed ? 0.3 : undefined}>
                  <path
                    d={polyline(edge.points)}
                    className="fill-none stroke-transparent"
                    strokeWidth={14}
                    tabIndex={0}
                    role="button"
                    aria-pressed={selected}
                    aria-label={`${KIND_LABEL[edge.kind]}: ${edge.from} to ${edge.to}, ${edge.label}`}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        event.stopPropagation();
                        onSelect(selected ? null : { type: "connection", id: edge.id });
                      }
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelect(selected ? null : { type: "connection", id: edge.id });
                    }}
                  />
                  <path
                    d={polyline(edge.points)}
                    className={cn(
                      "fill-none pointer-events-none",
                      selected ? "stroke-primary" : "stroke-foreground/55",
                    )}
                    strokeWidth={selected ? 2.5 : 1.4}
                    strokeDasharray={HLD_EDGE_DASH[edge.kind]}
                    markerEnd={`url(#${HLD_MARKER_BY_KIND[edge.kind]})`}
                  />
                </g>
              );
            })}

            {scene.nodes.map((node) => {
              const selected =
                selection !== null && selection.type === "component" && selection.id === node.id;
              const highlighted = highlightComponentIds?.has(node.id) === true;
              const dimmed = dimming && !highlighted && !selected;
              const Glyph = pickGlyph(node);
              const step = stepOrder?.get(node.id);
              const stepNumber = step === undefined ? null : step;
              const techBaseline = node.height - 10;

              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  tabIndex={0}
                  role="button"
                  aria-pressed={selected}
                  aria-label={`${node.name}, ${node.type}${node.technology === "" ? "" : `, ${node.technology}`}`}
                  className={dimmed ? "opacity-30" : undefined}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      event.stopPropagation();
                      onSelect(selected ? null : { type: "component", id: node.id });
                    }
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelect(selected ? null : { type: "component", id: node.id });
                  }}
                >
                  <rect
                    width={node.width}
                    height={node.height}
                    rx={10}
                    className={cn(
                      "fill-card pointer-events-auto stroke-border",
                      selected && "stroke-primary",
                    )}
                    strokeWidth={selected ? 2 : 1.2}
                  />
                  <Glyph
                    x={12}
                    y={9}
                    width={12}
                    height={12}
                    className={cn("pointer-events-none", selected ? "text-primary" : "text-muted-foreground")}
                  />
                  <text
                    x={28}
                    y={19}
                    className="fill-muted-foreground pointer-events-none font-mono text-[8.5px] uppercase"
                  >
                    {node.type}
                  </text>
                  <text
                    x={14}
                    y={42}
                    className="fill-foreground pointer-events-none text-[12.5px] font-semibold"
                  >
                    {node.name}
                  </text>
                  {node.technology !== "" ? (
                    <text
                      x={14}
                      y={techBaseline}
                      className="fill-muted-foreground pointer-events-none font-mono text-[10px] italic"
                    >
                      {node.technology}
                    </text>
                  ) : null}
                  {stepNumber !== null ? (
                    <g className="pointer-events-none">
                      <circle cx={node.width - 10} cy={10} r={8} className="fill-primary" />
                      <text
                        x={node.width - 10}
                        y={13.5}
                        textAnchor="middle"
                        className="fill-primary-foreground text-[9.5px] font-semibold"
                      >
                        {stepNumber}
                      </text>
                    </g>
                  ) : null}
                </g>
              );
            })}

            {/* Edge labels paint after the nodes: long labels otherwise vanish
                behind the opaque node cards (label halo included). */}
            {scene.edges.map((edge) => {
              const selected =
                selection !== null && selection.type === "connection" && selection.id === edge.id;
              const highlighted = highlightConnectionIds?.has(edge.id) === true;
              const dimmed = dimming && !highlighted && !selected;
              const mid =
                edge.points[Math.max(0, Math.floor(edge.points.length / 2) - 1)] ??
                edge.points[0];
              if (mid === undefined) return null;
              const step = stepOrder?.get(edge.id);
              const labelText =
                edge.protocol === "" ? edge.label : `${edge.label} · ${edge.protocol}`;
              return (
                <g
                  key={`${edge.id}-label`}
                  opacity={dimmed ? 0.3 : undefined}
                  className="pointer-events-none"
                >
                  <text
                    x={mid.x}
                    y={mid.y + 13}
                    textAnchor="middle"
                    className={cn(
                      "font-mono text-[10px]",
                      selected ? "fill-primary" : "fill-muted-foreground",
                    )}
                    stroke="var(--card)"
                    paintOrder="stroke"
                    strokeWidth={3.5}
                  >
                    {labelText}
                  </text>
                  {step !== undefined ? (
                    <g>
                      <circle cx={mid.x} cy={mid.y - 10} r={8} className="fill-primary" />
                      <text
                        x={mid.x}
                        y={mid.y - 6.5}
                        textAnchor="middle"
                        className="fill-primary-foreground text-[9.5px] font-semibold"
                      >
                        {step}
                      </text>
                    </g>
                  ) : null}
                </g>
              );
            })}
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

      <HldLegend />
    </div>
  );
}

function HldLegend() {
  const kinds: Array<{ kind: ConnectionKind; label: string }> = [
    { kind: "sync", label: "sync call" },
    { kind: "async", label: "async event" },
    { kind: "data", label: "data flow" },
  ];
  return (
    <div className="border-border border-t border-solid">
      <ul
        aria-label="Connection style legend"
        className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 px-4 pt-2 text-[11px]"
      >
        {kinds.map(({ kind, label }) => (
          <li key={kind} className="flex items-center gap-1.5">
            <svg width="30" height="10" aria-hidden="true">
              <path
                d="M2,5 L28,5"
                className="stroke-foreground/55"
                strokeDasharray={HLD_EDGE_DASH[kind]}
                strokeWidth={1.4}
                fill="none"
                markerEnd={`url(#${HLD_MARKER_BY_KIND[kind]})`}
              />
            </svg>
            <span>{label}</span>
          </li>
        ))}
      </ul>
      <ul
        aria-label="Component type legend"
        className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-[11px]"
      >
        {(Object.keys(GLYPHS) as Array<ComponentType>).map((type) => {
          const Glyph = GLYPHS[type];
          return (
            <li key={type} className="flex items-center gap-1">
              <Glyph className="size-3" aria-hidden="true" />
              <span>{type}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
