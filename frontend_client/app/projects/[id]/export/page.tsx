import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BackToWorkspace } from "@/components/export/back-to-workspace";
import { ExportFlow } from "@/components/export/export-flow";

export const metadata: Metadata = {
  title: "Export architecture",
};

/** Awaited params live inside a Suspense boundary (cacheComponents rule). */
async function ExportContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ExportFlow projectId={id} />;
}

export default function ExportPage(props: PageProps<"/projects/[id]/export">) {
  return (
    <div className="export-doc flex min-h-screen flex-col">
      {/* Print chrome: this bar never prints (.no-print) and the document
          below forces the light palette regardless of the app theme. */}
      <header className="no-print border-border bg-card sticky top-0 z-40 w-full border-b border-solid">
        <div className="mx-auto flex w-full max-w-[1100px] items-center justify-between gap-4 px-6 py-3">
          <Link
            href="/"
            className="focus-visible:ring-ring flex items-center gap-2 rounded focus-visible:ring-2 focus-visible:outline-1"
          >
            <span className="text-primary font-mono text-sm font-bold">sda/</span>
            <span className="text-foreground text-sm font-bold tracking-tight">
              System Design All-in-One
            </span>
          </Link>
          <p className="text-muted-foreground hidden text-xs sm:block">export view</p>
          <Suspense fallback={null}>
            <BackToWorkspace />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[690px] flex-grow px-6 py-8">
        <Suspense
          fallback={
            <p className="text-muted-foreground text-sm" role="status">
              Loading the export document…
            </p>
          }
        >
          <ExportContent params={props.params} />
        </Suspense>
      </main>
    </div>
  );
}
