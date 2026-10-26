/**
 * Central TanStack Query keys. Every consumer builds keys through this module
 * (one shape per resource, invalidated precisely).
 */
export const queryKeys = {
  health: ["health"] as const,
  providers: ["providers"] as const,
  project: (projectId: string) => ["projects", projectId] as const,
  requirements: (projectId: string) =>
    ["projects", projectId, "requirements"] as const,
  architecture: (projectId: string) =>
    ["projects", projectId, "architecture"] as const,
  run: (runId: string) => ["runs", runId] as const,
} as const;
