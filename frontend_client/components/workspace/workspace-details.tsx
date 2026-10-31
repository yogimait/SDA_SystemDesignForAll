"use client";

/**
 * Workspace detail panel: per-selection reference data (class, relationship,
 * pattern) rendered from the canonical model — collapsible reference sections.
 */

import type {
  DesignPattern,
  HldComponent,
  HldConnection,
  HldModel,
  LldClass,
  LldModel,
  LldRelationship,
} from "@sda/contracts";
import { useMemo } from "react";
import { PlayIcon } from "lucide-react";
import {
  Button,
} from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import {
  attributeText,
  methodText,
} from "@/lib/diagram/lld-scene";
import { cn } from "cn";

export type WorkspaceSelection =
  | { type: "class" | "relationship" | "pattern"; id: string }
  | null;

export type HldSelectionRef =
  | { type: "component"; id: string }
  | { type: "connection"; id: string }
  | { type: "flow"; id: string }
  | { type: "scalability"; id: string }
  | { type: "failure"; id: string }
  | { type: "technology"; id: string }
  | null;

const KIND_LABEL: Record<LldClass["kind"], string> = {
  class: "class",
  abstract: "abstract class",
  interface: "interface",
  enum: "enumeration",
  value_object: "value object",
};

const REL_LABEL: Record<LldRelationship["kind"], string> = {
  inheritance: "inherits from",
  realization: "implements",
  association: "associated with",
  aggregation: "aggregates",
  composition: "composed of",
  dependency: "depends on",
};

function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <Collapsible defaultOpen={defaultOpen} className="border-border group last:border-b-0 border-b border-solid">
      <CollapsibleTrigger className="text-muted-foreground hover:text-foreground group/section flex w-full items-center justify-between py-2.5 text-left text-xs font-medium transition-colors">
        {title}
        <ChevronGlyph />
      </CollapsibleTrigger>
      <CollapsibleContent className="pb-3 text-sm leading-relaxed">{children}</CollapsibleContent>
    </Collapsible>
  );
}

function ChevronGlyph() {
  return (
    <svg
      aria-hidden="true"
      width="12"
      height="12"
      viewBox="0 0 16 16"
      className="-rotate-90 group-aria-expanded/section:rotate-0 transition-transform"
    >
      <path d="M4 6 L8 10 L12 6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function RefChips({ refs }: { refs: string[] }) {
  if (refs.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {refs.map((ref) => (
        <span
          key={ref}
          className="text-muted-foreground border-border/60 rounded border border-solid px-1.5 py-0.5 font-mono text-[10.5px]"
        >
          {ref}
        </span>
      ))}
    </div>
  );
}

function RequirementRefs({
  refs,
  labels,
  title,
}: {
  refs: string[];
  labels: Map<string, string>;
  title: string;
}) {
  // Contract ids stay keys; readers see the numbered row ("FR 2").
  const shown = refs
    .map((ref) => labels.get(ref))
    .filter((label): label is string => label !== undefined);
  return (
    <Section title={title}>
      {shown.length === 0 ? (
        <Empty text="No requirement references." />
      ) : (
        <RefChips refs={shown} />
      )}
    </Section>
  );
}

export function WorkspaceDetails({
  model,
  selection,
  requirementLabels,
  className,
}: {
  model: LldModel;
  selection: WorkspaceSelection;
  /** requirement id → numbered label ("FR 2"); ids never render. */
  requirementLabels: Map<string, string>;
  className?: string;
}) {
  const names = useMemo(
    () => new Map(model.classes.map((cls) => [cls.id, cls.name])),
    [model.classes],
  );

  if (selection === null) {
    return (
      <div
        aria-label="Details"
        className={cn("text-muted-foreground p-4 text-sm leading-relaxed", className)}
      >
        Select a class, a relationship edge, or a pattern for its design
        details. Everything here comes from the confirmed architecture.
      </div>
    );
  }

  if (selection.type === "class") {
    const cls = model.classes.find((c) => c.id === selection.id);
    if (cls === undefined) return <Missing />;
    return (
      <div aria-label={`Details for ${cls.name}`} className={cn("text-sm", className)}>
        <PanelHeading
          title={cls.name}
          tag={<Badge className="bg-primary/10 text-primary font-mono">{KIND_LABEL[cls.kind]}</Badge>}
        />
        <Section title="Responsibility">
          <p className="text-foreground/90">{cls.responsibility}</p>
        </Section>
        <Section title="Attributes">
          {cls.attributes.length === 0 ? (
            <Empty text="No attributes." />
          ) : (
            <ul className="space-y-2">
              {cls.attributes.map((attr) => (
                <li key={attr.name}>
                  <p className="text-foreground font-mono text-[11px]">{attributeText(attr)}</p>
                  {attr.description !== "" ? (
                    <p className="text-muted-foreground mt-0.5 text-xs">{attr.description}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Methods">
          {cls.methods.length === 0 ? (
            <Empty text="No methods." />
          ) : (
            <ul className="space-y-2">
              {cls.methods.map((method) => (
                <li key={method.name}>
                  <p className="text-foreground font-mono text-[11px]">{methodText(method)}</p>
                  {method.description !== "" ? (
                    <p className="text-muted-foreground mt-0.5 text-xs">{method.description}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Section>
        {cls.invariants.length > 0 ? (
          <Section title="Invariants">
            <ul className="text-muted-foreground list-disc space-y-1 pl-4">
              {cls.invariants.map((invariant) => (
                <li key={invariant}>{invariant}</li>
              ))}
            </ul>
          </Section>
        ) : null}
        <Section title="Design patterns using this class">
          {model.patterns.filter((p) => p.participantClassIds.includes(cls.id)).length === 0 ? (
            <Empty text="No design patterns include this class." />
          ) : (
            <RefChips
              refs={
                model.patterns
                  .filter((p) => p.participantClassIds.includes(cls.id))
                  .map((p) => p.name)
              }
            />
          )}
        </Section>
        <Section title="Rationale">
          <p className="text-muted-foreground">{cls.rationale}</p>
        </Section>
        {cls.alternatives.length > 0 ? (
          <Section title="Alternatives considered">
            <ul className="space-y-2">
              {cls.alternatives.map((alt) => (
                <li key={alt.option}>
                  <p className="text-foreground text-xs font-medium">{alt.option}</p>
                  <p className="text-muted-foreground mt-0.5 text-xs">not chosen: {alt.rejectedBecause}</p>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}
        <RequirementRefs refs={cls.requirementRefs} labels={requirementLabels} title="Requirement references" />
      </div>
    );
  }

  if (selection.type === "relationship") {
    const rel = model.relationships.find((r) => r.id === selection.id);
    if (rel === undefined) return <Missing />;
    return (
      <div aria-label={`Details for ${names.get(rel.sourceId) ?? "unknown class"} ${REL_LABEL[rel.kind]} ${names.get(rel.targetId) ?? "unknown class"}`} className={cn("text-sm", className)}>
        <PanelHeading
          title={REL_LABEL[rel.kind]}
          tag={
            <Badge className="bg-secondary text-secondary-foreground font-mono">
              {`${names.get(rel.sourceId) ?? rel.sourceId} ${rel.sourceMultiplicity} → ${rel.targetMultiplicity} ${names.get(rel.targetId) ?? rel.targetId}`}
            </Badge>
          }
        />
        {rel.label !== "" ? (
          <Section title="Label">
            <p className="text-foreground/90">{rel.label}</p>
          </Section>
        ) : null}
        <Section title="Rationale">
          <p className="text-muted-foreground">{rel.rationale}</p>
        </Section>
        <Section title="Endpoints">
          <p className="text-muted-foreground font-mono text-[11px]">
            {`${names.get(rel.sourceId) ?? "unknown class"} (${rel.sourceMultiplicity}) → ${
              names.get(rel.targetId) ?? "unknown class"
            } (${rel.targetMultiplicity})`}
          </p>
        </Section>
      </div>
    );
  }

  const pattern = model.patterns.find((p) => p.id === selection.id);
  if (pattern === undefined) return <Missing />;
  return (
    <PatternDetails
      pattern={pattern}
      names={names}
      requirementLabels={requirementLabels}
      className={className}
    />
  );
}

function PatternDetails({
  pattern,
  names,
  requirementLabels,
  className,
}: {
  pattern: DesignPattern;
  names: Map<string, string>;
  requirementLabels: Map<string, string>;
  className?: string;
}) {  return (
    <div aria-label={`Details for pattern ${pattern.name}`} className={cn("text-sm", className)}>
      <PanelHeading
        title={pattern.name}
        tag={<Badge className="bg-secondary text-secondary-foreground font-mono">{pattern.category}</Badge>}
      />
      <Section title="Participants">
        <RefChips refs={pattern.participantClassIds.map((id) => names.get(id) ?? "unknown class")} />
      </Section>
      <Section title="Rationale">
        <p className="text-muted-foreground">{pattern.rationale}</p>
      </Section>
      <Section title="Benefits">
        <ul className="text-muted-foreground list-disc space-y-1 pl-4">
          {pattern.benefits.map((benefit) => (
            <li key={benefit}>{benefit}</li>
          ))}
        </ul>
      </Section>
      <Section title="Drawbacks">
        <ul className="text-muted-foreground list-disc space-y-1 pl-4">
          {pattern.drawbacks.map((drawback) => (
            <li key={drawback}>{drawback}</li>
          ))}
        </ul>
      </Section>
      <Section title="Simpler alternative">
        <p className="text-muted-foreground">{pattern.simplerAlternative}</p>
      </Section>
      <Section title="When unnecessary">
        <p className="text-muted-foreground">{pattern.whenUnnecessary}</p>
      </Section>
      <RequirementRefs
        refs={pattern.requirementRefs}
        labels={requirementLabels}
        title="Requirement references"
      />
    </div>
  );
}

function PanelHeading({ title, tag }: { title: string; tag: React.ReactNode }) {
  return (
    <div className="border-border mb-1 flex items-start justify-between gap-2 border-b border-solid py-3">
      <h2 className="text-foreground text-sm font-semibold tracking-tight">{title}</h2>
      {tag}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-muted-foreground text-xs italic">{text}</p>;
}

function Missing() {
  return (
    <p className="text-muted-foreground p-4 text-sm">
      That element is not part of the current architecture version.
    </p>
  );
}

// ---------------------------------------------------------------------------
// HLD details (F4)
// ---------------------------------------------------------------------------

const CONNECTION_KIND_LABEL: Record<HldConnection["kind"], string> = {
  sync: "sync",
  async: "async",
  data: "data",
};

/**
 * Details for the HLD view: component, connection, flow (with clickable
 * steps that focus their canvas segment), scalability note, failure
 * scenario, or technology decision. Everything renders from schema fields.
 */
export function HldDetails({
  model,
  selection,
  focusedFlow,
  onFlowStepFocus,
  onReplay,
  requirementLabels,
  className,
}: {
  model: HldModel;
  selection: HldSelectionRef;
  /** currently focused flow step, if any */
  focusedFlow: { flowId: string; stepIndex: number } | null;
  onFlowStepFocus: (flowId: string, stepIndex: number | null) => void;
  /** Flow-panel replay trigger (wired by the workspace header state). */
  onReplay?: (flowId: string) => void;
  /** requirement id → numbered label ("FR 2"); ids never render. */
  requirementLabels: Map<string, string>;
  className?: string;
}) {
  const names = useMemo(
    () => new Map(model.components.map((component) => [component.id, component.name])),
    [model.components],
  );

  if (selection === null) {
    return (
      <div
        aria-label="Details"
        className={cn("text-muted-foreground p-4 text-sm leading-relaxed", className)}
      >
        Select a component, a connection, a flow, a scalability note, a failure
        scenario, or a technology decision for its details.
      </div>
    );
  }

  if (selection.type === "component") {
    const component = model.components.find((c) => c.id === selection.id);
    if (component === undefined) return <Missing />;
    return (
      <div aria-label={`Details for ${component.name}`} className={cn("text-sm", className)}>
        <ComponentHeading component={component} />
        <Section title="Responsibility">
          <p className="text-foreground/90">{component.responsibility}</p>
        </Section>
        {component.technology !== "" ? (
          <Section title="Technology">
            <p className="text-foreground font-mono text-[11px]">{component.technology}</p>
          </Section>
        ) : null}
        <Section title="Connections">
          <ConnectionsForComponent model={model} component={component} />
        </Section>
        <Section title="Scaling notes">
          {component.scalingNotes === "" ? (
            <Empty text="No scaling notes for this component." />
          ) : (
            <p className="text-muted-foreground">{component.scalingNotes}</p>
          )}
        </Section>
        <Section title="Requirement references">
          {component.requirementRefs.length === 0 ? (
            <Empty text="No requirement references." />
          ) : (
            <RefChips
              refs={component.requirementRefs
                .map((ref) => requirementLabels.get(ref))
                .filter((label): label is string => label !== undefined)}
            />
          )}
        </Section>
      </div>
    );
  }

  if (selection.type === "connection") {
    const connection = model.connections.find((c) => c.id === selection.id);
    if (connection === undefined) return <Missing />;
    return (
      <div aria-label={`Details for ${connection.label}`} className={cn("text-sm", className)}>
        <PanelHeading
          title={connection.label}
          tag={
            <Badge className="bg-secondary text-secondary-foreground font-mono">
              {CONNECTION_KIND_LABEL[connection.kind]}
            </Badge>
          }
        />
        <Section title="Endpoints">
          <p className="text-muted-foreground font-mono text-[11px]">
            {`${names.get(connection.fromComponentId) ?? "unknown component"} → ${
              names.get(connection.toComponentId) ?? "unknown component"
            }`}
          </p>
        </Section>
        {connection.protocol !== "" ? (
          <Section title="Protocol">
            <p className="text-foreground font-mono text-[11px]">{connection.protocol}</p>
          </Section>
        ) : null}
        <Section title="Rationale">
          <p className="text-muted-foreground">{connection.rationale}</p>
        </Section>
      </div>
    );
  }

  if (selection.type === "flow") {
    const flow = model.flows.find((f) => f.id === selection.id);
    if (flow === undefined) return <Missing />;
    return (
      <div aria-label={`Details for flow ${flow.name}`} className={cn("text-sm", className)}>
        <PanelHeading
          title={flow.name}
          tag={<Badge className="bg-primary/10 text-primary font-mono">flow</Badge>}
        />
        {onReplay !== undefined ? (
          <div className="mt-2 flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onReplay(flow.id)}
            >
              <PlayIcon />
              Replay
            </Button>
          </div>
        ) : null}
        <Section title="Description">
          <p className="text-foreground/90">{flow.description}</p>
        </Section>
        <Section title="Steps">
          <ol className="space-y-1.5">
            {[...flow.steps]
              .sort((a, b) => a.order - b.order)
              .map((step, index) => {
              const focused = focusedFlow?.flowId === flow.id && focusedFlow.stepIndex === index;
              return (
                <li key={step.order}>
                  <button
                    type="button"
                    aria-pressed={focused}
                    onClick={() => onFlowStepFocus(flow.id, focused ? null : index)}
                    className={cn(
                      "focus-visible:ring-ring flex w-full items-start gap-2 rounded-md p-1 text-left text-xs transition-colors focus-visible:ring-2 focus-visible:outline-1",
                      focused ? "bg-primary/10 text-primary" : "text-foreground/85 hover:bg-muted",
                    )}
                  >
                    <span className="text-muted-foreground flex-none font-mono text-[10px]">{step.order}</span>
                    <span>{step.description}</span>
                  </button>
                </li>
              );
            })}
          </ol>
          <p className="text-muted-foreground mt-2 text-[11px]">
            Click a step to highlight only its segment on the canvas.
          </p>
        </Section>
        <Section title="Requirement references">
          {flow.requirementRefs.length === 0 ? (
            <Empty text="No requirement references." />
          ) : (
            <RefChips
              refs={flow.requirementRefs
                .map((ref) => requirementLabels.get(ref))
                .filter((label): label is string => label !== undefined)}
            />
          )}
        </Section>
      </div>
    );
  }

  if (selection.type === "scalability") {
    const note = model.scalabilityNotes.find((n) => n.id === selection.id);
    if (note === undefined) return <Missing />;
    return (
      <div aria-label={`Scaling note: ${note.aspect}`} className={cn("text-sm", className)}>
        <PanelHeading
          title={note.aspect}
          tag={<Badge className="bg-success/10 text-success font-mono">scaling</Badge>}
        />
        <Section title="Approach">
          <p className="text-foreground/90">{note.approach}</p>
        </Section>
        <Section title="Limits">
          <p className="text-muted-foreground">{note.limits}</p>
        </Section>
      </div>
    );
  }

  if (selection.type === "failure") {
    const failure = model.failureScenarios.find((f) => f.id === selection.id);
    if (failure === undefined) return <Missing />;
    return (
      <div aria-label={`Failure scenario: ${failure.condition}`} className={cn("text-sm", className)}>
        <PanelHeading
          title={failure.condition}
          tag={<Badge className="bg-destructive/10 text-destructive font-mono">failure</Badge>}
        />
        <Section title="Impact">
          <p className="text-foreground/90">{failure.impact}</p>
        </Section>
        <Section title="Mitigation">
          <p className="text-foreground/90">{failure.mitigation}</p>
        </Section>
        <Section title="Trade-off">
          <p className="text-muted-foreground">{failure.tradeOff}</p>
        </Section>
      </div>
    );
  }

  const tech = model.technologyDecisions.find((t) => t.id === selection.id);
  if (tech === undefined) return <Missing />;
  return (
    <div aria-label={`Technology decision: ${tech.topic}`} className={cn("text-sm", className)}>
      <PanelHeading
        title={tech.topic}
        tag={<Badge className="bg-secondary text-secondary-foreground font-mono">decision</Badge>}
      />
      <Section title="Choice">
        <p className="text-foreground font-medium">{tech.choice}</p>
      </Section>
      <Section title="Why">
        <p className="text-foreground/90">{tech.why}</p>
      </Section>
      <Section title="Limits">
        <p className="text-muted-foreground">{tech.limits}</p>
      </Section>
      <Section title="Alternatives considered">
        {tech.alternatives.length === 0 ? (
          <Empty text="No alternatives recorded." />
        ) : (
          <ul className="space-y-2">
            {tech.alternatives.map((alt) => (
              <li key={alt.option}>
                <p className="text-foreground text-xs font-medium">{alt.option}</p>
                <p className="text-muted-foreground mt-0.5 text-xs">not chosen: {alt.rejectedBecause}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function ComponentHeading({ component }: { component: HldComponent }) {
  return (
    <PanelHeading
      title={component.name}
      tag={<Badge className="bg-primary/10 text-primary font-mono">{component.type}</Badge>}
    />
  );
}

function ConnectionsForComponent({
  model,
  component,
}: {
  model: HldModel;
  component: HldComponent;
}) {
  const names = new Map(model.components.map((c) => [c.id, c.name]));
  const outgoing = model.connections.filter((c) => c.fromComponentId === component.id);
  const incoming = model.connections.filter((c) => c.toComponentId === component.id);
  if (outgoing.length === 0 && incoming.length === 0) {
    return <Empty text="No connections on this component." />;
  }
  const line = (conn: HldConnection, direction: "→" | "←", otherName: string) => (
    <li key={conn.id}>
      <p className="text-foreground font-mono text-[11px]">
        {`${otherName} ${direction} ${conn.kind}${conn.protocol === "" ? "" : ` · ${conn.protocol}`}`}
      </p>
      <p className="text-muted-foreground mt-0.5 text-xs">{conn.label}</p>
    </li>
  );
  return (
    <ul className="space-y-2">
      {outgoing.map((conn) => line(conn, "→", names.get(conn.toComponentId) ?? "unknown component"))}
      {incoming.map((conn) => line(conn, "←", names.get(conn.fromComponentId) ?? "unknown component"))}
    </ul>
  );
}
