import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { GlobalFilterBar } from "@/components/global-filter-bar";
import { UpdateBanner } from "@/components/update-banner";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
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
  description: "Track VMC and CMC certificate issuances across all Certificate Authorities. Real-time BIMI market intelligence from CT logs.",
  openGraph: {
    title: "BIMI Quest - Certificate Market Intelligence",
    description: "Track VMC and CMC certificate issuances across all Certificate Authorities.",
    type: "website",
    siteName: "BIMI Quest",
    url: "/",
    images: [{ url: "/og-default.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "BIMI Quest - Certificate Market Intelligence",
    description: "Track VMC and CMC certificate issuances across all Certificate Authorities.",
    images: [{ url: "/og-default.png", width: 1200, height: 630 }],
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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" style={{ colorScheme: "dark" }} suppressHydrationWarning>
      <body
        className={`${plexSans.variable} ${plexMono.variable} antialiased min-h-screen flex flex-col`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider>
            <Nav />
            <GlobalFilterBar />
            <main className="container mx-auto px-4 py-6 flex-1">{children}</main>
            <Footer />
            <UpdateBanner />
          </TooltipProvider>
          <Analytics />
          <SpeedInsights />
        </ThemeProvider>
      </body>
    </html>
  );
}
