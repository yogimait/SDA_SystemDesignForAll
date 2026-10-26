import { ConsoleLogger } from "@nestjs/common";
import { redactSecrets } from "./redact.js";

function stringifyMessage(message: unknown): string {
  if (typeof message === "string") {
    return message;
  }
  if (message instanceof Error) {
    return message.stack ?? message.message;
  }
  try {
    return JSON.stringify(message);
  } catch {
    return String(message);
  }
}

/** Application logger. Installed in bootstrap so every Nest logger redacts. */
export class RedactingLogger extends ConsoleLogger {
  override log(message: unknown, ...rest: unknown[]): void {
    super.log(redactSecrets(stringifyMessage(message)), ...rest);
  }

  override error(message: unknown, ...rest: unknown[]): void {
    super.error(redactSecrets(stringifyMessage(message)), ...rest);
  }

  override warn(message: unknown, ...rest: unknown[]): void {
    super.warn(redactSecrets(stringifyMessage(message)), ...rest);
  }

  override debug(message: unknown, ...rest: unknown[]): void {
    super.debug(redactSecrets(stringifyMessage(message)), ...rest);
  }

  override verbose(message: unknown, ...rest: unknown[]): void {
    super.verbose(redactSecrets(stringifyMessage(message)), ...rest);
  }
}
