import { describe, expect, it, vi } from "vitest";
import type { UserRow } from "../../src/database/repositories/user.repository.js";
import type { ProjectRow } from "../../src/database/repositories/project.repository.js";
import { PlanService, PLAN_LIMITS } from "../../src/plans/plan.service.js";

const user = {
  id: "usr_test",
  planTier: "free",
} as UserRow;
const project = {
  id: "project",
  ownerId: user.id,
} as ProjectRow;

function make(count = 0, runs = [] as Array<{
  usagePromptTokens: number;
  usageCompletionTokens: number;
}>) {
  const projects = {
    countForOwner: vi.fn(async () => count),
  };
  const analytics = {
    listRunsByOwner: vi.fn(async () => runs),
  };
  return {
    service: new PlanService(
      projects as never,
      analytics as never,
    ),
    projects,
    analytics,
  };
}

describe("PlanService", () => {
  it("limits free-plan projects", async () => {
    const { service } = make(PLAN_LIMITS.free.projects);
    await expect(service.assertCanCreateProject(user)).rejects.toMatchObject({
      code: "PLAN_LIMIT_EXCEEDED",
      details: { limitType: "projects", upgradeRequired: true },
    });
  });

  it("limits runs and tokens in the last 30 days", async () => {
    const run = { usagePromptTokens: 1, usageCompletionTokens: 1 };
    const { service: runLimited } = make(
      0,
      Array.from({ length: PLAN_LIMITS.free.runsPer30Days }, () => run),
    );
    await expect(
      runLimited.assertCanStartRun(user, project),
    ).rejects.toMatchObject({ details: { limitType: "runsPer30Days" } });

    const { service: tokenLimited } = make(0, [
      {
        usagePromptTokens: PLAN_LIMITS.free.tokensPer30Days,
        usageCompletionTokens: 0,
      },
    ]);
    await expect(
      tokenLimited.assertCanStartRun(user, project),
    ).rejects.toMatchObject({ details: { limitType: "tokensPer30Days" } });
  });

  it("requires Pro for scoped regeneration", () => {
    const { service } = make();
    expect(() => service.assertCanRegenerate(user, project)).toThrow(
      "Scoped regeneration requires the Pro plan.",
    );
    expect(() =>
      service.assertCanRegenerate(
        { ...user, planTier: "pro" } as UserRow,
        project,
      ),
    ).not.toThrow();
  });

  it("does not apply account limits to anonymous projects", async () => {
    const { service, projects, analytics } = make(999, []);
    await expect(
      service.assertCanCreateProject(undefined),
    ).resolves.toBeUndefined();
    await expect(
      service.assertCanStartRun(undefined, { ...project, ownerId: null } as ProjectRow),
    ).resolves.toBeUndefined();
    expect(projects.countForOwner).not.toHaveBeenCalled();
    expect(analytics.listRunsByOwner).not.toHaveBeenCalled();
  });
});
