/**
 * Per-project access keys and the pending-idea handoff. Provider API keys are
 * no longer stored in the browser; generation uses the hosted server model.
 * Project access keys remain sessionStorage only.
 */

export function projectAccessKeyEntry(projectId: string): string {
  return `sda:project:${projectId}:access-key`;
}

function safeSession(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function loadProjectAccessKey(projectId: string): string | null {
  const storage = safeSession();
  if (!storage) return null;
  const key = storage.getItem(projectAccessKeyEntry(projectId));
  return key && key.length > 0 ? key : null;
}

export function saveProjectAccessKey(projectId: string, accessKey: string): void {
  const storage = safeSession();
  if (!storage) return;
  storage.setItem(projectAccessKeyEntry(projectId), accessKey);
}

/**
 * Sign-in-and-continue: an idea typed on the landing page before signing in.
 * Survives the login redirect (sessionStorage), consumed once — the value is
 * plain text (the user's own input) so no JSON needed.
 */
const PENDING_IDEA_ENTRY = "sda:pending-idea";

export function savePendingIdea(idea: string): void {
  safeSession()?.setItem(PENDING_IDEA_ENTRY, idea);
}

export function peekPendingIdea(): string | null {
  const idea = safeSession()?.getItem(PENDING_IDEA_ENTRY);
  return idea && idea.length > 0 ? idea : null;
}

/** Returns the stashed idea and clears the slot (consume once). */
export function consumePendingIdea(): string | null {
  const storage = safeSession();
  if (!storage) return null;
  const idea = storage.getItem(PENDING_IDEA_ENTRY);
  storage.removeItem(PENDING_IDEA_ENTRY);
  return idea && idea.length > 0 ? idea : null;
}
