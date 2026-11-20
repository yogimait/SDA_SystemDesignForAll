import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Compare the free and Pro plans for SDA Nerd Dog — the System Design All-in-One workspace for LLD, HLD and DSA.",
  alternates: {
    canonical: "/pricing",
  },
  openGraph: {
    title: "Pricing — SDA Nerd Dog",
    description:
      "Compare the free and Pro plans for SDA Nerd Dog — the System Design All-in-One workspace for LLD, HLD and DSA.",
    url: "/pricing",
  },
};

export default function PricingLayout({ children }: { children: ReactNode }) {
  return children;
}
