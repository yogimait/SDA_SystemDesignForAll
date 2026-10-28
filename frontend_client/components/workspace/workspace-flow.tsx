"use client";

/**
 * Workspace shell (F3/F4): access gate → project + architecture queries →
 * header (validation badge, regenerate menu, provider dialog) → view tabs
 * (LLD diagram / HLD system view / DSA cards) over a resizable layout.
 * Selection state is kept per tab; guided mode lands in F5.
 */
import {
  GetArchitectureResponseSchema,
  ProjectSchema,
  StartRunResponseSchema,
  type ArchitectureModel,
  type GenerationOptions,
  type RegenerateScope,
  type ValidationReport,
} from "@sda/contracts";
import { ChevronLeftIcon, ChevronRightIcon, DownloadIcon, GraduationCapIcon, ListChecksIcon, PanelRightCloseIcon, PanelRightOpenIcon, RefreshCcwIcon, TagsIcon, XIcon } from "lucide-react";
import { JourneyShell, type JourneyStage } from "@/components/journey-shell";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DiagramCanvas, type DiagramSelection } from "@/components/diagram/diagram-canvas";
import { HldCanvas } from "@/components/diagram/hld-canvas";
import { ReplayBar } from "@/components/diagram/replay-bar";
import { ProviderDialog } from "@/components/landing/provider-dialog";
import { RunProgress } from "@/components/requirements/run-progress";
import { WorkspaceDsa } from "@/components/workspace/workspace-dsa";
import {
  HldDetails,
  type HldSelectionRef,
  WorkspaceDetails,
  type WorkspaceSelection,
} from "@/components/workspace/workspace-details";
import {
  WorkspaceSidebar,
  type SidebarGroup,
} from "@/components/workspace/workspace-sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useGenerationRun,
  useRunTerminalEffect,
} from "@/hooks/use-generation-run";
import { apiFetch, ApiError } from "@/lib/api/client";
import {
  dsaGuidedSteps,
  guidedStepsInScope,
  type DsaStepFocus,
  type GuidedScope,
  type GuidedStep,
  type HldStepFocus,
  type LldStepFocus,
} from "@/lib/diagram/guided";
import {
  buildLldScene,
  relatedElements,
  type LldScene,
} from "@/lib/diagram/lld-scene";
import {
  buildHldScene,
  flowHighlight,
  hldAdjacency,
  type HldScene,
} from "@/lib/diagram/hld-scene";
import { queryKeys } from "@/lib/query-keys";
import {
  loadProjectAccessKey,
  loadProviderSetup,
} from "@/lib/session/keys";
import { loadSession } from "@/lib/session/auth";
import { cn } from "cn";

const KIND_CHIP: Record<string, string> = {
  class: "cls",
  abstract: "abs",
  interface: "intf",
  enum: "enum",
  value_object: "vo",
};

const REGEN_LABEL: Record<RegenerateScope, string> = {
  lld: "LLD only (classes and relationships)",
  hld: "HLD only (reuse unaffected sections)",
  dsa: "DSA only (data-structure choices)",
};

const NO_GUIDED_STEPS: {
  lld: LldStepFocus[];
  hld: HldStepFocus[];
  dsa: DsaStepFocus[];
} = { lld: [], hld: [], dsa: [] };

/** sessionStorage key for a view's guided cursor; LLD keeps its pre-F6 name. */
function guidedStorageKey(scope: GuidedScope, projectId: string): string {
  return scope === "lld" ? `sda:guided:${projectId}` : `sda:guided:${scope}:${projectId}`;
}

export function WorkspaceFlow({ projectId }: { projectId: string }) {
  const [projectKey, setProjectKey] = useState<string | null>(null);
  const [noAccessKey, setNoAccessKey] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [activeView, setActiveView] = useState<GuidedScope>("lld");
  const [focusMode, setFocusMode] = useState(false);
  const [lldSelection, setLldSelection] = useState<WorkspaceSelection>(null);
  const [hldSelection, setHldSelection] = useState<HldSelectionRef>(null);
  const [lldSearch, setLldSearch] = useState("");
  const [hldSearch, setHldSearch] = useState("");
  const [flowFocus, setFlowFocus] = useState<{ flowId: string; stepIndex: number } | null>(null);
  const [guided, setGuided] = useState(false);
  const [guidedCursors, setGuidedCursors] = useState<Record<GuidedScope, number>>({
    lld: 0,
    hld: 0,
    dsa: 0,
  });
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Responsive breakpoints (F6): ≥1024 keeps the three resizable regions;
  // 768–1023 keeps the outline inline and moves details into a drawer;
  // <768 stacks — diagram first, outline/details as sheets.
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const isPhone = useMediaQuery("(max-width: 767px)");
  const [regenRunId, setRegenRunId] = useState<string | null>(null);
  const [regenScope, setRegenScope] = useState<RegenerateScope>("lld");
  const [regenError, setRegenError] = useState<{ user: string; detail: string } | null>(null);
  /** Annotate toggle: narrative chips anchored to highlighted elements. */
  const [annotateOn, setAnnotateOn] = useState(false);
  /** Flow path replay (HLD): step index inside the selected flow. */
  const [replay, setReplay] = useState<{
    flowId: string;
    stepIndex: number;
    playing: boolean;
    speed: number;
  } | null>(null);
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  const closeRegen = useCallback(() => setRegenRunId(null), []);

  // Annotate toggle: persisted per project so it survives tab switches and
  // refreshes (restore inside the access gate, like guided-mode resume).
  useEffect(() => {
    void (async () => {
      const raw = window.sessionStorage.getItem(`sda:annotate:${projectId}`);
      if (raw === "1") setAnnotateOn(true);
    })();
  }, [projectId]);
  useEffect(() => {
    window.sessionStorage.setItem(`sda:annotate:${projectId}`, annotateOn ? "1" : "0");
  }, [annotateOn, projectId]);

  // Replay validity is derived at render: any change of selection or guided
  // mode stops the replay without effect juggling. While replaying, the
  // flow-step focus comes from the replay itself (the manual focus state
  // stays untouched and returns when replay ends).
  const replayValid =
    replay !== null &&
    !guided &&
    hldSelection !== null &&
    hldSelection.type === "flow" &&
    hldSelection.id === replay.flowId;
  const effectiveFlowFocus = useMemo(
    () =>
      replayValid && replay !== null
        ? { flowId: replay.flowId, stepIndex: replay.stepIndex }
        : flowFocus,
    [replayValid, replay, flowFocus],
  );

  /** Chips → the existing details popover (selection is the single source). */
  const selectAnnotation = useCallback((id: string) => {
    if (id.startsWith("cmp_")) setHldSelection({ type: "component", id });
    else if (id.startsWith("conn_")) setHldSelection({ type: "connection", id });
    else if (id.startsWith("cls_")) setLldSelection({ type: "class", id });
    else if (id.startsWith("rel_")) setLldSelection({ type: "relationship", id });
  }, []);

  // Desktop details pane: floats over the canvas while an element is
  // selected (LLD/HLD only); closing it clears the selection — one source
  // of truth, no effect juggling.
  const activeSelectionId =
    activeView === "lld"
      ? (lldSelection?.id ?? null)
      : activeView === "hld"
        ? (hldSelection?.id ?? null)
        : null;

  // Access gate once per mount, same pattern as the requirements page. An
  // owner without the creator's tab key goes through with their Bearer.
  useEffect(() => {
    void (async () => {
      const key = loadProjectAccessKey(projectId);
      if (key === null && loadSession() === null) {
        setNoAccessKey(true);
        return;
      }
      setProjectKey(key);
      setAuthed(loadSession() !== null);
      // Guided-mode resume (per view): mid-session refresh restarts at each
      // saved cursor and reopens the last view that had one. Only a stored
      // cursor enables resume — a plain workspace load never auto-starts.
      const next = { lld: 0, hld: 0, dsa: 0 };
      let resumed: GuidedScope | null = null;
      for (const scope of ["lld", "hld", "dsa"] as const) {
        const saved = window.sessionStorage.getItem(guidedStorageKey(scope, projectId));
        if (saved === null) continue;
        const parsed = Number(saved);
        if (Number.isInteger(parsed) && parsed >= 0) {
          next[scope] = parsed;
          resumed = scope;
        }
      }
      if (resumed !== null) {
        setGuidedCursors(next);
        setActiveView(resumed);
        setGuided(true);
      }
    })();
  }, [projectId]);

  const project = useQuery({
    queryKey: queryKeys.project(projectId),
    enabled: projectKey !== null || authed,
    queryFn: () =>
      apiFetch(`/api/projects/${projectId}`, {
        projectKey: projectKey ?? undefined,
        auth: loadSession() !== null,
        dataSchema: ProjectSchema,
      }),
  });

  const architecture = useQuery({
    queryKey: queryKeys.architecture(projectId),
    enabled: projectKey !== null || authed,
    queryFn: () =>
      apiFetch(`/api/projects/${projectId}/architecture`, {
        projectKey: projectKey ?? undefined,
        auth: loadSession() !== null,
        dataSchema: GetArchitectureResponseSchema,
      }),
  });

  const version = architecture.data?.version ?? null;
  const model: ArchitectureModel | null = version?.model ?? null;

  /** Canvas pattern chips: class id → participating pattern names (deduped). */
  const patternNamesByClassId = useMemo(() => {
    const map = new Map<string, string[]>();
    if (model === null) return map;
    for (const pattern of model.lld.patterns) {
      for (const classId of pattern.participantClassIds) {
        const names = map.get(classId) ?? [];
        if (!names.includes(pattern.name)) names.push(pattern.name);
        map.set(classId, names);
      }
    }
    return map;
  }, [model]);

  const lldScene = useMemo(
    () =>
      model === null
        ? null
        : buildLldScene(model.lld, { patternNamesByClassId }),
    [model, patternNamesByClassId],
  );
  const hldScene = useMemo(() => (model === null ? null : buildHldScene(model.hld)), [model]);

  // Guided sequences per view (F6): learningSteps filtered to the refs each
  // view can highlight; DSA derives a per-recommendation walkthrough when the
  // model has no dsa_-scoped steps.
  const guidedSeqs = useMemo(
    () =>
      model === null
        ? null
        : {
            lld: guidedStepsInScope(model.learningSteps, "lld"),
            hld: guidedStepsInScope(model.learningSteps, "hld"),
            dsa: dsaGuidedSteps(model.learningSteps, model.dsa),
          },
    [model],
  );
  const { lld: lldSeq, hld: hldSeq, dsa: dsaSeq } = guidedSeqs ?? NO_GUIDED_STEPS;
  const guidedTotal = { lld: lldSeq.length, hld: hldSeq.length, dsa: dsaSeq.length };
  const guidedAt = <T,>(seq: T[], cursor: number): T | null =>
    guided && seq.length > 0 ? (seq[Math.min(cursor, seq.length - 1)] ?? null) : null;
  const lldGuidedStep = guidedAt(lldSeq, guidedCursors.lld);
  const hldGuidedStep = guidedAt(hldSeq, guidedCursors.hld);
  const dsaGuidedStep = guidedAt(dsaSeq, guidedCursors.dsa);

  // Replay-derived objects (flow step / connection / polyline) — placed after
  // the queries + scenes so every referenced declaration exists first.
  const totalReplaySteps =
    replay !== null
      ? (model?.hld.flows.find((f) => f.id === replay.flowId)?.steps.length ?? 0)
      : 0;
  const replayFlow = replay !== null ? (model?.hld.flows.find((f) => f.id === replay.flowId) ?? null) : null;
  const replayStep =
    replayFlow !== null && replay !== null
      ? ([...replayFlow.steps].sort((a, b) => a.order - b.order)[replay.stepIndex] ?? null)
      : null;
  const replayConnId =
    replayStep !== null ? (replayStep.elementRefs.find((ref) => ref.startsWith("conn_")) ?? null) : null;
  const replayConnPoints =
    replayConnId !== null && hldScene !== null
      ? (hldScene.edges.find((edge) => edge.id === replayConnId)?.points ?? null)
      : null;

  const startReplay = useCallback(
    (flowId: string) => {
      if (guided) return;
      const flow = model?.hld.flows.find((f) => f.id === flowId);
      if (flow === undefined || flow.steps.length === 0) return;
      setHldSelection({ type: "flow", id: flowId });
      setFlowFocus(null);
      setReplay((r) => ({ flowId, stepIndex: 0, playing: true, speed: r?.speed ?? 1 }));
    },
    [guided, model],
  );

  const replayAdvance = useCallback(() => {
    setReplay((r) => {
      if (r === null) return r;
      const total = model?.hld.flows.find((f) => f.id === r.flowId)?.steps.length ?? 0;
      if (r.stepIndex + 1 >= total) return { ...r, playing: false };
      return { ...r, stepIndex: r.stepIndex + 1 };
    });
  }, [model]);

  // Reduced-motion fallback: no traveling dot; captions auto-advance.
  useEffect(() => {
    if (replay === null || !replay.playing || !reducedMotion) return;
    const ms = Math.round(2200 / replay.speed);
    const timer = setTimeout(() => replayAdvance(), ms);
    return () => clearTimeout(timer);
  }, [replay, reducedMotion, replayAdvance]);

  const buildChips = useCallback(
    (
      scene: LldScene | HldScene,
      componentIds: string[],
      connectionIds: string[],
      componentText: (id: string) => string,
      connectionText: (id: string) => string,
    ): { id: string; text: string; anchor: { x: number; y: number } }[] => {
      const truncate = (text: string) => (text.length > 56 ? `${text.slice(0, 55)}…` : text);
      const chips: { id: string; text: string; anchor: { x: number; y: number } }[] = [];
      for (const id of componentIds.slice(0, 4)) {
        const node = scene.nodes.find((n) => n.id === id);
        const text = truncate(componentText(id));
        if (node === undefined || text === "") continue;
        chips.push({ id, text, anchor: { x: node.x + node.width, y: node.y } });
      }
      for (const id of connectionIds.slice(0, 4)) {
        const edge = scene.edges.find((e) => e.id === id);
        const text = truncate(connectionText(id));
        if (edge === undefined || text === "" || edge.points.length === 0) continue;
        const first = edge.points[0];
        const last = edge.points[edge.points.length - 1];
        chips.push({
          id,
          text,
          anchor: { x: (first.x + last.x) / 2, y: (first.y + last.y) / 2 },
        });
      }
      return chips.slice(0, 8);
    },
    [],
  );

  const hldAnnotationChips = useMemo(() => {
    if (!annotateOn || model === null || hldScene === null || activeView !== "hld") return [];
    const componentText = (id: string) =>
      model.hld.components.find((c) => c.id === id)?.responsibility ?? "";
    const connectionText = (id: string) =>
      model.hld.connections.find((c) => c.id === id)?.rationale ?? "";
    if (hldGuidedStep !== null) {
      return buildChips(hldScene, hldGuidedStep.componentIds, hldGuidedStep.connectionIds, componentText, connectionText);
    }
    if (hldSelection !== null && hldSelection.type === "flow") {
      const { componentIds, connectionIds } = flowHighlight(
        model.hld,
        hldSelection.id,
        effectiveFlowFocus?.flowId === hldSelection.id ? effectiveFlowFocus.stepIndex : undefined,
      );
      return buildChips(hldScene, componentIds, connectionIds, componentText, connectionText);
    }
    return [];
  }, [
    annotateOn,
    model,
    hldScene,
    hldGuidedStep,
    hldSelection,
    effectiveFlowFocus,
    activeView,
    buildChips,
  ]);

  const lldAnnotationChips = useMemo(() => {
    if (!annotateOn || model === null || lldScene === null || activeView !== "lld") return [];
    if (lldGuidedStep === null) return [];
    const classText = (id: string) =>
      model.lld.classes.find((c) => c.id === id)?.responsibility ?? "";
    const relationshipText = (id: string) => {
      const rel = model.lld.relationships.find((r) => r.id === id);
      if (rel === undefined) return "";
      return `${rel.sourceMultiplicity} — ${rel.label !== "" ? rel.label : rel.rationale}`;
    };
    return buildChips(lldScene, lldGuidedStep.classIds, lldGuidedStep.relationshipIds, classText, relationshipText);
  }, [annotateOn, model, lldScene, lldGuidedStep, activeView, buildChips]);

  // Persist the active view's guided cursor so a refresh resumes at it.
  useEffect(() => {
    if (!guided) return;
    window.sessionStorage.setItem(
      guidedStorageKey(activeView, projectId),
      String(guidedCursors[activeView]),
    );
  }, [guided, guidedCursors, activeView, projectId]);

  function toggleGuided() {
    if (guided) {
      window.sessionStorage.removeItem(guidedStorageKey(activeView, projectId));
      setGuided(false);
      return;
    }
    const total = guidedTotal[activeView];
    if (total === 0) return;
    setGuidedCursors((c) => ({ ...c, [activeView]: Math.min(c[activeView], total - 1) }));
    setGuided(true);
  }

  /** Builds the floating GuidedBar for one view's current step. */
  const guidedBar = (step: GuidedStep, scope: GuidedScope, total: number) => {
    const index = Math.min(guidedCursors[scope], total - 1);
    return (
      <GuidedBar
        step={step}
        index={index}
        total={total}
        onPrev={() =>
          setGuidedCursors((c) => ({ ...c, [scope]: Math.max(0, Math.min(c[scope], total - 1) - 1) }))
        }
        onNext={() => setGuidedCursors((c) => ({ ...c, [scope]: Math.min(c[scope] + 1, total - 1) }))}
        onExit={toggleGuided}
      />
    );
  };

  const lldHighlights = useMemo(() => {
    const empty = { relationshipIds: new Set<string>(), classIds: new Set<string>() };
    if (model === null || lldSelection === null || lldSelection.type === "relationship") {
      return empty;
    }
    return relatedElements(model.lld, lldSelection);
  }, [model, lldSelection]);

  const hldHighlights = useMemo(() => {
    const empty = { componentIds: new Set<string>(), connectionIds: new Set<string>() };
    if (model === null || hldSelection === null) return empty;
    if (hldSelection.type === "flow") {
      const { componentIds, connectionIds } = flowHighlight(
        model.hld,
        hldSelection.id,
        effectiveFlowFocus?.flowId === hldSelection.id ? effectiveFlowFocus.stepIndex : undefined,
      );
      return { componentIds: new Set(componentIds), connectionIds: new Set(connectionIds) };
    }
    if (hldSelection.type === "component") {
      return hldAdjacency(model.hld, hldSelection);
    }
    if (hldSelection.type === "connection") {
      return hldAdjacency(model.hld, hldSelection);
    }
    return empty;
  }, [model, hldSelection, effectiveFlowFocus]);

  /** Selection the HLD canvas may highlight: only components/connections. */
  const hldCanvasSelection = useMemo(() => {
    if (hldSelection === null) return null;
    if (hldSelection.type === "component") return hldSelection;
    if (hldSelection.type === "connection") return hldSelection;
    return null;
  }, [hldSelection]);

  /** Full-path step order badges rendered on the HLD canvas during flow exploration. */
  const stepOrder = useMemo(() => {
    if (model === null || hldSelection?.type !== "flow") return undefined;
    const flow = model.hld.flows.find((f) => f.id === hldSelection.id);
    if (flow === undefined) return undefined;
    const map = new Map<string, number>();
    for (const step of flow.steps) {
      for (const ref of step.elementRefs) {
        if (!map.has(ref)) map.set(ref, step.order);
      }
    }
    return map;
  }, [model, hldSelection]);

  const lldSidebarGroups: SidebarGroup[] = useMemo(() => {
    if (model === null) return [];
    const query = lldSearch.trim().toLowerCase();
    const match = (name: string) => name.toLowerCase().includes(query);
    const classes = model.lld.classes.filter((cls) => match(cls.name));
    const patterns = model.lld.patterns.filter((pattern) => match(pattern.name));
    return [
      {
        title: `classes (${classes.length})`,
        emptyText: query === "" ? "No classes." : "No matches.",
        entries: classes.map((cls) => ({
          id: cls.id,
          primary: cls.name,
          secondary: KIND_CHIP[cls.kind] ?? cls.kind,
          selected: lldSelection?.type === "class" && lldSelection.id === cls.id,
          onSelect: () =>
            setLldSelection(
              lldSelection?.type === "class" && lldSelection.id === cls.id
                ? null
                : { type: "class", id: cls.id },
            ),
        })),
      },
      {
        title: `patterns (${patterns.length})`,
        emptyText: query === "" ? "No design patterns." : "No matches.",
        entries: patterns.map((pattern) => ({
          id: pattern.id,
          primary: pattern.name,
          secondary: pattern.category.slice(0, 5),
          selected: lldSelection?.type === "pattern" && lldSelection.id === pattern.id,
          onSelect: () =>
            setLldSelection(
              lldSelection?.type === "pattern" && lldSelection.id === pattern.id
                ? null
                : { type: "pattern", id: pattern.id },
            ),
        })),
      },
    ];
  }, [model, lldSelection, lldSearch]);

  const hldSidebarGroups: SidebarGroup[] = useMemo(() => {
    if (model === null) return [];
    const query = hldSearch.trim().toLowerCase();
    const match = (name: string) => name.toLowerCase().includes(query);
    const components = model.hld.components.filter((c) => match(c.name));
    const flows = model.hld.flows.filter((f) => match(f.name));
    const scaling = model.hld.scalabilityNotes.filter((n) => match(n.aspect));
    const failures = model.hld.failureScenarios.filter((f) => match(f.condition));
    const tech = model.hld.technologyDecisions.filter((t) => match(t.topic));
    return [
      {
        title: `components (${components.length})`,
        emptyText: query === "" ? "No components." : "No matches.",
        entries: components.map((component) => ({
          id: component.id,
          primary: component.name,
          secondary: component.type,
          selected: hldSelection?.type === "component" && hldSelection.id === component.id,
          onSelect: () =>
            setHldSelection(
              hldSelection?.type === "component" && hldSelection.id === component.id
                ? null
                : { type: "component", id: component.id },
            ),
        })),
      },
      {
        title: `flows (${flows.length})`,
        emptyText: query === "" ? "No request flows." : "No matches.",
        entries: flows.map((flow) => ({
          id: flow.id,
          primary: flow.name,
          secondary: `${flow.steps.length} steps`,
          selected: hldSelection?.type === "flow" && hldSelection.id === flow.id,
          onSelect: () => {
            setFlowFocus(null);
            setHldSelection(
              hldSelection?.type === "flow" && hldSelection.id === flow.id
                ? null
                : { type: "flow", id: flow.id },
            );
          },
        })),
      },
      {
        title: `scalability (${scaling.length})`,
        emptyText: query === "" ? "No scalability notes." : "No matches.",
        entries: scaling.map((note) => ({
          id: note.id,
          primary: note.aspect,
          secondary: "scale",
          selected: hldSelection?.type === "scalability" && hldSelection.id === note.id,
          onSelect: () =>
            setHldSelection(
              hldSelection?.type === "scalability" && hldSelection.id === note.id
                ? null
                : { type: "scalability", id: note.id },
            ),
        })),
      },
      {
        title: `failures (${failures.length})`,
        emptyText: query === "" ? "No failure scenarios." : "No matches.",
        entries: failures.map((failure) => ({
          id: failure.id,
          primary: failure.condition,
          secondary: "failure",
          selected: hldSelection?.type === "failure" && hldSelection.id === failure.id,
          onSelect: () =>
            setHldSelection(
              hldSelection?.type === "failure" && hldSelection.id === failure.id
                ? null
                : { type: "failure", id: failure.id },
            ),
        })),
      },
      {
        title: `technology (${tech.length})`,
        emptyText: query === "" ? "No technology decisions." : "No matches.",
        entries: tech.map((decision) => ({
          id: decision.id,
          primary: decision.topic,
          secondary: "tech",
          selected: hldSelection?.type === "technology" && hldSelection.id === decision.id,
          onSelect: () =>
            setHldSelection(
              hldSelection?.type === "technology" && hldSelection.id === decision.id
                ? null
                : { type: "technology", id: decision.id },
            ),
        })),
      },
    ];
  }, [model, hldSelection, hldSearch]);

  async function regenerate(scope: RegenerateScope) {
    if (projectKey === null && loadSession() === null) return;
    setRegenError(null);
    setRegenScope(scope);
    try {
      const setup = loadProviderSetup();
      const options: GenerationOptions = {
        ...(setup === null || setup.model.trim() === "" ? {} : { model: setup.model.trim() }),
      };
      const started = await apiFetch(`/api/projects/${projectId}/architecture/regenerate`, {
        method: "POST",
        body: JSON.stringify({ scope, ...options }),
        projectKey: projectKey ?? undefined,
        auth: loadSession() !== null,
        ...(setup === null || setup.apiKey.trim() === ""
          ? {}
          : { providerKey: setup.apiKey.trim() }),
        dataSchema: StartRunResponseSchema,
      });
      setRegenRunId(started.runId);
    } catch (error) {
      if (error instanceof ApiError) {
        setRegenError({ user: error.userMessage, detail: error.message });
      } else {
        setRegenError({
          user: "Starting the regeneration failed unexpectedly.",
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  if (noAccessKey) {
    return (
      <ErrorCard
        stage="workspace"
        user="The access key for this project is not in this browser tab."
        detail="Project access keys live in sessionStorage and die with the tab. Reopen this design from the requirements editor, or start a new session from the landing page."
      />
    );
  }

  const queryError = project.error ?? architecture.error;
  if (queryError !== null && (projectKey !== null || authed)) {
    const user =
      queryError instanceof ApiError
        ? queryError.userMessage
        : "Loading the workspace failed unexpectedly.";
    const detail = queryError instanceof Error ? queryError.message : String(queryError);
    return (
      <ErrorCard
        stage="workspace"
        user={user}
        detail={detail}
        onRetry={() => {
          project.refetch();
          architecture.refetch();
        }}
      />
    );
  }

  if (project.isPending || architecture.isPending || (projectKey === null && !authed)) {
    return (
      <div aria-busy="true" className="flex h-[100dvh] flex-col">
        <div className="bg-card border-border border-b border-solid px-5 py-4">
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="flex min-h-0 flex-1 gap-3 p-4">
          <Skeleton className="hidden w-56 rounded-xl md:block" />
          <Skeleton className="min-w-0 flex-1 rounded-xl" />
          <Skeleton className="hidden w-80 rounded-xl lg:block" />
        </div>
      </div>
    );
  }

  const validation = version?.validation ?? null;
  const blockingValidationErrors = validation?.errors.length ?? 0;

  // Journey map honesty for the no-architecture card: point the current step
  // at where the project actually stopped (spec vs architecture).
  const workspaceGapStage: JourneyStage =
    (project.data?.status ?? "requirements_pending") === "architecture_ready"
      ? "architecture"
      : "specification";

  // Shared render nodes (F6): the same canvas/outline/details fragments feed
  // the desktop resizable layout and the narrow drawers/sheets.
  const canvasNode =
    activeView === "lld" && lldScene !== null ? (
      <div className="relative h-full min-h-0">
        <DiagramCanvas
          scene={lldScene}
          selection={
            lldSelection?.type === "pattern" ? null : (lldSelection as DiagramSelection)
          }
          onSelect={setLldSelection}
          patternNamesByClassId={patternNamesByClassId}
          highlightClassIds={
            lldGuidedStep !== null
              ? new Set(lldGuidedStep.classIds)
              : lldHighlights.classIds
          }
          highlightRelationshipIds={
            lldGuidedStep !== null
              ? new Set(lldGuidedStep.relationshipIds)
              : lldHighlights.relationshipIds
          }
          guidedStep={lldGuidedStep}
          annotationChips={lldAnnotationChips}
          onAnnotationSelect={selectAnnotation}
          className="h-full"
        />
        {lldGuidedStep !== null ? guidedBar(lldGuidedStep, "lld", lldSeq.length) : null}
      </div>
    ) : hldScene !== null ? (
      <div className="relative h-full min-h-0">
        <HldCanvas
          scene={hldScene}
          selection={hldCanvasSelection}
          onSelect={setHldSelection}
          highlightComponentIds={
            hldGuidedStep !== null
              ? new Set(hldGuidedStep.componentIds)
              : hldHighlights.componentIds
          }
          highlightConnectionIds={
            hldGuidedStep !== null
              ? new Set(hldGuidedStep.connectionIds)
              : hldHighlights.connectionIds
          }
          stepOrder={hldGuidedStep !== null ? undefined : stepOrder}
          guidedStep={hldGuidedStep}
          replay={
            replayValid &&
            replay !== null &&
            replayConnId !== null &&
            replayConnPoints !== null &&
            replayConnPoints.length > 1
              ? {
                  pointKey: `${replay.flowId}:${replay.stepIndex}:${replayConnId}`,
                  points: replayConnPoints,
                  speed: replay.speed,
                  playing: replay.playing,
                  reducedMotion,
                  onStepDone: replayAdvance,
                }
              : null
          }
          annotationChips={hldAnnotationChips}
          onAnnotationSelect={selectAnnotation}
          className="h-full"
        />
        {hldGuidedStep !== null ? guidedBar(hldGuidedStep, "hld", hldSeq.length) : null}
        {replayValid && replay !== null && replayFlow !== null && replayStep !== null ? (
          <ReplayBar
            caption={replayStep.description}
            index={replay.stepIndex}
            total={replayFlow.steps.length}
            playing={replay.playing}
            speed={replay.speed}
            onTogglePlay={() =>
              setReplay((r) => (r === null ? r : { ...r, playing: !r.playing }))
            }
            onPrev={() => setReplay((r) => (r === null ? r : { ...r, playing: false, stepIndex: Math.max(0, r.stepIndex - 1) }))}
            onNext={() => setReplay((r) => (r === null ? r : { ...r, playing: false, stepIndex: Math.min(totalReplaySteps - 1, r.stepIndex + 1) }))}
            onReset={() => setReplay((r) => (r === null ? r : { ...r, playing: true, stepIndex: 0 }))}
            onSpeed={() => setReplay((r) => (r === null ? r : { ...r, speed: r.speed === 1 ? 2 : 1, playing: true }))}
            onClose={() => {
              setReplay(null);
              setFlowFocus(null);
            }}
          />
        ) : null}
      </div>
    ) : null;

  const outlineNode =
    model === null ? null : activeView === "lld" ? (
      <WorkspaceSidebar
        ariaLabel="LLD outline"
        search={lldSearch}
        onSearchChange={setLldSearch}
        groups={lldSidebarGroups}
      />
    ) : (
      <WorkspaceSidebar
        ariaLabel="HLD outline"
        search={hldSearch}
        onSearchChange={setHldSearch}
        groups={hldSidebarGroups}
      />
    );

  // Desktop top strip variant of the same outline (horizontal orientation).
  const outlineStripNode =
    model === null ? null : activeView === "lld" ? (
      <WorkspaceSidebar
        ariaLabel="LLD outline"
        orientation="horizontal"
        search={lldSearch}
        onSearchChange={setLldSearch}
        groups={lldSidebarGroups}
      />
    ) : (
      <WorkspaceSidebar
        ariaLabel="HLD outline"
        orientation="horizontal"
        search={hldSearch}
        onSearchChange={setHldSearch}
        groups={hldSidebarGroups}
      />
    );

  const detailsNode =
    model === null ? null : activeView === "lld" ? (
      <WorkspaceDetails model={model.lld} selection={lldSelection} className="px-3 pb-4" />
    ) : (
      <HldDetails
        model={model.hld}
        selection={hldSelection}
        focusedFlow={effectiveFlowFocus}
        onFlowStepFocus={(flowId, stepIndex) =>
          setFlowFocus(stepIndex === null ? null : { flowId, stepIndex })
        }
        onReplay={guided ? undefined : startReplay}
        className="px-3 pb-4"
      />
    );

  const detailsPaneNode = activeSelectionId !== null ? (
    <DetailsPopover
      details={detailsNode}
      onClose={() => {
        if (activeView === "lld") setLldSelection(null);
        else setHldSelection(null);
      }}
    />
  ) : null;

  return (
    <div className="flex h-[100dvh] flex-col">
      <header className="border-border bg-card sticky top-0 z-40 w-full border-b border-solid">
        <div className="flex h-14 w-full items-center justify-between gap-4 px-5">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href={`/projects/${projectId}/requirements`}
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded font-mono text-xs transition-colors focus-visible:ring-2 focus-visible:outline-1"
            >
              ← requirements
            </Link>
            <span className="text-foreground truncate text-sm font-semibold tracking-tight">
              {model?.meta.title ?? (project.data?.idea.slice(0, 60) ?? "")}
            </span>
            {validation !== null ? <ValidationBadge validation={validation} /> : null}
          </div>
          <div className="flex flex-none items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              aria-pressed={guided}
              disabled={guidedTotal[activeView] === 0}
              onClick={toggleGuided}
            >
              <GraduationCapIcon />
              Guided
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-pressed={annotateOn}
              disabled={model === null}
              onClick={() => setAnnotateOn((value) => !value)}
            >
              <TagsIcon />
              Annotate
            </Button>
            {isDesktop && activeView !== "dsa" ? (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-pressed={focusMode}
                aria-label={focusMode ? "Exit focus mode" : "Focus mode: hide side panels"}
                onClick={() => setFocusMode((value) => !value)}
              >
                {focusMode ? <PanelRightOpenIcon /> : <PanelRightCloseIcon />}
              </Button>
            ) : null}
            {!isDesktop && activeView !== "dsa" ? (
              <>
                {isPhone ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-haspopup="dialog"
                    onClick={() => setOutlineOpen(true)}
                  >
                    Outline
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  aria-haspopup="dialog"
                  onClick={() => setDetailsOpen(true)}
                >
                  Details
                </Button>
              </>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="outline" size="sm">
                    <RefreshCcwIcon />
                    Regenerate
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="min-w-[240px]">
                <DropdownMenuLabel>Regeneration scope</DropdownMenuLabel>
                {(Object.keys(REGEN_LABEL) as Array<RegenerateScope>).map((scope) => (
                  <DropdownMenuItem key={scope} onClick={() => void regenerate(scope)}>
                    {REGEN_LABEL[scope]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {model !== null ? (
              <Link href={`/projects/${projectId}/export`} passHref>
                <Button variant="outline" size="sm">
                  <DownloadIcon />
                  Export
                </Button>
              </Link>
            ) : (
              <Button variant="outline" size="sm" disabled aria-disabled="true">
                <DownloadIcon />
                Export
              </Button>
            )}
            <ProviderDialog />
          </div>
        </div>
        {regenError !== null ? (
          <div
            role="alert"
            className="border-destructive/40 bg-destructive/10 flex items-start justify-between gap-3 border-t border-solid px-5 py-2"
          >
            <div className="min-w-0">
              <p className="text-destructive text-xs font-medium">{regenError.user}</p>
              <p className="text-muted-foreground font-mono mt-0.5 text-[11px]">{regenError.detail}</p>
            </div>
            <div className="flex flex-none items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => void regenerate(regenScope)}>
                <RefreshCcwIcon />
                Retry
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Dismiss generation error"
                onClick={() => setRegenError(null)}
              >
                <XIcon />
              </Button>
            </div>
          </div>
        ) : null}
        {validation !== null &&
        validation.errors.length === 0 &&
        validation.warnings.length > 0 ? (
          <div
            role="status"
            className="border-warning/40 bg-warning/10 border-t border-solid px-5 py-2"
          >
            <p className="text-warning text-xs font-medium">
              {`${validation.warnings.length} validation warning${
                validation.warnings.length === 1 ? "" : "s"
              } — the diagram still renders from the generated model.`}
            </p>
            <p className="text-muted-foreground font-mono mt-0.5 text-[11px]">
              {validation.warnings[0].message}
            </p>
          </div>
        ) : null}
      </header>

      {model === null || lldScene === null || hldScene === null ? (
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-6">
          <JourneyShell
            stage={workspaceGapStage}
            title="This project has no generated architecture"
            lead="Confirm a requirements specification in the editor first — the architecture is generated from it. Generate there, and this workspace reads the result live."
          >
            <Link href={`/projects/${projectId}/requirements`} className="inline-block">
              <Button>
                <ListChecksIcon />
                Open the requirements editor
              </Button>
            </Link>
          </JourneyShell>
        </main>
      ) : blockingValidationErrors > 0 ? (
        // Blocking errors never render a diagram (F6).
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-6">
          <JourneyShell
            stage="architecture"
            tone="error"
            title="This architecture version failed validation"
            lead="Regenerate the architecture from the requirements editor to replace it — the workspace renders only validated models."
          >
            <p className="text-foreground/85 font-mono text-xs">
              {validation?.errors[0]?.message ?? ""}
            </p>
            <Link href={`/projects/${projectId}/requirements`} className="mt-5 inline-block">
              <Button variant="outline">
                <ListChecksIcon />
                Open the requirements editor
              </Button>
            </Link>
          </JourneyShell>
        </main>
      ) : (
        <main className="flex min-h-0 flex-1 flex-col px-4 py-3">
          <Tabs
            value={activeView}
            onValueChange={(value) => {
              if (value === "lld" || value === "hld" || value === "dsa") setActiveView(value);
            }}
          >
            <TabsList className="mb-2 w-fit">
              <TabsTrigger value="lld">LLD</TabsTrigger>
              <TabsTrigger value="hld">HLD</TabsTrigger>
              <TabsTrigger value="dsa">DSA</TabsTrigger>
            </TabsList>
          </Tabs>

          {activeView === "dsa" ? (
            <div className="relative min-h-0 flex-1">
              <WorkspaceDsa model={model} guidedStep={dsaGuidedStep} className="h-full" />
              {dsaGuidedStep !== null ? guidedBar(dsaGuidedStep, "dsa", dsaSeq.length) : null}
            </div>
          ) : isDesktop ? (
            <div className="relative flex min-h-0 flex-1 flex-col gap-2">
              {!focusMode ? (
                <div className="h-44 flex-none">{outlineStripNode}</div>
              ) : null}
              <div className="relative min-h-0 flex-1">
                {canvasNode}
                {detailsPaneNode}
              </div>
            </div>
          ) : (
            <div className={cn("flex min-h-0 flex-1 gap-2", isPhone ? "flex-col" : "flex-row")}>
              {!isPhone ? <aside className="w-44 flex-none">{outlineNode}</aside> : null}
              <div className="min-h-0 flex-1">{canvasNode}</div>
            </div>
          )}
        </main>
      )}

      {!isDesktop && activeView !== "dsa" && model !== null && blockingValidationErrors === 0 ? (
        <>
          {isPhone ? (
            <Sheet open={outlineOpen} onOpenChange={setOutlineOpen}>
              <SheetContent
                side="left"
                className="bg-card border-border flex flex-col gap-0 p-2"
              >
                <SheetTitle className="sr-only">Outline</SheetTitle>
                {outlineNode}
              </SheetContent>
            </Sheet>
          ) : null}
          <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
            <SheetContent
              side={isPhone ? "bottom" : "right"}
              className={cn(
                "bg-card border-border flex flex-col gap-0 overflow-y-auto p-3",
                isPhone ? "h-[72dvh]" : "w-[380px]",
              )}
            >
              <SheetTitle className="sr-only">Details</SheetTitle>
              {detailsNode}
            </SheetContent>
          </Sheet>
        </>
      ) : null}

      {regenRunId !== null ? (
        <RegenRunPhase
          runId={regenRunId}
          projectKey={projectKey}
          projectId={projectId}
          onSettledClose={closeRegen}
          onRetry={() => void regenerate(regenScope)}
        />
      ) : null}
    </div>
  );
}

/** Guided-learning floating bar: step info, progress, Prev/Next, Exit.
 * The step is a union slice — every scope's focus step carries these fields. */
function GuidedBar({
  step,
  index,
  total,
  onPrev,
  onNext,
  onExit,
}: {
  step: Pick<GuidedStep, "title" | "explanation">;
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onExit: () => void;
}) {
  return (
    <div
      className="bg-card/95 border-border absolute bottom-3 left-1/2 z-10 w-[min(94%,620px)] -translate-x-1/2 rounded-xl border border-solid p-3 shadow-lg backdrop-blur"
      role="group"
      aria-label="Guided learning steps"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-muted-foreground font-mono text-[10px] uppercase">
            {`guided ${index + 1} / ${total}`}
          </p>
          <h3 className="text-foreground mt-0.5 text-sm font-semibold tracking-tight">{step.title}</h3>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Exit guided mode" onClick={onExit}>
          <XIcon />
        </Button>
      </div>
      <p className="text-muted-foreground mt-1.5 line-clamp-3 text-xs leading-relaxed">
        {step.explanation}
      </p>
      <div className="border-border mt-2 flex items-center gap-2 border-t border-solid pt-2">
        <Button variant="outline" size="sm" disabled={index === 0} onClick={onPrev}>
          <ChevronLeftIcon />
          Prev
        </Button>
        <div
          aria-hidden="true"
          className="bg-muted h-1 min-w-0 flex-1 overflow-hidden rounded-full"
        >
          <div
            className="bg-primary h-1 rounded-full transition-[width] duration-200"
            style={{ width: `${((index + 1) / total) * 100}%` }}
          />
        </div>
        <Button variant="outline" size="sm" disabled={index >= total - 1} onClick={onNext}>
          Next
          <ChevronRightIcon />
        </Button>
      </div>
      <p className="sr-only" aria-live="polite">
        {`Guided step ${index + 1} of ${total}: ${step.title}`}
      </p>
    </div>
  );
}

/** Validation badge: invalid (blocking) > warnings > clean. */
function ValidationBadge({ validation }: { validation: ValidationReport }) {
  const invalid = validation.errors.length > 0;
  return (
    <Badge
      className={cn(
        "font-mono",
        invalid
          ? "bg-destructive/10 text-destructive"
          : validation.warnings.length > 0
            ? "bg-warning/10 text-warning"
            : "bg-success/10 text-success",
      )}
    >
      {invalid
        ? "invalid"
        : `validated${
            validation.warnings.length > 0
              ? ` · ${validation.warnings.length} warning${
                  validation.warnings.length === 1 ? "" : "s"
                }`
              : ""
          }`}
    </Badge>
  );
}

function ErrorCard({
  stage,
  user,
  detail,
  onRetry,
}: {
  stage: JourneyStage;
  user: string;
  detail: string;
  onRetry?: () => void;
}) {
  return (
    <JourneyShell
      stage={stage}
      tone="error"
      title={user}
      lead={undefined}
    >
      <p className="text-muted-foreground font-mono text-xs">{detail}</p>
      <div className="mt-5 flex flex-wrap items-center gap-4">
        {onRetry ? (
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RefreshCcwIcon />
            Retry
          </Button>
        ) : null}
        <Link href="/" className="text-primary hover:underline inline-block text-sm underline-offset-4">
          Back to the landing page
        </Link>
      </div>
    </JourneyShell>
  );
}

/**
 * Floating details panel over the canvas: normal size, scrollable content,
 * draggable via its header (pointer capture). Desktop only — narrow screens
 * keep the Sheets. Renders the same reference fragments the column used to.
 */
function DetailsPopover({
  details,
  onClose,
}: {
  details: ReactNode;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragOffset = useRef<{ x: number; y: number } | null>(null);

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    // Buttons inside the header (the close X) must keep their click — a drag
    // starting on one captures the pointer and swallows the click event.
    if ((event.target as HTMLElement | null)?.closest("button") !== null) return;
    const panel = panelRef.current;
    if (panel === null) return;
    const rect = panel.getBoundingClientRect();
    if (pos === null) {
      // Materialize anchored free coordinates at the current visual position.
      const container = panel.parentElement?.getBoundingClientRect();
      setPos(
        container
          ? { x: rect.left - container.left, y: rect.top - container.top }
          : { x: rect.left, y: rect.top },
      );
    }
    dragOffset.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const offset = dragOffset.current;
    const panel = panelRef.current;
    if (offset === null || panel === null) return;
    const container = panel.parentElement?.getBoundingClientRect();
    setPos({
      x: event.clientX - (container?.left ?? 0) - offset.x,
      y: event.clientY - (container?.top ?? 0) - offset.y,
    });
  }

  function handleDragEnd(event: ReactPointerEvent<HTMLDivElement>) {
    dragOffset.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  useEffect(() => {
    // Escape closes from anywhere: after a pointer drag the keyboard focus is
    // on body, so a panel-scoped handler would miss it.
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <section
      ref={panelRef}
      style={pos === null ? { right: 16, top: 16 } : { left: pos.x, top: pos.y }}
      className="absolute z-20 flex max-h-[75%] w-[380px] max-w-[calc(100%-32px)] flex-col"
      aria-label="Element details"
    >
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
        className="bg-card/95 border-border flex flex-none cursor-grab items-center justify-between gap-2 rounded-t-xl border border-b-0 border-solid px-3 py-1.5 backdrop-blur select-none active:cursor-grabbing touch-none"
      >
        <span className="text-muted-foreground font-mono text-[10px] uppercase">
          details
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Close details panel"
          onClick={onClose}
        >
          <XIcon />
        </Button>
      </div>
      <div className="bg-card/95 border-border min-h-0 flex-1 overflow-y-auto rounded-b-xl border border-solid backdrop-blur">
        {details}
      </div>
    </section>
  );
}

/** Hooks must live in one stable component instance per regeneration run. */
function RegenRunPhase({
  runId,
  projectKey,
  projectId,
  onSettledClose,
  onRetry,
}: {
  runId: string;
  projectKey: string | null;
  projectId: string;
  onSettledClose: () => void;
  onRetry: () => void;
}) {
  const queryClient = useQueryClient();
  const { run, isLoading, error } = useGenerationRun(runId, projectKey);

  useRunTerminalEffect(run, (outcome) => {
    if (outcome !== "succeeded") return; // failed/interrupted stay visible for retry
    void (async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.architecture(projectId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.project(projectId) });
      onSettledClose();
    })();
  });

  return (
    <div
      className="bg-background/70 fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-6 backdrop-blur-xs"
      role="presentation"
    >
      <div className="w-full max-w-[640px]">
        <JourneyShell
          stage="architecture"
          fill={false}
          title="Regenerating the architecture…"
          lead="A scoped run starts fresh persisted stages; success swaps the workspace to the new version automatically."
        >
          <RunProgress
            run={run}
            error={error}
            isLoading={isLoading}
            context="architecture"
            onRetry={onRetry}
          />
          <div className="mt-4 flex justify-end">
            <Button variant="ghost" size="sm" onClick={onSettledClose}>
              Close
            </Button>
          </div>
        </JourneyShell>
      </div>
    </div>
  );
}
