import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from "@nestjs/common";
import { fail } from "@sda/contracts";
import type { Response } from "express";
import { AppError, ERROR_HTTP_STATUS } from "./app-error.js";
import { isDatabaseUnavailable } from "./database-error.js";
import { isPayloadTooLarge } from "./payload-too-large.js";
import { redactSecrets } from "../logging/redact.js";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (response.headersSent) {
      return;
    }

    const mapped = mapException(exception);
    if (mapped.statusCode >= 500) {
      this.logger.error(
        `${mapped.code} ${mapped.message}${
          exception instanceof Error && exception.stack
            ? `\n${exception.stack}`
            : ""
        }`,
      );
    }

    response
      .status(mapped.statusCode)
      .json(
        fail(
          mapped.code,
          mapped.message,
          mapped.details,
          mapped.statusCode,
        ),
      );
  }
}

interface MappedException {
  code: Parameters<typeof fail>[0];
  message: string;
  details?: Record<string, unknown>;
  statusCode: number;
}

function mapException(exception: unknown): MappedException {
  if (exception instanceof AppError) {
    return {
      code: exception.code,
      message: exception.message,
      details: exception.details,
      statusCode: exception.statusCode,
    };
  }

  if (isPayloadTooLarge(exception)) {
    return {
      code: "PAYLOAD_TOO_LARGE",
      message: "The request body is too large.",
      statusCode: ERROR_HTTP_STATUS.PAYLOAD_TOO_LARGE,
    };
  }

  if (isDatabaseUnavailable(exception)) {
    return {
      code: "DATABASE_UNAVAILABLE",
      message: "The database is currently unavailable. Try again later.",
      statusCode: ERROR_HTTP_STATUS.DATABASE_UNAVAILABLE,
    };
  }

  if (exception instanceof HttpException) {
    const statusCode = exception.getStatus();
    const response = exception.getResponse();
    const message =
      typeof response === "string"
        ? response
        : typeof response === "object" &&
            response !== null &&
            typeof (response as { message?: unknown }).message === "string"
          ? (response as { message: string }).message
          : exception.message;

    if (statusCode === 413) {
      return {
        code: "PAYLOAD_TOO_LARGE",
        message,
        statusCode,
      };
    }
    if (statusCode === 429) {
      return {
        code: "QUOTA_EXCEEDED",
        message: "Too many requests. Try again later.",
        statusCode,
      };
    }

    return {
      code: statusCode >= 500 ? "INTERNAL_ERROR" : "VALIDATION_ERROR",
      message: redactSecrets(message),
      statusCode,
    };
  }

  return {
    code: "INTERNAL_ERROR",
    message: "An unexpected error occurred.",
    statusCode: ERROR_HTTP_STATUS.INTERNAL_ERROR,
  };
}
