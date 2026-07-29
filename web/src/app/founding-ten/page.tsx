import type { Metadata } from "next";
import { articleMetadata } from "@/lib/seo";
import { Roster } from "@/components/founding-ten/roster";

export const metadata: Metadata = articleMetadata({
  title: "The Founding Ten — Quantum Learner",
  ogTitle: "The Founding Ten",
  description:
    "Ten charter members and ten founding patrons. Each place is numbered, issued once, and publicly verifiable.",
  path: "/founding-ten",
});

export default function FoundingTenPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="font-display text-display-lg tracking-tight text-(--ink)">
        The Founding Ten
      </h1>
      <p className="mt-3 text-sm text-(--mut)">
        Twenty numbered places, issued once and never reissued. Every badge has a
        public record, and every unclaimed place is shown as open.
      </p>
      <div className="mt-12">
        <Roster />
      </div>
    </div>
  );
}
