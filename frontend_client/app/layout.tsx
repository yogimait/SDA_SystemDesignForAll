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
  metadataBase: new URL("https://sda.nerddog.me"),
  title: {
    default: "SDA Nerd Dog — System Design All-in-One",
    template: "%s — SDA Nerd Dog",
  },
  description:
    "SDA Nerd Dog turns any software idea or interview problem into an editable specification and interactive, explained LLD, HLD, and DSA views.",
  applicationName: "SDA Nerd Dog",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: "SDA Nerd Dog",
    title: "SDA Nerd Dog — System Design All-in-One",
    description:
      "Turn any software idea or interview problem into an editable specification and interactive, explained LLD, HLD, and DSA views.",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "SDA Nerd Dog — System Design All-in-One",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "SDA Nerd Dog — System Design All-in-One",
    description:
      "Turn any software idea or interview problem into an editable specification and interactive, explained LLD, HLD, and DSA views.",
    images: ["/og.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
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
