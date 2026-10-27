import { createHash, randomBytes } from "node:crypto";
import type { Request } from "express";

const BEARER_PATTERN = /^Bearer\s+(.+)$/i;

export function generateAccessToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashAccessToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function readBearerToken(request: Request): string | undefined {
  const header = request.headers.authorization;
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) return undefined;
  return BEARER_PATTERN.exec(value)?.[1]?.trim() || undefined;
}
