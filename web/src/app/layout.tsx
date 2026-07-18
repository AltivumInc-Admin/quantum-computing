import type { Metadata } from "next";
import { Sora, Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Nav } from "@/components/nav";
import { AskTutor } from "@/components/ask-tutor";
import { ProgressSync } from "@/components/progress-sync";
import { Footer } from "@/components/footer";
import { FogField } from "@/components/fog-field";
import { AuthProvider } from "@/components/auth/auth-provider";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

// Instrument type system: Sora (light-weight display), Geist (UI/body),
// Geist Mono (bra-ket, data, code). Self-hosted via next/font — same-origin,
// no third-party font host (the licensed Config Mono VF the reference used
// would require an Adobe Typekit runtime embed, incompatible with the static
// export; Geist Mono is the sanctioned fallback).
const sora = Sora({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-sora",
});

const geist = Geist({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-geist",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-geist-mono",
});

// Branded social-share card, resolved to an absolute URL via metadataBase so it
// works when quantumlearner.dev 301-redirects here. Default for every route;
// individual pages may override title/description but inherit this image.
const OG_IMAGE = {
  url: "/og.png",
  width: 1200,
  height: 630,
  alt: "Quantum Computing Workspace — master quantum computing from first principles",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Quantum Computing Workspace",
  description: "A progressive learning path through quantum computing with Amazon Braket",
  openGraph: {
    type: "website",
    siteName: "Quantum Computing Workspace",
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    images: [OG_IMAGE.url],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sora.variable} ${geist.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <AuthProvider>
            <FogField />
            <a
              href="#main"
              className="sr-only surface-accent focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-control focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus-ring"
            >
              Skip to content
            </a>
            <Nav />
            <main id="main" tabIndex={-1} className="outline-none">
              {children}
            </main>
            <Footer />
            <AskTutor />
            <ProgressSync />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
