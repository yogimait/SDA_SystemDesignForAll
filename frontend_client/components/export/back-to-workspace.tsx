"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";

/**
 * Export header back link. `params` is URL data, so the id resolves through
 * the client hook inside a Suspense boundary (cacheComponents rule).
 */
export function BackToWorkspace() {
  const { id } = useParams<{ id: string }>();
  if (typeof id !== "string" || id === "") return null;
  return (
    <Link
      href={`/projects/${id}/workspace`}
      className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex items-center gap-1.5 rounded font-mono text-xs transition-colors focus-visible:ring-2 focus-visible:outline-1"
    >
      <ArrowLeftIcon className="size-3.5" aria-hidden="true" />
      Back to workspace
    </Link>
  );
}
