# External Review Record — Local AI Workforce

Recorded 2026-11-13. This is a review record, not a benchmark and not a
release gate.

| Field | Value |
| --- | --- |
| Artifact | `C:\Users\Hp\Downloads\SDA-testing-Agent-bots.pdf` |
| Pages | 17 |
| Generated | 2026-11-13 12:08 pm |
| Export route | `https://sda.nerddog.me/projects/b710a38e-234c-40c8-af59-bd6d3918.../export` (print header truncates the id) |
| Page format | US Letter portrait, 612 × 792 pt, browser print header/footer |
| Review source | ChatGPT review, received as a summary; original review text is not stored here |
| Reported score | 8.2/10 (qualitative, second-hand, no rubric or anchors) |
| PDF text layer | Body content is rasterized; only the print header/footer extracts as text, so evidence below was read visually |

## What the external review got right

- **Security architecture is missing.** The design has no sandbox, no tool
  permission model, no secret broker, no prompt-injection boundary, and no
  approval gate for destructive actions. Page 5 states "No auth beyond
  loopback"; the LLM gateway holds the provider key directly.
- **Agent execution runtime is underspecified.** There is no runtime adapter,
  tool-call contract, timeout, cancellation path, or sandbox handle. Page 7's
  `TestAgent` "reviews/tests produced code" with no execution contract, while
  page 3 says code execution is out of scope.
- **Event recovery is thin.** Page 16 correctly says the in-process bus does not
  survive an orchestrator restart and the UI must resync, but there is no
  durable replay, no explicit source-of-truth statement, and no recovery
  sequence.
- **Diagram readability is poor.** Pages 4 and 6 are wide landscape diagrams
  scaled into a portrait page; text is unreadable at print size.
- **Sequence diagrams and interactive learning are absent.** Only two diagrams
  exist (HLD page 4, LLD page 6). Flows are prose lists; learning steps are
  static text.

The review **overstates** one point: SQLite concurrency is partly addressed.
Pages 10, 15, and 16 describe an atomic claim (`UPDATE … WHERE id = (SELECT …
LIMIT 1) … RETURNING` in one transaction), WAL mode, and the single-writer
limit. The real gap is narrower: stale-claim lease and reclaim, `SQLITE_BUSY`
handling, checkpoint behaviour, and a written recovery procedure.

## Classification: platform vs generated design vs export

| Finding | Class | Evidence |
| --- | --- | --- |
| Local-only NFR vs cloud LLM clarification | Generated design, with a platform validator gap | Page 2 |
| Execution "out of scope" vs `TestAgent` runs code | Generated design, with a platform validator gap | Pages 2, 3, 7 |
| No security architecture for tools, secrets, injection, destructive actions | Generated design, with a platform rubric gap | Pages 5, 7 |
| No runtime adapter, tool contract, cancellation, timeout | Generated design, with a contract/schema gap | Page 7 |
| SQLite recovery only partial | Generated design | Pages 10, 15, 16 |
| Diagram unreadable on paper | Export | Pages 4, 6 |
| Relationships print without endpoint names | Export | Page 8; `frontend_client/components/export/export-document.tsx` renders only multiplicities and rationale, although the contract has `sourceId`/`targetId` |
| Header URL truncated or clipped, inconsistent spacing | Export | Pages 2, 3, 4, 5, 6, 7, 8, 9 |
| 17 pages with large blank areas | Export | Pages 1, 3, 4, 6, 9, 10, 13 |
| Validation reports one warning only | Platform validator | Page 17 |
| No sequence diagrams | Product gap | Whole document |
| Static learning steps | Product follow-up | Page 16 |

Platform conclusion: the validator checks NFR measurability but not
requirement consistency. It flagged the least important NFR on page 17 while
missing the page 2/3 contradictions. That is a validation-rule gap, not a model
quality signal.

## Concrete evidence

- **Page 1** — title "Local AI Workforce - Low-Level Design", version v1,
  generated November 13, 2026, validation "valid · 1 warning".
- **Pages 2–3 contradiction.** Page 2 NFR 1 requires "Runs fully locally: no
  task data leaves the machine … 0 external network calls when offline/local-LLM
  mode is enabled". Page 2 clarification 1 answers: "I am only gonna use Cloud
  LLM API, specifically Opencode go. No Local LLM inference". Page 3 assumption
  2 then says it "is not yet specified whether they call cloud LLM APIs".
- **Execution scope contradiction.** Page 3 assumption 3: "actual execution of
  generated code is out of scope unless stated". Page 2 clarification 2 says a
  test agent "will be given the task and according to it do testing". Page 7
  `TestAgent` "reviews/tests produced code".
- **Pages 4 and 6 diagrams.** Both diagrams render as a shallow horizontal band on
  a portrait Letter page, with large empty margins above and below. Labels are
  illegible at page scale.
- **Page 8 relationships.** Rows print as "1: association → 1 Maps
  conn_orch_store." and "1: inheritance → 1 Role specialization." (repeated six
  times) with no source or target class names.
- **Pages 9–15 DSA is strong.** Topological scheduling, atomic claim with WAL,
  artifact references instead of payloads, FTS5 search, event ring buffer. Each
  entry gives average/worst complexity, assumptions, alternatives, limitations,
  and requirement references (for example FR 1, FR 5, NFR 4).
- **Page 16.** Five learning steps exist; the bus "does not survive orchestrator
  restart; UI must resync full state on reconnect".
- **Page 17.** Exactly one validation warning: NFR "All prompts, configs, and
  agent outputs are logged locally for debugging." has no measurable target.

## Score handling

The 8.2/10 is qualitative and must not be a release gate. It has no rubric, no
anchors, no repeats, and no stored review text. Judge validity remains
unresolved per `eval/PENDING.md`: absolute semantic scores disagree between
judges, no human labels exist, and control stability is poor. Do not add this
score to a baseline, regression check, or model comparison.

## Draft validation case — not in the frozen dataset

Proposed id `TC-WORKFORCE-013`, split `validation`, status `draft`. It is
**not** added to `eval/datasets/sda-v1/cases.jsonl`. Adding it requires a new
dataset version and manifest hash; the current file is frozen at 12 dev cases.
The case deliberately resolves the page 2/3 contradictions into explicit
clarifications so requirement consistency becomes testable.

```json
{
  "id": "TC-WORKFORCE-013",
  "dataset_version": "sda-v1",
  "split": "validation",
  "stages": ["requirements", "hld", "lld", "dsa", "learning"],
  "domain": "ai-workforce",
  "complexity": "high",
  "idea": "Design a single-machine AI workforce orchestrator that decomposes a user instruction into a persisted task graph, dispatches subtasks to role-specialist agents through a durable SQLite queue, executes approved tools in a sandbox, and routes every model call through one configurable LLM gateway.",
  "confirmed_requirements": {
    "functional": [
      { "id": "fr_wf_intake", "text": "Accept one instruction and decompose it into a persisted task graph with dependencies.", "priority": "must" },
      { "id": "fr_wf_dispatch", "text": "Dispatch ready subtasks to role workers and record every state transition.", "priority": "must" },
      { "id": "fr_wf_result", "text": "Return a structured result per subtask: artifact reference, summary, status, and error or partial output.", "priority": "must" },
      { "id": "fr_wf_dashboard", "text": "Show live agent, task, and run state in a local dashboard.", "priority": "must" },
      { "id": "fr_wf_retry", "text": "Retry failed subtasks with bounded attempts and backoff, and report partial results on exhaustion.", "priority": "should" },
      { "id": "fr_wf_history", "text": "Persist and search run history, prompts, and artifacts locally.", "priority": "should" },
      { "id": "fr_wf_approval", "text": "Require explicit approval before destructive or externally visible tool actions.", "priority": "must" },
      { "id": "fr_wf_cancel", "text": "Cancel a run and stop or reap its running workers.", "priority": "must" },
      { "id": "fr_wf_audit", "text": "Record which agent, model, tool, and approval produced each artifact.", "priority": "must" }
    ],
    "nonFunctional": [
      { "id": "nfr_wf_cloud", "text": "Cloud LLM calls are allowed through the configured gateway; no other outbound traffic is permitted.", "priority": "must", "category": "security", "target": "egress limited to the configured provider endpoint, zero other external calls" },
      { "id": "nfr_wf_state", "text": "Agent state changes appear in the dashboard promptly.", "priority": "must", "category": "performance", "target": "visible within 2 seconds" },
      { "id": "nfr_wf_concurrency", "text": "The orchestrator stays responsive while agents run in parallel.", "priority": "should", "category": "performance", "target": "at least 4 concurrent agents, API p95 under 500 ms" },
      { "id": "nfr_wf_recovery", "text": "A crash preserves the task graph and completed subtasks.", "priority": "must", "category": "reliability", "target": "zero lost completed subtask results after an orchestrator or worker crash" },
      { "id": "nfr_wf_claim", "text": "A crashed worker's claimed subtask is reclaimed without double completion.", "priority": "must", "category": "reliability", "target": "reclaim after a bounded lease; no two workers complete the same subtask" },
      { "id": "nfr_wf_memory", "text": "Combined agent processes leave the machine usable.", "priority": "must", "category": "scalability", "target": "no more than 80% of system RAM at steady state" },
      { "id": "nfr_wf_secrets", "text": "Provider and tool credentials never reach agent context, artifacts, or logs.", "priority": "must", "category": "security", "target": "brokered, short-lived credentials; zero secrets in stored artifacts and logs" },
      { "id": "nfr_wf_sandbox", "text": "Generated code executes only in a sandbox with least-privilege tool access.", "priority": "must", "category": "security", "target": "no host or other-run access outside declared capabilities" },
      { "id": "nfr_wf_logs", "text": "Every run produces a local structured log.", "priority": "should", "category": "maintainability", "target": "one log per run, rotated at 50 MB, retained 7 days" }
    ],
    "assumptions": [
      "Single user, single machine; no multi-user auth is required.",
      "Windows 11 is the primary host but the design stays OS-independent.",
      "The host has 16 GB RAM; local LLM inference is not required.",
      "A run is bounded to tens of subtasks and minutes to hours."
    ],
    "clarifications": [
      "Cloud LLM use is confirmed; local-only applies to task data and artifacts, not model inference.",
      "Code execution by the test agent is in scope and must be sandboxed.",
      "One provider key is configured on the host and never handed to an agent."
    ]
  },
  "must_have_behaviors": [
    "durable task graph",
    "dependency-aware dispatch",
    "atomic claim",
    "lease-based reclaim",
    "structured subtask results",
    "cancellation propagation",
    "sandboxed code execution",
    "tool capability permissions",
    "brokered short-lived credentials",
    "approval gate for destructive actions",
    "untrusted-content boundary for retrieved text",
    "egress allowlist",
    "run audit trail",
    "crash recovery",
    "dashboard resync after restart",
    "measurable log retention"
  ],
  "acceptable_alternatives": [
    "SQLite WAL queue",
    "process-per-role workers",
    "subprocess sandbox with OS-level isolation",
    "provider-agnostic gateway adapter",
    "append-only audit table",
    "FTS5 search",
    "bounded event ring buffer plus full-state resync"
  ],
  "anti_patterns": [
    "claiming local-only while calling a cloud LLM",
    "declaring execution out of scope while a test agent runs code",
    "in-memory-only queue",
    "claim without a lease or reclaim path",
    "agent holding the provider key",
    "unsandboxed code execution",
    "auto-approving destructive tool calls",
    "treating retrieved web or tool content as instructions",
    "unbounded logs",
    "blocking the request path on a full agent run",
    "event bus as the source of truth"
  ],
  "component_expectations": {
    "hld": ["local dashboard", "local API gateway", "orchestrator", "task store", "task queue", "worker pool", "LLM gateway", "sandbox runner", "tool broker", "artifact store", "event bus", "observability"],
    "lld": ["orchestrator", "task graph", "subtask", "task queue", "specialist worker", "agent runtime adapter", "tool registry", "approval gate", "LLM gateway", "secret broker", "artifact store", "event bus"],
    "dsa": ["topological sort", "atomic claim", "lease expiry and reclaim", "retry backoff", "FTS5 search", "bounded event ring buffer"],
    "learning": ["dependency scheduling", "durable claim", "sandbox isolation", "approval gating"]
  },
  "review": { "status": "draft", "reviewer": null, "reviewed_at": null },
  "tags": ["agents", "orchestration", "sqlite", "sandbox", "security", "high"]
}
```

## Next actions mapped to product areas

| Area | Action | Priority |
| --- | --- | --- |
| Requirements stage and validator | Add consistency checks: local-only vs cloud calls, assumption vs component behaviour, execution scope vs workers. Report conflicts as blocking findings, not warnings. | High |
| LLD contract and prompt | Add an agent runtime contract: tool call, timeout, cancellation, sandbox handle, structured error. Require a security section for agent/tool systems. | High |
| Requirements/HLD prompts | Require an explicit source of truth and a crash-recovery sequence. | High |
| DSA prompt | Add stale-claim lease and reclaim, `SQLITE_BUSY` handling, WAL checkpointing. | Medium |
| Export | Print diagrams on landscape pages regardless of dialog defaults; warn when the chosen paper is portrait; add a minimum legible scale. Print relationship endpoints by mapping `sourceId`/`targetId` to class names. Stop truncating the source URL. | High |
| Product | Sequence diagrams for happy path, retry, and recovery; interactive learning tied to model elements. | Medium |
| Eval | Add `TC-WORKFORCE-013` only in a new dataset version, then validate schema and hash. Do not gate on the 8.2 score. | Medium |
