import type { Metadata } from "next";
import { Suspense } from "react";
import { WorkspaceFlow } from "@/components/workspace/workspace-flow";

export const metadata: Metadata = {
  title: "Workspace",
};

/** Awaited params live inside a Suspense boundary (cacheComponents rule). */
async function WorkspaceContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <WorkspaceFlow projectId={id} />;
}

export default function WorkspacePage(
  props: PageProps<"/projects/[id]/workspace">,
) {
  return (
    <div className="min-h-screen">
      <Suspense
        fallback={
          <p className="text-muted-foreground px-4 py-10 text-sm" role="status">
            Loading workspace…
          </p>
        }
      >
        <WorkspaceContent params={props.params} />
      </Suspense>
    </div>
  );
}
