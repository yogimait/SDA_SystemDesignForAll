import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SiteHeader } from "@/components/landing/site-header";
import { StubCheckout } from "@/components/billing/stub-checkout";

export const metadata: Metadata = { title: "Checkout" };

async function CheckoutContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <StubCheckout checkoutId={id} />;
}

export default function StubCheckoutPage(props: PageProps<"/billing/checkout/[id]">) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-[560px] flex-1 px-6 py-10">
        <h1 className="text-foreground text-xl font-medium tracking-tight">Complete your upgrade</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Confirming here activates Pro for your account.
        </p>
        <div className="bg-card border-border mt-5 rounded-xl border border-solid p-5">
          <Suspense
            fallback={
              <p className="text-muted-foreground text-sm" role="status">
                Loading checkout…
              </p>
            }
          >
            <CheckoutContent params={props.params} />
          </Suspense>
        </div>
        <p className="mt-4">
          <Link href="/pricing" className="text-muted-foreground hover:text-foreground text-sm">
            Back to plans
          </Link>
        </p>
      </main>
    </div>
  );
}
