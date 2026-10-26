import { Injectable } from "@nestjs/common";
import {
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

/**
 * Per-project keys are 256-bit random values, so a fast hash is sufficient:
 * brute force is infeasible and request latency stays low. Hashing at rest
 * keeps a database leak from exposing usable keys.
 */
@Injectable()
export class AccessKeyService {
  generate(): { key: string; hash: string } {
    const key = randomBytes(32).toString("base64url");
    return { key, hash: this.hash(key) };
  }

  hash(key: string): string {
    return createHash("sha256").update(key, "utf8").digest("hex");
  }

  verify(key: string, storedHash: string): boolean {
    const actual = Buffer.from(this.hash(key), "hex");
    const expected = Buffer.from(storedHash, "hex");
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  }
}
