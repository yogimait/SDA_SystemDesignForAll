"use client";

/**
 * Printable architecture document: cover, requirements, HLD/LLD diagrams
 * (rendered by the same scene pipeline as the workspace, statically),
 * DSA tables, learning steps, warnings. Everything derives from contract
 * fields — no invented content. Sections avoid page breaks mid-block; the
 * diagrams fit their fixed print-sized box (see .export-diagram rules).
 */

import { useMemo, useRef, useState } from "react";
import type {
  ArchitectureVersion,
  Project,
} from "@sda/contracts";
import { CircleAlertIcon, DownloadIcon, PrinterIcon } from "lucide-react";
import { DiagramCanvas } from "@/components/diagram/diagram-canvas";
import { HldCanvas } from "@/components/diagram/hld-canvas";
import { SequenceCanvas } from "@/components/diagram/sequence-canvas";
import { WorkspaceDsa } from "@/components/workspace/workspace-dsa";
import { Button } from "@/components/ui/button";
import {
  buildCover,
  clarificationRows,
  documentDate,
  functionalRows,
  learningStepRows,
  nonFunctionalRows,
  relationshipRows,
  warningRows,
} from "@/lib/export/document";
import {
  buildExportHldScene,
  buildExportLldScene,
} from "@/lib/export/orientation";
import { downloadSvg, svgFilename } from "@/lib/export/svg";
import { buildSequenceScene } from "@/lib/diagram/sequence-scene";

export function ExportDocument({
  project,
  version,
}: {
  project: Project;
  version: ArchitectureVersion;
}) {
  const hldWrap = useRef<HTMLDivElement>(null);
  const lldWrap = useRef<HTMLDivElement>(null);
  /** Print scope: the full report, or just the two landscape diagram pages. */
  const [diagramsOnly, setDiagramsOnly] = useState(false);

  const cover = buildCover(project, version);
  const spec = version.model.requirements.spec;
  const functional = functionalRows(spec);
  const nonFunctional = nonFunctionalRows(spec);
  const clarifications = clarificationRows(spec);
  const steps = learningStepRows(version.model);
  const warnings = warningRows(version);

  const patternNamesByClassId = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const pattern of version.model.lld.patterns) {
      for (const classId of pattern.participantClassIds) {
        const names = map.get(classId) ?? [];
        if (!names.includes(pattern.name)) names.push(pattern.name);
        map.set(classId, names);
      }
    }
    return map;
  }, [version.model.lld.patterns]);

  const lld = useMemo(
    () =>
      buildExportLldScene(version.model.lld, {
        patternNamesByClassId,
      }),
    [version.model.lld, patternNamesByClassId],
  );
  const hld = useMemo(
    () => buildExportHldScene(version.model.hld),
    [version.model.hld],
  );
  const lldScene = lld.scene;
  const hldScene = hld.scene;
  const relationships = relationshipRows(version.model.lld);

  /** One compact sequence diagram per flow that resolves to ≥1 message. */
  const sequenceDiagrams = useMemo(
    () =>
      version.model.hld.flows
        .map((flow) => ({ flow, scene: buildSequenceScene(version.model.hld, flow) }))
        .filter((entry) => entry.scene.messages.length > 0),
    [version.model.hld],
  );

  function saveDiagram(
    wrap: HTMLDivElement | null,
    suffix: string,
    size: { width: number; height: number },
  ) {
    const svg = wrap?.querySelector("svg");
    if (svg) downloadSvg(svgFilename(cover.title, suffix), svg as SVGSVGElement, size);
  }

  return (
    <article className="export-doc" data-print-scope={diagramsOnly ? "diagrams" : "full"}>
      <div className="no-print mb-6 flex flex-wrap items-start justify-between gap-3">
        <p className="text-muted-foreground text-xs">
          {functional.length + nonFunctional.length} requirements /{" "}
          {version.model.hld.components.length} components /{" "}
          {version.model.lld.classes.length} classes
        </p>
        <div className="text-right">
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant={diagramsOnly ? "secondary" : "outline"}
              aria-pressed={diagramsOnly}
              onClick={() => setDiagramsOnly((value) => !value)}
            >
              {diagramsOnly ? "HLD + LLD only — on" : "HLD + LLD only"}
            </Button>
            <Button onClick={() => window.print()}>
              <PrinterIcon />
              Print / Save as PDF
            </Button>
          </div>
          <p className="text-muted-foreground mt-1 max-w-[52ch] text-right text-[11px] leading-relaxed">
            {diagramsOnly
              ? "Prints just the two diagram pages (HLD + LLD). In the print dialog enable background graphics; if a page comes out portrait, set Orientation to Landscape. Toggle off for the full report."
              : "Text pages print portrait; diagram pages are tagged A4 landscape. In the print dialog enable background graphics and set Orientation to Landscape if the diagram pages come out portrait. Download an SVG in each design section for full resolution."}
          </p>
        </div>
      </div>

      {/* Cover */}
      <header className="export-section export-text-section">
        <h1 className="mt-1 text-3xl leading-tight font-semibold tracking-tight">
          {cover.title}
        </h1>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{cover.summary}</p>
        <p className="text-foreground/90 border-border/70 mt-4 border-l-2 pl-4 text-sm italic">
          {cover.idea}
        </p>
        <dl className="mt-4 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Version</dt>
            <dd className="font-mono">v{cover.version}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Generated</dt>
            <dd className="font-mono">{documentDate(cover.createdAt)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Requirements confirmed</dt>
            <dd className="font-mono">{documentDate(cover.confirmedAt)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Validation</dt>
            <dd>
              {cover.valid ? "valid" : "invalid"} · {cover.warningCount} warning
              {cover.warningCount === 1 ? "" : "s"}
              {cover.errorCount > 0 ? ` · ${cover.errorCount} errors` : ""}
            </dd>
          </div>
        </dl>
      </header>

      {/* Requirements */}
      <section className="export-section export-text-section" aria-label="Requirements">
        <h2>Requirements</h2>
        <RequirementList rows={functional} title="Functional" />
        {nonFunctional.length > 0 ? (
          <RequirementList rows={nonFunctional} title="Non-functional" />
        ) : null}
        {clarifications.length > 0 ? (
          <>
            <h3>Clarifications</h3>
            <ol className="export-list export-numbered">
              {clarifications.map((row) => (
                <li key={row.id}>
                  {row.question}
                  {row.answer !== "" ? (
                    <span className="text-muted-foreground">: {row.answer}</span>
                  ) : null}
                </li>
              ))}
            </ol>
          </>
        ) : null}
        {spec.assumptions.length > 0 ? (
          <>
            <h3>Assumptions</h3>
            <ol className="export-list export-numbered">
              {spec.assumptions.map((row) => (
                <li key={row.id}>{row.text}</li>
              ))}
            </ol>
          </>
        ) : null}
      </section>

      {/* HLD diagram: prints on its own landscape page (see .export-diagram-page) */}
      <section className="export-section export-diagram-page" aria-label="High-level design">
        <div className="flex items-center justify-between gap-3">
          <h2>High-level design</h2>
          <Button
            variant="outline"
            size="sm"
            className="no-print"
            onClick={() =>
              saveDiagram(hldWrap.current, "hld", {
                width: hldScene.width,
                height: hldScene.height,
              })
            }
          >
            <DownloadIcon />
            SVG
          </Button>
        </div>
        <div
          ref={hldWrap}
          className="export-diagram"
          aria-label="HLD diagram for print"
          data-rankdir={hld.rankdir}
          data-scene={`${hldScene.width}x${hldScene.height}`}
        >
          <HldCanvas scene={hldScene} selection={null} onSelect={() => undefined} />
        </div>
      </section>

      <section className="export-section export-text-section" aria-label="Components and flows">
        <h2>Components</h2>
        <dl className="export-defs">
          {version.model.hld.components.map((component) => (
            <div key={component.id}>
              <dt>
                {component.name}{" "}
                <span className="text-muted-foreground font-mono text-xs">
                  {component.type}
                  {component.technology !== "" ? ` · ${component.technology}` : ""}
                </span>
              </dt>
              <dd>{component.responsibility}</dd>
            </div>
          ))}
        </dl>
        {version.model.hld.flows.length > 0 ? (
          <>
            <h3>Flows</h3>
            <ol className="export-list">
              {version.model.hld.flows.map((flow) => (
                <li key={flow.id}>
                  <strong>{flow.name}</strong>: {flow.description}{" "}
                  <span className="text-muted-foreground text-xs">
                    {flow.steps.length} steps
                  </span>
                </li>
              ))}
            </ol>
          </>
        ) : null}
      </section>

      {/* Sequence diagrams: one compact SVG per resolvable flow, flowing with
          the portrait text pages (never a named page of its own). The section
          disappears entirely when no flow step resolves to a component. */}
      {sequenceDiagrams.length > 0 ? (
        <section
          className="export-section export-sequence-section export-text-section"
          aria-label="Sequence diagrams"
        >
          <h2>Sequence diagrams</h2>
          <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
            Arrows derive from each step&apos;s element references (solid sync · dashed async ·
            dotted data when a connection resolves); steps that name no known component are
            skipped. When a step names only components, the first listed ref is the sender.
          </p>
          {sequenceDiagrams.map(({ flow, scene }) => {
            const nameById = new Map(scene.participants.map((p) => [p.id, p.name]));
            // Participants always cover the messages (scene invariant); the
            // fallback never prints a raw contract id.
            const nameOf = (id: string) => nameById.get(id) ?? "unknown";
            return (
              <div key={flow.id}>
                {/* The figure holds only the drawing + caption so it always
                    fits one portrait page unbroken (≤ ~190mm: native svg
                    capped at 170mm + heading); the full step list below it
                    stays breakable text that can paginate. */}
                <figure className="export-sequence">
                  <h3>{flow.name}</h3>
                  <p className="text-muted-foreground text-xs">{flow.description}</p>
                  <SequenceCanvas scene={scene} flowName={flow.name} />
                  <figcaption className="export-sequence-caption">
                    {scene.messages.length} of {flow.steps.length} step
                    {flow.steps.length === 1 ? "" : "s"} shown · derived from step references
                    {scene.messages.length < flow.steps.length
                      ? "; unresolved steps skipped"
                      : ""}
                    .
                  </figcaption>
                </figure>
                {/* Full, untruncated steps as text: the SVG labels are
                    clamped to their arrow span, and role="img" children are
                    presentational for screen readers and print. */}
                <ol
                  className="export-list"
                  aria-label={`Steps of ${flow.name}`}
                >
                  {scene.messages.map((message) => (
                    <li key={`${message.stepOrder}-${message.from}-${message.to}`}>
                      {`${message.stepOrder}. ${nameOf(message.from)} -> ${nameOf(
                        message.to,
                      )}: ${message.label}`}
                    </li>
                  ))}
                </ol>
              </div>
            );
          })}
        </section>
      ) : null}

      {/* LLD diagram: its own landscape page, same as HLD. */}
      <section className="export-section export-diagram-page export-print-end" aria-label="Low-level design">
        <div className="flex items-center justify-between gap-3">
          <h2>Low-level design</h2>
          <Button
            variant="outline"
            size="sm"
            className="no-print"
            onClick={() =>
              saveDiagram(lldWrap.current, "lld", {
                width: lldScene.width,
                height: lldScene.height,
              })
            }
          >
            <DownloadIcon />
            SVG
          </Button>
        </div>
        <div
          ref={lldWrap}
          className="export-diagram"
          aria-label="LLD diagram for print"
          data-rankdir={lld.rankdir}
          data-scene={`${lldScene.width}x${lldScene.height}`}
        >
          <DiagramCanvas
            scene={lldScene}
            selection={null}
            onSelect={() => undefined}
            patternNamesByClassId={patternNamesByClassId}
            className="pointer-events-none"
          />
        </div>
      </section>

      <section className="export-section export-text-section" aria-label="Classes and patterns">
        <h2>Classes</h2>
        <dl className="export-defs">
          {version.model.lld.classes.map((cls) => (
            <div key={cls.id}>
              <dt>
                {cls.name} <span className="text-muted-foreground font-mono text-xs">{cls.kind}</span>
              </dt>
              <dd>{cls.responsibility}</dd>
            </div>
          ))}
        </dl>
        {relationships.length > 0 ? (
          <>
            <h3>Relationships</h3>
            <ul className="export-list">
              {relationships.map((row) => (
                <li key={row.id}>
                  <span className="font-mono text-xs">
                    {row.sourceName} → {row.targetName}
                  </span>{" "}
                  <span className="text-muted-foreground font-mono text-xs">
                    {row.kind} · {row.sourceMultiplicity} → {row.targetMultiplicity}
                  </span>{" "}
                  {row.rationale}
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {version.model.lld.patterns.length > 0 ? (
          <>
            <h3>Design patterns</h3>
            <ul className="export-list">
              {version.model.lld.patterns.map((pattern) => (
                <li key={pattern.id}>
                  <strong>{pattern.name}</strong>{" "}
                  <span className="text-muted-foreground font-mono text-xs">
                    {pattern.category}
                  </span>{" "}
                  : {pattern.rationale}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>

      {/* DSA */}
      <section className="export-section export-text-section" aria-label="Data structures and algorithms">
        <h2>Data structures &amp; algorithms</h2>
        <WorkspaceDsa model={version.model} className="export-dsa" />
      </section>

      {/* Learning steps */}
      <section className="export-section export-text-section" aria-label="Learning steps">
        <h2>Learning steps</h2>
        <ol className="export-list export-numbered">
          {steps.map((step) => (
            <li key={step.id}>
              <strong>{step.title}</strong>: {step.explanation}
            </li>
          ))}
        </ol>
      </section>

      {/* Warnings */}
      {warnings.length > 0 ? (
        <section className="export-section export-text-section" aria-label="Validation notes">
          <h2>
            <CircleAlertIcon className="inline size-4" aria-hidden="true" /> Validation notes
          </h2>
          <ul className="export-list">
            {warnings.map((issue) => (
              <li key={`${issue.rule}-${issue.path}-${issue.message}`}>
                <span
                  className={`font-mono text-xs ${issue.severity === "error" ? "text-destructive" : ""}`}
                >
                  {issue.severity}:
                </span>{" "}
                {issue.message}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <footer className="export-section export-text-section text-muted-foreground border-border mt-8 border-t pt-3 text-xs">
        System Design All-in-One · {cover.title} · v{cover.version} ·{" "}
        {documentDate(cover.createdAt)}
      </footer>
    </article>
  );
}

function RequirementList({
  rows,
  title,
}: {
  rows: Array<{ id: string; text: string; priority: string; meta: string }>;
  title: string;
}) {
  return (
    <>
      <h3>{title}</h3>
      <ol className="export-list export-numbered">
        {rows.map((row) => (
          <li key={row.id}>
            {row.text}{" "}
            <span className="text-muted-foreground text-xs">
              [{row.priority} · {row.meta}]
            </span>
          </li>
        ))}
      </ol>
    </>
  );
}
