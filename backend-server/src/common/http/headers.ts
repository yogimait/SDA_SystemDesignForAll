import type { Request } from "express";

export function readHeader(
  request: Request,
  name: string,
): string | undefined {
  const raw = request.headers[name];
  return Array.isArray(raw) ? raw[0] : raw;
}
