import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from "@nestjs/common";
import { ok } from "@sda/contracts";
import type { Response } from "express";
import { map, type Observable } from "rxjs";

function isEnvelope(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { status?: unknown }).status === "boolean" &&
    typeof (value as { statusCode?: unknown }).statusCode === "number"
  );
}

/** Uppercase note: controllers return payloads; this is where success is wrapped. */
@Injectable()
export class ApiResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const response = context.switchToHttp().getResponse<Response>();
    return next.handle().pipe(
      map((data: unknown) =>
        isEnvelope(data) ? data : ok(data, response.statusCode),
      ),
    );
  }
}
