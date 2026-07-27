import type { Metadata } from "next";
import { PricingPageContent } from "@/components/pricing/pricing-page-content";

const PAGE_TITLE = "Pricing";
// Shipped verbatim into <meta name="description">, og:description and
// twitter:description — it is the sentence search results and share cards quote, so
// it has to survive the same honesty bar as the rendered copy. Future tense on the
// metering: nothing on the platform debits a wallet today (the tutor is free and
// curriculum hardware runs are platform-sponsored), so a present-tense "meters" here
// would be a false claim served to everyone who has never opened the page.
const PAGE_DESCRIPTION =
  "The entire quantum curriculum and simulator are free with a free account. Nothing is metered yet: the AI tutor is free to try and curriculum hardware runs are platform-sponsored. One dollar-pegged credit wallet will meter AI tutoring and paid quantum compute when billing ships.";

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
