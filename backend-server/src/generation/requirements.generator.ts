import type {
  ChatMessage,
  GeneratedStructured,
  ModelProvider,
} from "../providers/model-provider.js";
import { zodToJsonSchema } from "../providers/json-schema.js";
import { AppError } from "../common/errors/app-error.js";
import { invalidOutputRepair } from "./output-issues.js";
import type {
  RequirementsAnalysisOutput,
  RequirementsSpec,
  TokenUsage,
  ValidationIssue,
} from "@sda/contracts";
import { RequirementsAnalysisOutputSchema } from "@sda/contracts";
import {
  buildRepairMessage,
  requirementsSystemPrompt,
  requirementsUserPrompt,
} from "../providers/prompts/index.js";
import { randomUUID } from "node:crypto";
import type { GenerationAttemptListener } from "./attempt-listener.js";

const MAX_ATTEMPTS = 2;
const TIMEOUT_MS = 90_000;
const MAX_OUTPUT_TOKENS = 4_000;
const SCHEMA_NAME = "requirements_analysis";

export interface GeneratedRequirements {
  spec: RequirementsSpec;
  usage: TokenUsage;
  attempts: number;
}

/** One forced-JSON call plus one bounded repair attempt. */
export class RequirementsGenerator {
  async generate(
    provider: ModelProvider,
    model: string,
    idea: string,
    onAttempt?: GenerationAttemptListener,
  ): Promise<GeneratedRequirements> {
    const system = requirementsSystemPrompt();
    const jsonSchema = zodToJsonSchema(RequirementsAnalysisOutputSchema);
    const messages: ChatMessage[] = [
      { role: "user", content: requirementsUserPrompt(idea) },
    ];
    const usage: TokenUsage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    };

    let lastIssues: ValidationIssue[] = [];
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      onAttempt?.(attempt);
      let result: GeneratedStructured;
      try {
        result = await provider.generateStructured({
          model,
          system,
          messages,
          schemaName: SCHEMA_NAME,
          jsonSchema,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          timeoutMs: TIMEOUT_MS,
        });
      } catch (error) {
        if (
          error instanceof AppError &&
          error.code === "INVALID_MODEL_OUTPUT"
        ) {
          const failure = invalidOutputRepair(error, SCHEMA_NAME, attempt);
          lastIssues = [failure.issue];
          if (attempt < MAX_ATTEMPTS) {
            messages.push({
              role: "user",
              content: failure.message,
            });
          }
          continue;
        }
        throw error;
      }

      addUsage(usage, result.usage);
      const parsed = RequirementsAnalysisOutputSchema.safeParse(result.data);
      if (parsed.success) {
        return {
          spec: toSpec(parsed.data),
          usage,
          attempts: attempt,
        };
      }

      lastIssues = parsed.error.issues.map((issue) => ({
        rule: "schema",
        severity: "error",
        message: `${issue.path.join(".") || "body"}: ${issue.message}`,
      }));
      if (attempt < MAX_ATTEMPTS) {
        messages.push({
          role: "user",
          content: buildRepairMessage(result.data, lastIssues),
        });
      }
    }

    throw new AppError(
      "GENERATION_REPAIR_FAILED",
      "The model output stayed invalid after one repair attempt.",
      {
        stage: SCHEMA_NAME,
        attempts: MAX_ATTEMPTS,
        issues: lastIssues.slice(0, 10),
      },
    );
  }
}

function toSpec(output: RequirementsAnalysisOutput): RequirementsSpec {
  return {
    functional: output.functional.map((item) => ({
      id: newId("fr"),
      kind: "functional",
      text: item.text,
      priority: item.priority,
    })),
    nonFunctional: output.nonFunctional.map((item) => ({
      id: newId("nfr"),
      kind: "nonfunctional",
      text: item.text,
      priority: item.priority,
      category: item.category,
      target: item.target,
    })),
    assumptions: output.assumptions.map((text) => ({
      id: newId("asm"),
      text,
    })),
    clarifications: output.clarifications.map((question) => ({
      id: newId("q"),
      question,
    })),
  };
}

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 10)}`;
}

export function addUsage(target: TokenUsage, usage?: TokenUsage): void {
  if (!usage) {
    return;
  }
  target.promptTokens += usage.promptTokens;
  target.completionTokens += usage.completionTokens;
  target.totalTokens += usage.totalTokens;
}
