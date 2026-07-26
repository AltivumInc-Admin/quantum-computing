import type { Metadata, Viewport } from "next";
import { Sora, Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Nav } from "@/components/nav";
import { AskTutor } from "@/components/ask-tutor";
import { ProgressSync } from "@/components/progress-sync";
import { Footer } from "@/components/footer";
import { FogField } from "@/components/fog-field";
import { AuthProvider } from "@/components/auth/auth-provider";
import { AuthWall } from "@/components/auth/auth-wall";
import { LocaleProvider } from "@/i18n";
import { SkipToContent } from "@/components/skip-to-content";
import { SITE_URL, SITE_NAME, OG_IMAGE } from "@/lib/site";
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

// Site name + branded social-share card come from lib/site.ts (one source of
// truth shared with pages that override openGraph). Default for every route;
// individual pages may override title/description but inherit this image.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_NAME,
  description: "A progressive learning path through quantum computing with Amazon Braket",
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    images: [OG_IMAGE.url],
  },
};

// Browser-chrome color (mobile toolbar/status bar) tracks --surface-base per
// theme: hex renderings of oklch(0.97 0.004 88) light / oklch(0.145 0.004 80)
// dark. Statically emitted, so it follows the OS scheme (the enableSystem
// default) rather than a manual in-app override — an acceptable edge for a
// static export.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5f2" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0a08" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sora.variable} ${geist.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <body className="font-sans antialiased">
        {/*
          Pre-paint <html lang>, mirroring the blocking inline script next-themes
          uses to avoid a colour-scheme flash. LocaleProvider only syncs `lang` from
          a useEffect, so a returning Spanish learner was announced to a screen
          reader (and to the browser's own language handling) as English until
          hydration finished.

          WHAT THIS DOES NOT FIX: the flash of English BODY TEXT. The static export
          prerenders English HTML and only a React re-render can replace that text,
          so Spanish copy still arrives at hydration. Removing that flash requires
          server-rendered /es/ locale routes, which is out of scope here — and with
          no /es/ URL to point at, there is deliberately no hreflang/alternates
          either, since an alternate link to a nonexistent page is a lie. This fixes
          only the language the browser and assistive tech are told, which is what a
          locale-route-less static export can honestly deliver.

          Dependency-free and duplicating the storage key on purpose: it has to be a
          literal string in the document, before any module graph loads. src/i18n/
          storage.ts remains the source of truth for the key and the valid values.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{var l=localStorage.getItem("qc:locale");if(l==="en"||l==="es")document.documentElement.lang=l}catch(e){}',
          }}
        />
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <LocaleProvider>
            <AuthProvider>
              <FogField />
              <SkipToContent />
              <Nav />
              <main id="main" tabIndex={-1} className="outline-none">
                <AuthWall>{children}</AuthWall>
              </main>
              <Footer />
              <AskTutor />
              <ProgressSync />
            </AuthProvider>
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
