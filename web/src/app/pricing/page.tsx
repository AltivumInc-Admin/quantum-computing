import type { Metadata } from "next";
import { PricingPageContent } from "@/components/pricing/pricing-page-content";

const PAGE_TITLE = "Pricing";
const PAGE_DESCRIPTION =
  "The entire quantum curriculum and simulator are free with a free account. One dollar-pegged credit wallet meters the only two things that cost real money: AI tutoring and real quantum hardware.";

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
