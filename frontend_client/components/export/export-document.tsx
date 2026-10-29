"use client";

/**
 * Printable architecture document: cover, requirements, HLD/LLD diagrams
 * (rendered by the same scene pipeline as the workspace, statically),
 * DSA tables, learning steps, warnings. Everything derives from contract
 * fields — no invented content. Sections avoid page breaks mid-block; the
 * diagrams fit their fixed print-sized box (see .export-diagram rules).
 */

import { useMemo, useRef } from "react";
import type {
  ArchitectureVersion,
  Project,
} from "@sda/contracts";
import { CircleAlertIcon, DownloadIcon, PrinterIcon } from "lucide-react";
import { DiagramCanvas } from "@/components/diagram/diagram-canvas";
import { HldCanvas } from "@/components/diagram/hld-canvas";
import { WorkspaceDsa } from "@/components/workspace/workspace-dsa";
import { Button } from "@/components/ui/button";
import { buildLldScene } from "@/lib/diagram/lld-scene";
import { buildHldScene } from "@/lib/diagram/hld-scene";
import {
  buildCover,
  clarificationRows,
  documentDate,
  functionalRows,
  learningStepRows,
  nonFunctionalRows,
  warningRows,
} from "@/lib/export/document";
import { downloadSvg, svgFilename } from "@/lib/export/svg";

export function ExportDocument({
  project,
  version,
}: {
  project: Project;
  version: ArchitectureVersion;
}) {
  const hldWrap = useRef<HTMLDivElement>(null);
  const lldWrap = useRef<HTMLDivElement>(null);

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

  const lldScene = useMemo(
    () =>
      buildLldScene(version.model.lld, {
        patternNamesByClassId,
      }),
    [version.model.lld, patternNamesByClassId],
  );
  const hldScene = useMemo(
    () => buildHldScene(version.model.hld),
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
    <article className="export-doc">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-xs">
          {functional.length + nonFunctional.length} requirements ·{" "}
          {version.model.hld.components.length} components ·{" "}
          {version.model.lld.classes.length} classes
        </p>
        <div className="text-right">
          <Button onClick={() => window.print()}>
            <PrinterIcon />
            Print / Save as PDF
          </Button>
          <p className="text-muted-foreground mt-1 text-[11px]">
            Diagrams print fit-to-page. Download the SVG in each design section
            for full resolution.
          </p>
        </div>
      </div>

      {/* Cover */}
      <header className="export-section">
        <p className="font-mono text-xs tracking-wider uppercase">Architecture report</p>
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
            <dd className="font-mono">
              {cover.valid ? "valid" : "invalid"} · {cover.warningCount} warning
              {cover.warningCount === 1 ? "" : "s"}
              {cover.errorCount > 0 ? ` · ${cover.errorCount} errors` : ""}
            </dd>
          </div>
        </dl>
      </header>

      {/* Requirements */}
      <section className="export-section" aria-label="Requirements">
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
                    <span className="text-muted-foreground"> — {row.answer}</span>
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
        <div ref={hldWrap} className="export-diagram" aria-label="HLD diagram for print">
          <HldCanvas scene={hldScene} selection={null} onSelect={() => undefined} />
        </div>
      </section>

      <section className="export-section" aria-label="Components and flows">
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
                  <strong>{flow.name}</strong> — {flow.description}{" "}
                  <span className="text-muted-foreground font-mono text-xs">
                    {flow.steps.length} steps
                  </span>
                </li>
              ))}
            </ol>
          </>
        ) : null}
      </section>

      {/* LLD diagram: its own landscape page, same as HLD. */}
      <section className="export-section export-diagram-page" aria-label="Low-level design">
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
        <div ref={lldWrap} className="export-diagram" aria-label="LLD diagram for print">
          <DiagramCanvas
            scene={lldScene}
            selection={null}
            onSelect={() => undefined}
            patternNamesByClassId={patternNamesByClassId}
            className="pointer-events-none"
          />
        </div>
      </section>

      <section className="export-section" aria-label="Classes and patterns">
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
        {version.model.lld.relationships.length > 0 ? (
          <>
            <h3>Relationships</h3>
            <ul className="export-list">
              {version.model.lld.relationships.map((rel) => (
                <li key={rel.id}>
                  <span className="font-mono text-xs">
                    {rel.sourceMultiplicity} — {rel.kind} → {rel.targetMultiplicity}
                  </span>{" "}
                  {rel.rationale}
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
                  — {pattern.rationale}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>

      {/* DSA */}
      <section className="export-section" aria-label="Data structures and algorithms">
        <h2>Data structures &amp; algorithms</h2>
        <WorkspaceDsa model={version.model} className="export-dsa" />
      </section>

      {/* Learning steps */}
      <section className="export-section" aria-label="Learning steps">
        <h2>Learning steps</h2>
        <ol className="export-list export-numbered">
          {steps.map((step) => (
            <li key={step.id}>
              <strong>{step.title}</strong> — {step.explanation}
            </li>
          ))}
        </ol>
      </section>

      {/* Warnings */}
      {warnings.length > 0 ? (
        <section className="export-section" aria-label="Validation notes">
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

      <footer className="export-section text-muted-foreground border-border mt-8 border-t pt-3 text-xs">
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
