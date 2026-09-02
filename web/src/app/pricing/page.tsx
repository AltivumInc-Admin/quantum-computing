import type { Metadata } from "next";
import { PricingPageContent } from "@/components/pricing/pricing-page-content";

const PAGE_TITLE = "Pricing";
// Shipped verbatim into <meta name="description">, og:description and
// twitter:description — it is the sentence search results and share cards quote, so
// it has to survive the same honesty bar as the rendered copy. Three separate facts,
// and the copy must not merge them: (a) the sponsored hardware allowance was
// WITHDRAWN on 2026-07-28, so this no longer promises it; (b) metering stays FUTURE
// tense, because the metered tutor is not deployed and the storefront is closed, so
// no wallet is debited today; (c) it states no relationship between the published
// rate and what a run costs to serve. It ended "billed at cost with no markup" until
// 2026-09, a clause written before the settled model and retired by CLAUDE.md rules
// 5 and 9 — a commercial promise this sentence has no business making, in the one
// string most people read without opening the page. Withdrawing a promise is not the
// same as shipping the thing that replaces it, and the copy-honesty guard now bars
// the framing in both locales so it cannot come back.
const PAGE_DESCRIPTION =
  "The entire quantum curriculum and simulator are free with a free account, and the AI tutor is free to try. One dollar-pegged credit wallet will meter AI tutoring and real quantum hardware.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: "/pricing",
    type: "website",
  },
  twitter: { card: "summary", title: PAGE_TITLE, description: PAGE_DESCRIPTION },
};

export default function PricingPage() {
  return <PricingPageContent />;
}
