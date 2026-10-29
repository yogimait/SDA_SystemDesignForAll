import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { RequirementsFlow } from "@/components/requirements/requirements-flow";
import {
  FLOATING_HEADER_CARD,
  FLOATING_HEADER_SHELL,
} from "@/components/ui/floating-header";

export const metadata: Metadata = {
  title: "Requirements",
};

/** Awaited params live inside a Suspense boundary (cacheComponents rule). */
async function RequirementsContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <RequirementsFlow projectId={id} />;
}

export default function RequirementsPage(
  props: PageProps<"/projects/[id]/requirements">,
) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className={FLOATING_HEADER_SHELL}>
        <div className={`${FLOATING_HEADER_CARD} mx-auto flex w-full max-w-[1100px] items-center px-6 py-3`}>
          <Link
            href="/"
            className="focus-visible:ring-ring flex items-center gap-2 rounded focus-visible:ring-2 focus-visible:outline-1"
          >
            <span className="text-primary font-mono text-sm font-bold">sda/</span>
            <span className="text-foreground text-sm font-bold tracking-tight">
              System Design All-in-One
            </span>
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1100px] flex-grow px-6 py-10">
        <Suspense
          fallback={
            <p className="text-muted-foreground text-sm" role="status">
              Loading project…
            </p>
          }
        >
          <RequirementsContent params={props.params} />
        </Suspense>
      </main>
    </div>
  );
}
