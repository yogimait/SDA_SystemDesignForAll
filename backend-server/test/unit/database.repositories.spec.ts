import type {
  ArchitectureModel,
  ConfirmedRequirements,
  HldModel,
  RequirementsSpec,
  ValidationReport,
} from "@sda/contracts";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AccessKeyService } from "../../src/common/access/access-key.service.js";
import { loadConfig } from "../../src/config/env.js";
import { DatabaseService } from "../../src/database/database.service.js";
import { DrizzleArchitectureRepository } from "../../src/database/repositories/drizzle-architecture.repository.js";
import {
  DrizzleProjectRepository,
  DrizzleRequirementsRepository,
} from "../../src/database/repositories/drizzle-project.repository.js";
import { DrizzleRunRepository } from "../../src/database/repositories/drizzle-run.repository.js";

const spec: RequirementsSpec = {
  functional: [
    {
      id: "fr_one",
      kind: "functional",
      text: "Users can create a workspace.",
      priority: "must",
    },
  ],
  nonFunctional: [
    {
      id: "nfr_one",
      kind: "nonfunctional",
      text: "Reads stay fast.",
      priority: "should",
      category: "performance",
      target: "p95 under 200 ms",
    },
  ],
  assumptions: [
    {
      id: "asm_one",
      text: "One API instance is enough for the first release.",
    },
  ],
  clarifications: [
    {
      id: "q_one",
      question: "Should sharing be per item?",
      answer: "Yes.",
    },
  ],
};

const confirmed: ConfirmedRequirements = {
  confirmedAt: "2026-01-01T00:00:00.000Z",
  spec,
};

const hld: HldModel = {
  components: [],
  connections: [],
  flows: [],
  technologyDecisions: [],
  scalabilityNotes: [],
  failureScenarios: [],
};

const report: ValidationReport = {
  valid: true,
  errors: [],
  warnings: [],
  validatedAt: "2026-01-01T00:00:00.000Z",
};

const model: ArchitectureModel = {
  meta: { title: "Test model", summary: "Repository roundtrip." },
  requirements: confirmed,
  hld,
  lld: { classes: [], relationships: [], patterns: [] },
  dsa: { recommendations: [], algorithmicPatterns: [] },
  learningSteps: [
    {
      id: "step_one",
      title: "Start",
      explanation: "First step.",
      elementRefs: ["cmp_missing"],
    },
  ],
};

describe("Drizzle repositories on in-memory PGlite", () => {
  let database: DatabaseService;
  let projects: DrizzleProjectRepository;
  let requirements: DrizzleRequirementsRepository;
  let runs: DrizzleRunRepository;
  let architectures: DrizzleArchitectureRepository;

  beforeAll(async () => {
    database = new DatabaseService(
      loadConfig({
        NODE_ENV: "test",
        PGLITE_DATA_DIR: "memory://",
      } as NodeJS.ProcessEnv),
    );
    await database.init();
    projects = new DrizzleProjectRepository(database);
    requirements = new DrizzleRequirementsRepository(database);
    runs = new DrizzleRunRepository(database);
    architectures = new DrizzleArchitectureRepository(database);
  });

  afterAll(async () => {
    await database.onModuleDestroy();
  });

  it("persists a project with a hashed access key", async () => {
    const id = randomUUID();
    const access = new AccessKeyService();
    const { key, hash } = access.generate();

    const created = await projects.create({
      id,
      idea: "A workspace for small teams.",
      accessKeyHash: hash,
    });
    expect(created).toMatchObject({
      id,
      status: "requirements_pending",
      currentArchitectureVersion: null,
    });

    const loaded = await projects.findWithAccess(id);
    expect(loaded?.accessKeyHash).toBe(hash);
    expect(loaded?.accessKeyHash).not.toBe(key);
    expect(access.verify(key, loaded?.accessKeyHash ?? "")).toBe(true);
  });

  it("replaces and reloads the requirements spec", async () => {
    const id = randomUUID();
    await projects.create({
      id,
      idea: "A workspace.",
      accessKeyHash: new AccessKeyService().hash("key"),
    });

    await requirements.replace(id, spec);
    expect(await requirements.findByProjectId(id)).toEqual(spec);

    const edited: RequirementsSpec = {
      ...spec,
      functional: [{ ...spec.functional[0], text: "Edited text." }],
    };
    await requirements.replace(id, edited);
    const reloaded = await requirements.findByProjectId(id);
    expect(reloaded?.functional).toHaveLength(1);
    expect(reloaded?.functional[0].text).toBe("Edited text.");
    expect(reloaded?.clarifications[0].answer).toBe("Yes.");
  });

  it("queues, claims, updates, and reconciles runs", async () => {
    const projectId = randomUUID();
    await projects.create({
      id: projectId,
      idea: "A workspace.",
      accessKeyHash: new AccessKeyService().hash("key"),
    });

    const runId = randomUUID();
    await runs.create({
      id: runId,
      projectId,
      type: "requirements",
      provider: "mock",
      model: "test/model",
      scope: null,
      inputHash: "",
      stages: ["analyze_idea", "persist"],
    });
    expect(await runs.hasActiveRun(projectId)).toBe(true);

    const claimed = await runs.claimNextQueued();
    expect(claimed).toMatchObject({ id: runId, status: "running" });
    expect((await runs.listStages(runId)).map((stage) => stage.name)).toEqual([
      "analyze_idea",
      "persist",
    ]);

    await runs.updateStage(runId, "analyze_idea", {
      status: "succeeded",
      attempt: 1,
      finishedAt: new Date(),
    });
    await runs.updateRun(runId, {
      status: "succeeded",
      finishedAt: new Date(),
      usagePromptTokens: 10,
      usageCompletionTokens: 20,
    });
    expect(await runs.hasActiveRun(projectId)).toBe(false);
    expect((await runs.findById(runId))?.status).toBe("succeeded");

    const interruptedId = randomUUID();
    await runs.create({
      id: interruptedId,
      projectId,
      type: "architecture",
      provider: "mock",
      model: "test/model",
      scope: null,
      inputHash: "hash",
      stages: ["hld_model"],
    });
    expect(await runs.claimNextQueued()).toMatchObject({
      id: interruptedId,
      status: "running",
    });

    expect(await runs.reconcileInterrupted()).toBe(1);
    expect((await runs.findById(interruptedId))?.status).toBe("interrupted");
    expect((await runs.listStages(interruptedId))[0]?.status).toBe("failed");
  });

  it("reuses a validated HLD from a failed full run only", async () => {
    const projectId = randomUUID();
    await projects.create({
      id: projectId,
      idea: "A workspace.",
      accessKeyHash: new AccessKeyService().hash("key"),
    });

    const failedRunId = randomUUID();
    await runs.create({
      id: failedRunId,
      projectId,
      type: "architecture",
      provider: "mock",
      model: "test/model",
      scope: null,
      inputHash: "same-input",
      stages: ["hld_model"],
    });
    await runs.claimNextQueued();
    await runs.updateStage(failedRunId, "hld_model", {
      status: "succeeded",
      result: hld,
      finishedAt: new Date(),
    });
    await runs.updateRun(failedRunId, {
      status: "failed",
      errorCode: "GENERATION_REPAIR_FAILED",
      finishedAt: new Date(),
    });

    expect(await runs.findReusableHld(projectId, "same-input")).toEqual(hld);
    expect(await runs.findReusableHld(projectId, "other-input")).toBeNull();
  });

  it("versions architectures and finds the current one", async () => {
    const projectId = randomUUID();
    await projects.create({
      id: projectId,
      idea: "A workspace.",
      accessKeyHash: new AccessKeyService().hash("key"),
    });

    expect(await architectures.nextVersion(projectId)).toBe(1);
    const version = await architectures.create({
      id: randomUUID(),
      projectId,
      version: 1,
      model,
      validationReport: report,
      requirementsSnapshot: confirmed,
      createdByRunId: null,
    });
    expect(version.version).toBe(1);

    await expect(
      architectures.create({
        id: randomUUID(),
        projectId,
        version: 1,
        model,
        validationReport: report,
        requirementsSnapshot: confirmed,
        createdByRunId: null,
      }),
    ).rejects.toThrow();

    expect(await architectures.nextVersion(projectId)).toBe(2);
    const latest = await architectures.findLatest(projectId);
    expect(latest).toMatchObject({
      projectId,
      version: 1,
      validationReport: report,
    });
    expect(latest?.model).toEqual(model);
    expect(
      await architectures.findByProjectAndVersion(projectId, 99),
    ).toBeNull();

    const updated = await projects.update(projectId, {
      status: "architecture_ready",
      currentArchitectureVersion: 1,
      requirementsConfirmedAt: new Date("2026-01-01T00:00:00.000Z"),
      requirementsSnapshot: confirmed,
    });
    expect(updated).toMatchObject({
      status: "architecture_ready",
      currentArchitectureVersion: 1,
    });
  });
});
