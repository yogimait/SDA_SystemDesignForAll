import type { TokenUsage } from "@sda/contracts";
import { AppError } from "../common/errors/app-error.js";

/**
 * Provider usage attached to a failure. A truncated response still consumed
 * tokens, and repair-exhausted errors nest the original provider details under
 * `providerOutput`. Failures without usage return undefined.
 */
export function failureUsage(error: unknown): TokenUsage | undefined {
  if (!(error instanceof AppError)) return undefined;
  return (
    pickUsage(error.details) ?? pickUsage(error.details?.providerOutput)
  );
}

function pickUsage(value: unknown): TokenUsage | undefined {
  if (!value || typeof value !== "object") return undefined;
  const usage = (value as { usage?: unknown }).usage;
  if (!usage || typeof usage !== "object") return undefined;
  const record = usage as Record<string, unknown>;
  const promptTokens = numberOrUndefined(record.promptTokens);
  const completionTokens = numberOrUndefined(record.completionTokens);
  if (promptTokens === undefined && completionTokens === undefined) {
    return undefined;
  }
  const prompt = promptTokens ?? 0;
  const completion = completionTokens ?? 0;
  return {
    promptTokens: prompt,
    completionTokens: completion,
    totalTokens: numberOrUndefined(record.totalTokens) ?? prompt + completion,
  };
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}
