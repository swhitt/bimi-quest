import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import Script from "next/script";
import { Suspense } from "react";
import { CommandPalette } from "@/components/command-palette";
import { Footer } from "@/components/footer";
import { GlobalFilterBar } from "@/components/global-filter-bar";
import { Nav } from "@/components/nav";
import { OfflineBanner } from "@/components/offline-banner";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UpdateBanner } from "@/components/update-banner";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  weight: ["400", "500"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || "https://bimi.quest"),
  title: {
    default: "BIMI Quest - Certificate Market Intelligence",
    template: "%s | BIMI Quest",
  },
  description:
    "Track VMC and CMC certificate issuances across all Certificate Authorities. Real-time BIMI market intelligence from CT logs.",
  openGraph: {
    title: "BIMI Quest - Certificate Market Intelligence",
    description: "Track VMC and CMC certificate issuances across all Certificate Authorities.",
    type: "website",
    siteName: "BIMI Quest",
    url: "/",
    images: [{ url: "/api/og/default", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "BIMI Quest - Certificate Market Intelligence",
    description: "Track VMC and CMC certificate issuances across all Certificate Authorities.",
    images: [{ url: "/api/og/default", width: 1200, height: 630 }],
  },
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    types: {
      "application/rss+xml": "/api/feed",
    },
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "BIMI Quest",
  },
  icons: {
    icon: [{ url: "/favicon.ico", sizes: "32x32" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  other: {
    "mobile-web-app-capable": "yes",
    "theme-color": "#0C1222",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" style={{ colorScheme: "dark" }} suppressHydrationWarning>
      <body
        className={`${plexSans.variable} ${plexMono.variable} antialiased min-h-screen flex flex-col overflow-x-hidden`}
        suppressHydrationWarning
      >
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <TooltipProvider>
            <Suspense>
              <Nav />
            </Suspense>
            <GlobalFilterBar />
            <main className="container mx-auto px-4 pt-2 pb-4 sm:py-4 flex-1">{children}</main>
            <Footer />
            <UpdateBanner />
            <OfflineBanner />
            <CommandPalette />
          </TooltipProvider>
          <Analytics />
          <SpeedInsights />
        </ThemeProvider>
        <Script id="sw-register" strategy="afterInteractive">
          {`if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js')`}
        </Script>
      </body>
    </html>
  );
}
