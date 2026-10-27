"use client";

import {
  RequirementsResponseSchema,
  type RequirementsSpec,
  type SaveRequirementsRequest,
  StartRunResponseSchema,
  type GenerationOptions,
} from "@sda/contracts";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  CircleAlertIcon,
  PlusIcon,
  TrashIcon,
} from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch, ApiError } from "@/lib/api/client";
import {
  addFunctionalRow,
  addNonFunctionalRow,
  functionalPayload,
  hasEmptyText,
  moveRow,
  nextLocalKey,
  nonFunctionalPayload,
  removeRow as removeByKey,
  rowsFromSpec,
  updateRow,
  type FunctionalRow,
  type NonFunctionalRow,
} from "@/lib/requirements/editor";
import type { ProviderSetup } from "@/lib/session/keys";
import { loadSession } from "@/lib/session/auth";

const MAX_ROWS = 30;
const PRIORITIES = ["must", "should", "could"] as const;
const CATEGORIES = [
  "performance",
  "scalability",
  "reliability",
  "security",
  "maintainability",
  "usability",
] as const;

type AssumptionRow = { key: string; id?: string; text: string };
type ClarificationRow = { key: string; id?: string; question: string; answer: string };

type DeleteTarget = { kind: "functional" | "nonFunctional" | "clarification"; key: string };

/** Short row label for display — backend ids (fr_/nfr_/asm_/q_) stay in state only. */
function rowLabel(prefix: string, index: number): string {
  return `${prefix}${index + 1}`;
}

function RowChip({ label }: { label: string }) {
  return (
    <span className="text-muted-foreground w-9 flex-none font-mono text-[11px]">
      {label}
    </span>
  );
}

/** Row text fields auto-grow with their text ("field-sizing: content"); Enter would only insert a line break, so it does nothing. */
function blockNewline(event: KeyboardEvent<HTMLTextAreaElement>) {
  if (event.key === "Enter") event.preventDefault();
}

function ProviderNote({ setup }: { setup: ProviderSetup | null }) {
  if (setup === null) {
    return (
      <span className="text-warning flex items-center gap-1.5 font-mono text-[11px]">
        <CircleAlertIcon className="size-3" />
        no provider key set — generation will ask for one
      </span>
    );
  }
  return (
    <span className="text-muted-foreground font-mono text-[11px]">
      {setup.model !== "" ? setup.model : "default model"} · key in this tab only
    </span>
  );
}

/**
 * The editable specification. Rows manipulate pure helper state from
 * lib/requirements/editor.ts; saving is server-authoritative (ids are
 * assigned by the backend, imported rows always keep their ids).
 */
export function SpecEditor({
  projectId,
  projectKey,
  spec,
  setup,
  onArchitectureStarted,
  onSpecSynced,
}: {
  projectId: string;
  projectKey: string;
  spec: RequirementsSpec;
  setup: ProviderSetup | null;
  onArchitectureStarted: (runId: string) => void;
  /** Lets the flow refresh its cached spec after a server-authoritative save. */
  onSpecSynced: (spec: RequirementsSpec) => void;
}) {
  const [functional, setFunctional] = useState<FunctionalRow[]>(() => rowsFromSpec(spec).functional);
  const [nonFunctional, setNonFunctional] = useState<NonFunctionalRow[]>(() => rowsFromSpec(spec).nonFunctional);
  const [assumptions, setAssumptions] = useState<AssumptionRow[]>(
    spec.assumptions.map((a) => ({ key: a.id, id: a.id, text: a.text })),
  );
  const [clarifications, setClarifications] = useState<ClarificationRow[]>(
    spec.clarifications.map((q) => ({ key: q.id, id: q.id, question: q.question, answer: q.answer ?? "" })),
  );
  const [saving, setSaving] = useState<"idle" | "draft" | "confirm">("idle");
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ user: string; detail: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [newAssumption, setNewAssumption] = useState("");

  const blocked = hasEmptyText(functional) || hasEmptyText(nonFunctional) ||
    hasEmptyText(assumptions) || hasEmptyText(clarifications.map((q) => ({ text: q.question })));

  function applyResponseSpec(nextSpec: RequirementsSpec | null) {
    if (nextSpec === null) return; // contract makes spec nullable; PUT never produces it in practice
    const rows = rowsFromSpec(nextSpec);
    setFunctional(rows.functional);
    setNonFunctional(rows.nonFunctional);
    setAssumptions(nextSpec.assumptions.map((a) => ({ key: a.id, id: a.id, text: a.text })));
    setClarifications(
      nextSpec.clarifications.map((q) => ({
        key: q.id,
        id: q.id,
        question: q.question,
        answer: q.answer ?? "",
      })),
    );
    onSpecSynced(nextSpec);
  }

  function buildRequest(confirm: boolean): SaveRequirementsRequest {
    return {
      functional: functionalPayload(functional),
      nonFunctional: nonFunctionalPayload(nonFunctional),
      assumptions: assumptions.map((a) => ({
        ...(a.id === undefined ? {} : { id: a.id }),
        text: a.text.trim(),
      })),
      clarifications: clarifications.map((q) => ({
        ...(q.id === undefined ? {} : { id: q.id }),
        question: q.question.trim(),
        // an empty answer stays "awaiting" — omit it instead of saving ""
        ...(q.answer.trim() === "" ? {} : { answer: q.answer.trim() }),
      })),
      confirm,
    };
  }

  async function save(confirm: boolean) {
    setSaving(confirm ? "confirm" : "draft");
    setBanner(null);
    setSavedNote(null);
    try {
      const response = await apiFetch(`/api/projects/${projectId}/requirements`, {
        method: "PUT",
        body: JSON.stringify(buildRequest(confirm)),
        projectKey,
        auth: loadSession() !== null,
        dataSchema: RequirementsResponseSchema,
      });
      applyResponseSpec(response.spec);
      if (!confirm) {
        setSavedNote("Draft saved. Nothing is confirmed yet.");
        return;
      }
      setSavedNote("Specification confirmed — starting architecture generation…");
      const options: GenerationOptions = {
        ...(setup === null ? {} : setup.model.trim() === "" ? {} : { model: setup.model.trim() }),
      };
      const started = await apiFetch(`/api/projects/${projectId}/architecture`, {
        method: "POST",
        body: JSON.stringify(options),
        projectKey,
        auth: loadSession() !== null,
        ...(setup === null ? {} : setup.apiKey.trim() === "" ? {} : { providerKey: setup.apiKey.trim() }),
        dataSchema: StartRunResponseSchema,
      });
      onArchitectureStarted(started.runId);
    } catch (error) {
      if (error instanceof ApiError) {
        setBanner({ user: error.userMessage, detail: error.message });
      } else {
        setBanner({
          user: "Saving the specification failed unexpectedly.",
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    } finally {
      setSaving("idle");
    }
  }

  function confirmDelete() {
    if (deleteTarget === null) return;
    if (deleteTarget.kind === "functional") {
      setFunctional((rows) => removeByKey(rows, deleteTarget.key) as FunctionalRow[]);
    } else if (deleteTarget.kind === "nonFunctional") {
      setNonFunctional((rows) => removeByKey(rows, deleteTarget.key) as NonFunctionalRow[]);
    } else {
      setClarifications((rows) => removeByKey(rows, deleteTarget.key) as ClarificationRow[]);
    }
    setDeleteTarget(null);
  }

  function addAssumption() {
    const text = newAssumption.trim();
    if (text === "" || assumptions.length >= MAX_ROWS) return;
    setAssumptions((rows) => [...rows, { key: nextLocalKey(rows), text }]);
    setNewAssumption("");
  }

  const canSubmit = saving === "idle" && !blocked;

  return (
    <div className="bg-card border-border rounded-xl border border-solid p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-foreground text-base font-medium tracking-tight">
          Your specification
        </h2>
        <ProviderNote setup={setup} />
      </div>

      <p className="text-muted-foreground mt-2 text-sm">
        Requirements were extracted from your idea. Edit freely — the
        architecture is generated from what you confirm here.
      </p>

      <Tabs defaultValue="functional" className="mt-6">
        <TabsList className="w-fit">
          <TabsTrigger value="functional">Functional ({functional.length})</TabsTrigger>
          <TabsTrigger value="non-functional">
            Non-functional ({nonFunctional.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="functional" className="mt-4">
          <ul className="space-y-1">
            {functional.map((row, index) => (
              <li
                key={row.key}
                className="border-border/60 flex flex-wrap items-center gap-2 py-2"
              >
                <RowChip label={rowLabel("F", index)} />
                <Textarea
                  value={row.text}
                  maxLength={500}
                  aria-label={`Functional requirement ${index + 1}`}
                  onKeyDown={blockNewline}
                  onChange={(event) =>
                    setFunctional((rows) => updateRow(rows, row.key, { text: event.target.value }))
                  }
                  className="min-w-[240px] flex-1 resize-none overflow-y-auto py-1.5 font-mono text-xs min-h-9 max-h-48"
                />
                <PrioritySelect
                  value={row.priority}
                  onChange={(priority) =>
                    setFunctional((rows) => updateRow(rows, row.key, { priority }))
                  }
                />
                <RowButtons
                  onUp={() => setFunctional((rows) => moveRow(rows, row.key, -1))}
                  onDown={() => setFunctional((rows) => moveRow(rows, row.key, 1))}
                  onDelete={() => setDeleteTarget({ kind: "functional", key: row.key })}
                />
              </li>
            ))}
          </ul>
          <AddRowButton
            disabled={functional.length >= MAX_ROWS || saving !== "idle"}
            onAdd={() => setFunctional((rows) => addFunctionalRow(rows))}
            label="Add functional requirement"
          />
        </TabsContent>

        <TabsContent value="non-functional" className="mt-4">
          <ul className="space-y-1">
            {nonFunctional.map((row, index) => (
              <li
                key={row.key}
                className="border-border/60 flex flex-wrap items-center gap-2 py-2"
              >
                <RowChip label={rowLabel("NF", index)} />
                <Textarea
                  value={row.text}
                  maxLength={500}
                  aria-label={`Non-functional requirement ${index + 1}`}
                  onKeyDown={blockNewline}
                  onChange={(event) =>
                    setNonFunctional((rows) => updateRow(rows, row.key, { text: event.target.value }))
                  }
                  className="min-w-[240px] flex-1 resize-none overflow-y-auto py-1.5 font-mono text-xs min-h-9 max-h-48"
                />
                <PrioritySelect
                  value={row.priority}
                  onChange={(priority) =>
                    setNonFunctional((rows) => updateRow(rows, row.key, { priority }))
                  }
                />
                <CategorySelect
                  value={row.category}
                  onChange={(category) =>
                    setNonFunctional((rows) => updateRow(rows, row.key, { category }))
                  }
                />
                <Textarea
                  value={row.target}
                  maxLength={200}
                  placeholder="Measurable target (optional)"
                  aria-label={`Target for non-functional requirement ${index + 1}`}
                  onKeyDown={blockNewline}
                  onChange={(event) =>
                    setNonFunctional((rows) => updateRow(rows, row.key, { target: event.target.value }))
                  }
                  className="min-w-[200px] flex-1 resize-none overflow-y-auto py-1.5 font-mono text-xs min-h-9 max-h-24"
                />
                <RowButtons
                  onUp={() => setNonFunctional((rows) => moveRow(rows, row.key, -1))}
                  onDown={() => setNonFunctional((rows) => moveRow(rows, row.key, 1))}
                  onDelete={() => setDeleteTarget({ kind: "nonFunctional", key: row.key })}
                />
              </li>
            ))}
          </ul>
          <AddRowButton
            disabled={nonFunctional.length >= MAX_ROWS || saving !== "idle"}
            onAdd={() => setNonFunctional((rows) => addNonFunctionalRow(rows))}
            label="Add non-functional requirement"
          />
        </TabsContent>
      </Tabs>

      {/* Context: AI-proposed assumptions + clarification questions */}
      <div className="border-border mt-6 grid gap-6 border-t border-solid pt-6 md:grid-cols-2">
        <section aria-label="Assumptions">
          <h3 className="text-foreground text-sm font-medium">Assumptions</h3>
          <p className="text-muted-foreground mt-1 text-xs">
            Proposed by the model. Discard what you do not accept before confirming.
          </p>
          <ul className="mt-3 space-y-2">
            {assumptions.map((row, index) => (
              <li key={row.key} className="flex items-center gap-2">
                <RowChip label={rowLabel("A", index)} />
                <Textarea
                  value={row.text}
                  maxLength={500}
                  aria-label={`Assumption ${index + 1}`}
                  onKeyDown={blockNewline}
                  onChange={(event) =>
                    setAssumptions((rows) => updateRow(rows, row.key, { text: event.target.value }))
                  }
                  className="flex-1 resize-none overflow-y-auto py-1.5 font-mono text-xs min-h-9 max-h-48"
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Discard assumption ${index + 1}`}
                  onClick={() => setAssumptions((rows) => removeByKey(rows, row.key) as AssumptionRow[])}
                >
                  <TrashIcon />
                </Button>
              </li>
            ))}
          </ul>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              addAssumption();
            }}
          >
            <Textarea
              value={newAssumption}
              maxLength={500}
              placeholder="Add your own assumption…"
              onKeyDown={blockNewline}
              onChange={(event) => setNewAssumption(event.target.value)}
              className="flex-1 resize-none overflow-y-auto py-1.5 font-mono text-xs min-h-9 max-h-48"
            />
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={newAssumption.trim() === "" || assumptions.length >= MAX_ROWS}
            >
              <PlusIcon />
              Add
            </Button>
          </form>
        </section>

        <section aria-label="Clarification questions">
          <h3 className="text-foreground text-sm font-medium">Clarifications</h3>
          <p className="text-muted-foreground mt-1 text-xs">
            The model is unsure about these. Your answers become part of the
            confirmed spec; unanswered ones never block anything.
          </p>
          <ul className="mt-3 space-y-3">
            {clarifications.map((row, index) => {
              const unresolved = row.answer.trim() === "";
              return (
                <li key={row.key} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <RowChip label={rowLabel("Q", index)} />
                    {unresolved ? (
                      <span className="text-warning font-mono text-[10px]">awaiting answer</span>
                    ) : (
                      <span className="text-success font-mono text-[10px]">answered</span>
                    )}
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="ml-auto"
                      aria-label={`Remove question ${index + 1}`}
                      onClick={() => setDeleteTarget({ kind: "clarification", key: row.key })}
                    >
                      <TrashIcon />
                    </Button>
                  </div>
                  <Textarea
                    value={row.question}
                    maxLength={500}
                    aria-label={`Question ${index + 1}`}
                    onKeyDown={blockNewline}
                    onChange={(event) =>
                      setClarifications((rows) => updateRow(rows, row.key, { question: event.target.value }))
                    }
                    className="resize-none overflow-y-auto py-1.5 font-mono text-xs min-h-9 max-h-48"
                  />
                  <Textarea
                    value={row.answer}
                    maxLength={1000}
                    placeholder="Type your answer…"
                    aria-label={`Answer to question ${index + 1}`}
                    onKeyDown={blockNewline}
                    onChange={(event) =>
                      setClarifications((rows) => updateRow(rows, row.key, { answer: event.target.value }))
                    }
                    className="resize-none overflow-y-auto py-1.5 font-mono text-xs min-h-9 max-h-48"
                  />
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <div className="border-border mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-solid pt-4">
        <div className="flex items-center gap-3">
          {savedNote !== null ? (
            <p role="status" className="text-success text-xs">
              {savedNote}
            </p>
          ) : null}
          {blocked ? (
            <p className="text-warning text-xs">Fill every line (or delete it) before saving.</p>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => void save(false)}
            disabled={!canSubmit}
            className="min-h-9"
          >
            {saving === "draft" ? "Saving…" : "Save draft"}
          </Button>
          <Button
            onClick={() => void save(true)}
            disabled={!canSubmit}
            className="min-h-9 px-5"
          >
            <CheckIcon />
            {saving === "confirm" ? "Confirming…" : "Confirm & generate architecture"}
          </Button>
        </div>
      </div>

      {banner !== null ? (
        <div
          role="alert"
          className="border-destructive/40 bg-destructive/10 mt-4 rounded-lg border border-solid p-4"
        >
          <p className="text-destructive text-sm font-medium">{banner.user}</p>
          <p className="text-muted-foreground font-mono mt-1 text-xs">{banner.detail}</p>
        </div>
      ) : null}

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Delete this item?</DialogTitle>
            <DialogDescription>
              The row is removed from the specification when you save. This
              cannot be undone from the page.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Keep it
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              <TrashIcon />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PrioritySelect({
  value,
  onChange,
}: {
  value: FunctionalRow["priority"];
  onChange: (priority: FunctionalRow["priority"]) => void;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => onChange(next as FunctionalRow["priority"])}
    >
      <SelectTrigger
        className="w-[120px] font-mono text-xs"
        aria-label="Priority"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PRIORITIES.map((priority) => (
          <SelectItem key={priority} value={priority}>
            {priority}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CategorySelect({
  value,
  onChange,
}: {
  value: NonFunctionalRow["category"];
  onChange: (category: NonFunctionalRow["category"]) => void;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => onChange(next as NonFunctionalRow["category"])}
    >
      <SelectTrigger
        className="w-[150px] font-mono text-xs"
        aria-label="Category"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {CATEGORIES.map((category) => (
          <SelectItem key={category} value={category}>
            {category}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function RowButtons({
  onUp,
  onDown,
  onDelete,
}: {
  onUp: () => void;
  onDown: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="ml-auto flex items-center gap-1">
      <Button variant="ghost" size="icon-xs" aria-label="Move up" onClick={onUp}>
        <ArrowUpIcon />
      </Button>
      <Button variant="ghost" size="icon-xs" aria-label="Move down" onClick={onDown}>
        <ArrowDownIcon />
      </Button>
      <Button variant="ghost" size="icon-xs" aria-label="Delete row" onClick={onDelete}>
        <TrashIcon />
      </Button>
    </div>
  );
}

function AddRowButton({
  disabled,
  onAdd,
  label,
}: {
  disabled: boolean;
  onAdd: () => void;
  label: string;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-muted-foreground mt-2"
      disabled={disabled}
      onClick={onAdd}
    >
      <PlusIcon />
      {label}
    </Button>
  );
}
