import { CreateProjectRequestSchema } from "@sda/contracts";
import { describe, expect, it } from "vitest";
import { AppError } from "../../src/common/errors/app-error.js";
import { ZodValidationPipe } from "../../src/common/validation/zod-validation.pipe.js";

describe("ZodValidationPipe", () => {
  const pipe = new ZodValidationPipe(CreateProjectRequestSchema);

  it("returns parsed data with schema transforms applied", () => {
    expect(pipe.transform({ idea: "  Build a planner.  " })).toEqual({
      idea: "Build a planner.",
    });
  });

  it("throws a VALIDATION_ERROR with issue paths", () => {
    try {
      pipe.transform({ idea: "" });
      throw new Error("Expected the pipe to throw.");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      const appError = error as AppError;
      expect(appError.code).toBe("VALIDATION_ERROR");
      expect(appError.statusCode).toBe(400);
      const issues = appError.details?.issues as
        | Array<{ path: string }>
        | undefined;
      expect(issues?.[0]?.path).toBe("idea");
    }
  });
});
