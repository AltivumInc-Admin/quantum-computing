// Single source for the deployed site origin. Imported by the root layout
// (metadataBase), the sitemap, and robots so the base URL is defined once.
// learner.quantumenv.dev is the canonical home as of the platform-subdomain
// migration; quantumlearner.dev remains associated with the app as a vanity
// redirect (302 soak, then 301) and quantum.altivum.ai still 301s onward.
export const SITE_URL = "https://learner.quantumenv.dev";

// The one brand name (PR #170's rebrand, matching the nav). Consumed by the
// layout metadata (title, og:site_name, OG alt), the home route's titles, the
// footer, and every per-page "— Quantum Learner" title suffix, so the tab,
// social cards, and on-page chrome can never read three different names.
export const SITE_NAME = "Quantum Learner";

// Branded social-share card, resolved to an absolute URL via metadataBase so
// it works when quantum.altivum.ai 301-redirects here. Default for every
// route; pages that override openGraph must spread this back in (Next.js
// REPLACES a page-level openGraph object, it never deep-merges) so no route
// silently drops og:image's width/height/alt structure.
export const OG_IMAGE = {
  url: "/og.jpg",
  type: "image/jpeg",
  width: 1200,
  height: 630,
  alt: `${SITE_NAME} — master quantum computing from |0⟩ to production`,
};
