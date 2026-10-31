import type { Metadata } from "next";
import { Caveat, Geist, Geist_Mono, Inter, Space_Grotesk, Space_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const headlineGrotesk = Space_Grotesk({
  variable: "--font-heading",
  weight: ["500", "700"],
  subsets: ["latin"],
});

/* Landing-page fonts from the Stitch "Coffee" reference (Inter body, Space
   Mono labels, Caveat annotation). Scoped to the landing via CSS variables so
   the app's Geist-based surfaces stay untouched. */
const landingSans = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const landingMono = Space_Mono({
  variable: "--font-space-mono",
  weight: ["400", "700"],
  subsets: ["latin"],
});

const landingHand = Caveat({
  variable: "--font-caveat",
  weight: ["600"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "System Design All-in-One",
    template: "%s · System Design All-in-One",
  },
  description:
    "Turn any software idea or interview problem into interactive, explained LLD, HLD, and DSA learning experiences.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${headlineGrotesk.variable} ${landingSans.variable} ${landingMono.variable} ${landingHand.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
