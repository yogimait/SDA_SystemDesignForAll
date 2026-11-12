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
import { DrizzleUserRepository } from "../../src/database/repositories/drizzle-user.repository.js";
import { DrizzleSessionRepository } from "../../src/database/repositories/drizzle-session.repository.js";
import { DrizzleAccountRepository } from "../../src/database/repositories/drizzle-account.repository.js";
import { DrizzleAnalyticsRepository } from "../../src/database/repositories/drizzle-analytics.repository.js";
import { DrizzleTokenRepository } from "../../src/database/repositories/drizzle-token.repository.js";
import { DrizzleBillingRepository } from "../../src/database/repositories/drizzle-billing.repository.js";
import { DrizzleOutboxRepository } from "../../src/database/repositories/drizzle-outbox.repository.js";

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
  let users: DrizzleUserRepository;
  let sessions: DrizzleSessionRepository;
  let account: DrizzleAccountRepository;
  let analytics: DrizzleAnalyticsRepository;
  let tokens: DrizzleTokenRepository;
  let billing: DrizzleBillingRepository;
  let outbox: DrizzleOutboxRepository;

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
    users = new DrizzleUserRepository(database);
    sessions = new DrizzleSessionRepository(database);
    account = new DrizzleAccountRepository(database);
    analytics = new DrizzleAnalyticsRepository(database);
    tokens = new DrizzleTokenRepository(database);
    billing = new DrizzleBillingRepository(database);
    outbox = new DrizzleOutboxRepository(database);
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

  it("persists users, sessions, saved provider config, preferences, and owned projects", async () => {
    const userId = `usr_${randomUUID().replaceAll("-", "")}`;
    const email = `${userId}@example.com`;
    const user = await users.create({
      id: userId,
      email,
      passwordHash: "scrypt$test",
      planTier: "free",
    });
    expect(user.id).toBe(userId);
    expect(await users.findByEmail(email)).toMatchObject({ id: userId });
    expect(await users.findById(userId)).toMatchObject({ planTier: "free" });

    const sessionId = randomUUID();
    const tokenHash = `hash_${sessionId}`;
    await sessions.create({
      id: sessionId,
      userId,
      tokenHash,
      expiresAt: new Date(Date.now() + 60_000),
    });
    expect(await sessions.findActiveByTokenHash(tokenHash, new Date())).toMatchObject({
      userId,
    });
    await sessions.revokeByTokenHash(tokenHash);
    expect(await sessions.findActiveByTokenHash(tokenHash, new Date())).toBeNull();

    const saved = await account.saveProviderConfig(userId, {
      provider: "openrouter",
      model: "z-ai/glm-5.3-flash",
      reasoningEffort: "low",
    });
    expect(saved).toMatchObject({
      userId,
      provider: "openrouter",
      reasoningEffort: "low",
    });
    expect(await account.getProviderConfig(userId)).toMatchObject({
      model: "z-ai/glm-5.3-flash",
    });

    const preferences = await account.savePreferences(userId, {
      theme: "dark",
      defaultProvider: "openrouter",
      defaultModel: "z-ai/glm-5.3-flash",
    });
    expect(preferences).toMatchObject({
      userId,
      theme: "dark",
      defaultProvider: "openrouter",
    });

    const projectIds: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const projectId = randomUUID();
      projectIds.push(projectId);
      await projects.create({
        id: projectId,
        ownerId: userId,
        idea: `Owned project ${index}`,
        accessKeyHash: new AccessKeyService().hash(`key-${index}`),
      });
    }
    expect(await projects.countForOwner(userId)).toBe(3);
    const firstPage = await projects.listForOwner({
      ownerId: userId,
      limit: 2,
    });
    expect(firstPage.projects).toHaveLength(2);
    expect(firstPage.nextCursor).not.toBeNull();
    const secondPage = await projects.listForOwner({
      ownerId: userId,
      limit: 2,
      cursor: firstPage.nextCursor ?? undefined,
    });
    expect(secondPage.projects).toHaveLength(1);
    expect(secondPage.projects[0]?.ownerId).toBe(userId);

    const runId = randomUUID();
    await runs.create({
      id: runId,
      projectId: projectIds[0],
      type: "requirements",
      provider: "mock",
      model: "test/model",
      scope: null,
      inputHash: "",
      stages: ["analyze_idea", "persist"],
    });
    await runs.updateRun(runId, {
      status: "succeeded",
      usagePromptTokens: 11,
      usageCompletionTokens: 7,
      finishedAt: new Date(),
    });
    const analyticsRuns = await analytics.listRunsByOwner(
      userId,
      new Date(Date.now() - 60_000),
    );
    expect(analyticsRuns).toHaveLength(1);
    expect(analyticsRuns[0]).toMatchObject({
      id: runId,
      usagePromptTokens: 11,
      usageCompletionTokens: 7,
    });

    expect(
      await users.updatePlanTier(userId, "pro"),
    ).toMatchObject({ planTier: "pro" });
  });

  it("rotates refresh tokens, consumes single-use tokens, and isolates billing events", async () => {
    const userId = `usr_${randomUUID().replaceAll("-", "")}`;
    await users.create({
      id: userId,
      email: `${userId}@example.com`,
      passwordHash: "scrypt$test",
      planTier: "free",
    });

    const familyId = randomUUID();
    const firstRefresh = randomUUID();
    await tokens.createRefresh({
      id: firstRefresh,
      userId,
      tokenHash: `refresh_${firstRefresh}`,
      familyId,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const secondRefresh = randomUUID();
    expect(
      await tokens.rotateRefresh(firstRefresh, secondRefresh, new Date()),
    ).toBe(true);
    expect(
      await tokens.rotateRefresh(firstRefresh, randomUUID(), new Date()),
    ).toBe(false);
    await tokens.revokeRefreshFamily(familyId, new Date());
    expect(
      (await tokens.findRefreshByTokenHash(`refresh_${firstRefresh}`))
        ?.revokedAt,
    ).not.toBeNull();

    const verificationId = randomUUID();
    await tokens.createEmailVerification({
      id: verificationId,
      userId,
      tokenHash: `verify_${verificationId}`,
      expiresAt: new Date(Date.now() + 60_000),
    });
    expect(
      await tokens.consumeEmailVerification(`verify_${verificationId}`, new Date()),
    ).toMatchObject({ userId });
    expect(
      await tokens.consumeEmailVerification(`verify_${verificationId}`, new Date()),
    ).toBeNull();

    const expiredResetId = randomUUID();
    await tokens.createPasswordReset({
      id: expiredResetId,
      userId,
      tokenHash: `reset_${expiredResetId}`,
      expiresAt: new Date(Date.now() - 1_000),
    });
    expect(
      await tokens.consumePasswordReset(`reset_${expiredResetId}`, new Date()),
    ).toBeNull();

    expect(await billing.getSubscription(userId)).toBeNull();
    const subscription = await billing.upsertSubscription({
      id: randomUUID(),
      userId,
      plan: "pro",
      status: "active",
      provider: "stub",
      currentPeriodEnd: new Date(Date.now() + 86_400_000),
      cancelAtPeriodEnd: false,
      now: new Date(),
    });
    expect(subscription).toMatchObject({ userId, plan: "pro", status: "active" });

    const updated = await billing.upsertSubscription({
      id: randomUUID(),
      userId,
      plan: "pro",
      status: "canceled",
      provider: "stub",
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: true,
      now: new Date(),
    });
    // One subscription row per user: the upsert keeps the original id.
    expect(updated.id).toBe(subscription.id);
    expect(updated.cancelAtPeriodEnd).toBe(true);

    expect(await billing.findEvent("evt_once")).toBeNull();
    const event = await billing.recordEvent({
      id: randomUUID(),
      userId,
      provider: "stub",
      idempotencyKey: "evt_once",
      type: "checkout.session.completed",
      payload: { id: "evt_once" },
      processedAt: null,
    });
    expect(event?.userId).toBe(userId);
    await billing.markEventProcessed(event!.id, new Date());
    expect((await billing.findEvent("evt_once"))?.processedAt).not.toBeNull();
    // A duplicate insert is acknowledged as a no-op, not an error.
    await expect(
      billing.recordEvent({
        id: randomUUID(),
        userId,
        provider: "stub",
        idempotencyKey: "evt_once",
        type: "checkout.session.completed",
        payload: {},
        processedAt: null,
      }),
    ).resolves.toBeNull();

    const message = await outbox.create({
      id: randomUUID(),
      kind: "password_reset",
      recipient: `${userId}@example.com`,
      link: "http://localhost:3000/reset-password?token=dev",
    });
    expect((await outbox.listRecent(5))[0]).toMatchObject({ id: message.id });
  });

  it("nulls project ownership and cascades auth rows when a user is deleted", async () => {
    const userId = `usr_${randomUUID().replaceAll("-", "")}`;
    await users.create({
      id: userId,
      email: `${userId}@example.com`,
      passwordHash: "scrypt$test",
      planTier: "free",
    });
    const projectId = randomUUID();
    await projects.create({
      id: projectId,
      ownerId: userId,
      idea: "Owned project",
      accessKeyHash: new AccessKeyService().hash("key"),
    });
    await account.savePreferences(userId, { theme: "dark" });
    const sessionId = randomUUID();
    await sessions.create({
      id: sessionId,
      userId,
      tokenHash: `session_${sessionId}`,
      expiresAt: new Date(Date.now() + 60_000),
    });
    await billing.recordEvent({
      id: randomUUID(),
      userId,
      provider: "stub",
      idempotencyKey: "evt_delete",
      type: "checkout.session.completed",
      payload: {},
      processedAt: null,
    });

    await users.delete(userId);

    expect(await users.findById(userId)).toBeNull();
    expect((await projects.findById(projectId))?.ownerId).toBeNull();
    expect(await account.getPreferences(userId)).toBeNull();
    expect(
      await sessions.findActiveByTokenHash(`session_${sessionId}`, new Date()),
    ).toBeNull();
    // billing_events.user_id cascades with the user row.
    expect(await billing.findEvent("evt_delete")).toBeNull();
  });
});
