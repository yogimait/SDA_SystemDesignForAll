/**
 * Re-reads the signed-in user from the server and updates the shared session
 * snapshot (plan tier, verification status). Used after checkout completion,
 * email verification, and account mutations so the header, settings, and
 * dashboard agree without a second identity source.
 */
import { UserSchema, type User } from "@sda/contracts";
import { apiFetch } from "@/lib/api/client";
import { updateSessionUser } from "@/lib/session/auth";

export async function refreshSessionUser(): Promise<User | null> {
  try {
    const user = await apiFetch("/api/auth/me", { auth: true, dataSchema: UserSchema });
    updateSessionUser(user);
    return user;
  } catch {
    return null;
  }
}
