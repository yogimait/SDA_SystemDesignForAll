import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AccessKeyService } from "../../src/common/access/access-key.service.js";
import { loadConfig } from "../../src/config/env.js";
import { DatabaseService } from "../../src/database/database.service.js";
import { DrizzleProjectRepository } from "../../src/database/repositories/drizzle-project.repository.js";
import { DrizzleRunRepository } from "../../src/database/repositories/drizzle-run.repository.js";

describe("database reopen", () => {
  let directory: string;
  let first: DatabaseService;
  let projectId: string;
  let runId: string;

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "sda-db-"));
    const config = loadConfig({
      NODE_ENV: "test",
      PGLITE_DATA_DIR: join(directory, "pglite"),
    } as NodeJS.ProcessEnv);

    first = new DatabaseService(config);
    await first.init();

    projectId = randomUUID();
    const projects = new DrizzleProjectRepository(first);
    await projects.create({
      id: projectId,
      idea: "A workspace.",
      accessKeyHash: new AccessKeyService().hash("key"),
    });

    const runs = new DrizzleRunRepository(first);
    runId = randomUUID();
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
    await runs.claimNextQueued();
    await first.onModuleDestroy();
  });

  afterAll(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("re-runs migrations idempotently and reconciles an interrupted run at boot", async () => {
    const config = loadConfig({
      NODE_ENV: "test",
      PGLITE_DATA_DIR: join(directory, "pglite"),
    } as NodeJS.ProcessEnv);
    const second = new DatabaseService(config);
    await second.init();

    const projects = new DrizzleProjectRepository(second);
    expect((await projects.findById(projectId))?.id).toBe(projectId);

    const runs = new DrizzleRunRepository(second);
    expect(await runs.reconcileInterrupted()).toBe(1);
    expect((await runs.findById(runId))?.status).toBe("interrupted");
    expect((await runs.listStages(runId))[0]?.status).toBe("failed");

    await second.onModuleDestroy();
  });
});
