import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/landing/site-header";

export const metadata: Metadata = { title: "Checkout canceled" };

export default function BillingCancelPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-[560px] flex-1 px-6 py-12">
        <h1 className="text-foreground text-xl font-medium tracking-tight">Checkout canceled</h1>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          Nothing was charged and your plan is unchanged. You can restart the
          upgrade at any time.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/pricing" className="text-primary hover:underline text-sm underline-offset-4 self-center">
            Back to plans
          </Link>
          <Link href="/settings" className="text-muted-foreground hover:text-foreground text-sm self-center">
            Billing settings
          </Link>
        </div>
      </main>
    </div>
  );
}
