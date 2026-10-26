import type { HldModel } from "@sda/contracts";
import { describe, expect, it } from "vitest";
import { AppError } from "../../src/common/errors/app-error.js";
import { ArchitectureGenerator } from "../../src/generation/architecture.generator.js";
import { RequirementsGenerator } from "../../src/generation/requirements.generator.js";
import { invalidOutputIssue } from "../../src/generation/output-issues.js";
import type {
  GenerateStructuredInput,
  GeneratedStructured,
  ModelProvider,
} from "../../src/providers/model-provider.js";
import { MockProvider } from "../../src/providers/mock/mock.provider.js";

type Step = unknown;

class ScriptedProvider implements ModelProvider {
  readonly id = "scripted";
  readonly calls: GenerateStructuredInput[] = [];

  constructor(private readonly steps: Step[]) {}

  async generateStructured(
    input: GenerateStructuredInput,
  ): Promise<GeneratedStructured> {
    this.calls.push(input);
    const step = this.steps.shift();
    if (step instanceof Error) {
      throw step;
    }
    if (step === undefined) {
      throw new Error("Scripted provider ran out of steps.");
    }
    return { data: step, usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 } };
  }
}

function invalidJson(): AppError {
  return new AppError(
    "INVALID_MODEL_OUTPUT",
    "The model returned invalid JSON.",
  );
}

function truncatedOutput(): AppError {
  return new AppError(
    "INVALID_MODEL_OUTPUT",
    "The model response was truncated before completion.",
    {
      reason: "truncated_output",
      finishReason: "length",
      maxOutputTokens: 64_000,
      usage: {
        promptTokens: 100,
        completionTokens: 64_000,
        totalTokens: 64_100,
      },
      reasoningTokens: 12_000,
    },
  );
}

const requirements = {
  confirmedAt: "2026-01-01T00:00:00.000Z",
  spec: {
    functional: [
      {
        id: "fr_one",
        kind: "functional" as const,
        text: "Users can create a workspace.",
        priority: "must" as const,
      },
    ],
    nonFunctional: [],
    assumptions: [],
    clarifications: [],
  },
};

async function mockHld(): Promise<HldModel> {
  const mock = new MockProvider();
  return (
    await mock.generateStructured({
      model: "test/model",
      system: "",
      messages: [],
      schemaName: "hld_model",
      jsonSchema: {},
      maxOutputTokens: 100,
      timeoutMs: 1000,
    })
  ).data as HldModel;
}

describe("RequirementsGenerator repair path", () => {
  it("fails with GENERATION_REPAIR_FAILED after two invalid JSON responses", async () => {
    const provider = new ScriptedProvider([invalidJson(), invalidJson()]);
    const generator = new RequirementsGenerator();

    await expect(
      generator.generate(provider, "test/model", "An idea."),
    ).rejects.toMatchObject({
      code: "GENERATION_REPAIR_FAILED",
      details: { attempts: 2 },
    });
    expect(provider.calls).toHaveLength(2);
    expect(provider.calls[1].messages.at(-1)?.content).toContain(
      "not valid JSON",
    );
  });

  it("fails fast when the output is truncated", async () => {
    const provider = new ScriptedProvider([truncatedOutput()]);
    const generator = new RequirementsGenerator();

    await expect(
      generator.generate(provider, "test/model", "An idea."),
    ).rejects.toMatchObject({
      code: "GENERATION_REPAIR_FAILED",
      details: {
        stage: "requirements_analysis",
        attempts: 1,
        issues: [{ rule: "truncated_output" }],
      },
    });
    expect(provider.calls).toHaveLength(1);
  });
});

describe("ArchitectureGenerator repair path", () => {
  it("fails with GENERATION_REPAIR_FAILED after all HLD attempts return invalid JSON", async () => {
    const provider = new ScriptedProvider([
      invalidJson(),
      invalidJson(),
      invalidJson(),
    ]);
    const generator = new ArchitectureGenerator();

    await expect(
      generator.generateHld(provider, "test/model", "An idea.", requirements),
    ).rejects.toMatchObject({
      code: "GENERATION_REPAIR_FAILED",
      details: { stage: "hld_model", attempts: 3 },
    });
    expect(provider.calls).toHaveLength(3);
  });

  it("succeeds after one invalid JSON response", async () => {
    const hld = await mockHld();
    const provider = new ScriptedProvider([invalidJson(), hld]);
    const generator = new ArchitectureGenerator();

    const result = await generator.generateHld(
      provider,
      "test/model",
      "An idea.",
      requirements,
    );
    expect(result.attempts).toBe(2);
    expect(result.hld).toEqual(hld);
    expect(result.usage.totalTokens).toBe(3);
  });

  it("fails fast when the LLD/DSA output is truncated", async () => {
    const hld = await mockHld();
    const provider = new ScriptedProvider([truncatedOutput()]);
    const generator = new ArchitectureGenerator();

    await expect(
      generator.generateLldDsa(
        provider,
        "test/model",
        "An idea.",
        requirements,
        hld,
      ),
    ).rejects.toMatchObject({
      code: "GENERATION_REPAIR_FAILED",
      details: {
        stage: "lld_dsa_model",
        attempts: 1,
        issues: [{ rule: "truncated_output" }],
      },
    });
    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0].maxOutputTokens).toBe(64_000);
    expect(provider.calls[0].timeoutMs).toBe(900_000);
  });
});

describe("truncation diagnostics", () => {
  it("reports the token budget and reasoning share", () => {
    const issue = invalidOutputIssue(truncatedOutput());
    expect(issue.rule).toBe("truncated_output");
    expect(issue.message).toContain("budget: 64,000 tokens");
    expect(issue.message).toContain("reasoning: 12,000 tokens");
  });
});
