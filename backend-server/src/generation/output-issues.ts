import type { ValidationIssue } from "@sda/contracts";
import { AppError } from "../common/errors/app-error.js";

const TRUNCATED_REASONS = new Set([
  "truncated_output",
  "truncated_json",
  "output_too_large",
]);

function reasonOf(error: AppError): string {
  const reason = error.details?.reason;
  return typeof reason === "string" ? reason : "invalid_json";
}

export function isTruncatedOutput(error: AppError): boolean {
  return TRUNCATED_REASONS.has(reasonOf(error));
}

export function invalidOutputIssue(error: AppError): ValidationIssue {
  const reason = reasonOf(error);
  const finishReason = error.details?.finishReason;
  const maxOutputTokens = error.details?.maxOutputTokens;
  const usage = error.details?.usage as
    | { completionTokens?: number }
    | undefined;
  const reasoningTokens = error.details?.reasoningTokens;
  const finishSuffix =
    typeof finishReason === "string"
      ? ` (finish_reason: ${finishReason})`
      : "";
  const detailParts = [
    typeof finishReason === "string" ? `finish_reason: ${finishReason}` : null,
    typeof maxOutputTokens === "number"
      ? `budget: ${maxOutputTokens.toLocaleString("en-US")} tokens`
      : null,
    typeof usage?.completionTokens === "number"
      ? `completion: ${usage.completionTokens.toLocaleString("en-US")} tokens`
      : null,
    typeof reasoningTokens === "number"
      ? `reasoning: ${reasoningTokens.toLocaleString("en-US")} tokens`
      : null,
  ].filter((part): part is string => part !== null);
  const detailSuffix =
    detailParts.length > 0 ? ` (${detailParts.join(", ")})` : "";

  if (reason === "output_too_large") {
    return {
      rule: "output_too_large",
      severity: "error",
      message: "The model response exceeded the maximum accepted size.",
    };
  }
  if (isTruncatedOutput(error)) {
    return {
      rule: "truncated_output",
      severity: "error",
      message: `The model response was cut off before the JSON object was complete${detailSuffix}.`,
    };
  }
  return {
    rule: "invalid_json",
    severity: "error",
    message: `The response was not one valid JSON object (${reason})${finishSuffix}.`,
  };
}

/** Truncation is not repairable by asking the model again with the same budget. */
export function invalidOutputRepair(
  error: AppError,
  stage: string,
  attempt: number,
): { issue: ValidationIssue; message: string } {
  const issue = invalidOutputIssue(error);
  if (isTruncatedOutput(error)) {
    throw new AppError(
      "GENERATION_REPAIR_FAILED",
      "The model response was truncated before completion. Increase the output budget or lower reasoning effort.",
      {
        stage,
        attempts: attempt,
        issues: [issue],
        providerOutput: error.details,
      },
    );
  }
  return {
    issue,
    message: `Your previous response was not valid JSON (${issue.message}). Return one JSON object only, matching the schema.`,
  };
}
