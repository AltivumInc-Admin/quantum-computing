import type { Metadata } from "next";
import { PricingPageContent } from "@/components/pricing/pricing-page-content";

const PAGE_TITLE = "Pricing";
// Shipped verbatim into <meta name="description">, og:description and
// twitter:description — it is the sentence search results and share cards quote, so
// it has to survive the same honesty bar as the rendered copy. Two separate facts,
// and the copy must not merge them: (a) the sponsored hardware allowance was
// WITHDRAWN on 2026-07-28, so this no longer promises it; (b) metering stays FUTURE
// tense, because the metered tutor is not deployed and the storefront is closed, so
// no wallet is debited today. Withdrawing a promise is not the same as shipping the
// thing that replaces it.
const PAGE_DESCRIPTION =
  "The entire quantum curriculum and simulator are free with a free account, and the AI tutor is free to try. One dollar-pegged credit wallet will meter AI tutoring and real quantum hardware, billed at cost with no markup.";

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
