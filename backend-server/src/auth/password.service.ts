import { Injectable } from "@nestjs/common";
import {
  randomBytes,
  scrypt as nodeScrypt,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(nodeScrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

const PARAMS = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;
const KEY_LENGTH = 64;
const DUMMY_PASSWORD_HASH =
  "scrypt$16384$8$1$JhZna3f2tThoPAxEiQiTnQ$W_N7f6j2SKEtKBVgqZmpPSJ5YyQbZwo8IhHn0N5gN7NwNb1lfYIZCNXOjqJVZnijJe-EUpN3AjehRkOk69lr2A";

/** scrypt with a per-password salt; encoded string is safe to persist. */
@Injectable()
export class PasswordService {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(16);
    const derived = await scrypt(password, salt, KEY_LENGTH, PARAMS);
    return [
      "scrypt",
      PARAMS.N,
      PARAMS.r,
      PARAMS.p,
      salt.toString("base64url"),
      derived.toString("base64url"),
    ].join("$");
  }

  async verify(password: string, encoded: string): Promise<boolean> {
    const parts = encoded.split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt") {
      return false;
    }
    const [, n, r, p, saltText, hashText] = parts;
    const salt = Buffer.from(saltText, "base64url");
    const expected = Buffer.from(hashText, "base64url");
    if (salt.length === 0 || expected.length === 0) {
      return false;
    }
    const derived = await scrypt(password, salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: 64 * 1024 * 1024,
    });
    return (
      derived.length === expected.length &&
      timingSafeEqual(derived, expected)
    );
  }

  /** Equalizes unknown-email login cost with a wrong-password attempt. */
  async verifyDummy(password: string): Promise<boolean> {
    return this.verify(password, DUMMY_PASSWORD_HASH);
  }
}
