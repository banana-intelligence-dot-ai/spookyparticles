import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { Analytics } from "@vercel/analytics/next";
import { AnalyticsProvider } from "@/lib/analytics/client";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://spookyparticles.com"),
  title: { default: "spooky particles", template: "%s · spooky particles" },
  description:
    "Spooky Particles watches Vercel schedules and failed deploys, then alerts you when something breaks. Read-only, with GitHub and your coding agent in the loop.",
  alternates: { canonical: "./" },
  openGraph: { siteName: "spooky particles", type: "website" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#0c0d0f",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} h-full`}>
      <body className="min-h-full flex flex-col bg-bg text-fg">
        <AnalyticsProvider>{children}</AnalyticsProvider>
        {/* Page views, visitors, referrers and utm tags, cookieless. Enabled per project in the Vercel dashboard. */}
        <Analytics />
      </body>
    </html>
  );
}
