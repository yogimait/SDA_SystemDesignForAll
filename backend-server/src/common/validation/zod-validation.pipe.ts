import type { PipeTransform } from "@nestjs/common";
import type { z } from "@sda/contracts";
import { AppError } from "../errors/app-error.js";

/** One pipe for every DTO. Validation is Zod-only; no class-validator. */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: z.ZodType<T>) {}

  transform(value: unknown): T {
    const parsed = this.schema.safeParse(value);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Request validation failed.", {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          code: issue.code,
          message: issue.message,
        })),
      });
    }
    return parsed.data;
  }
}
