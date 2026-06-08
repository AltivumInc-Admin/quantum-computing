import type { Metadata } from "next";
import { ReviewDashboard } from "@/components/review-dashboard";

export const metadata: Metadata = {
  title: "Review — Quantum Workspace",
  description: "Spaced-repetition review of the quantum computing curriculum.",
};

// Static route (no params) — prerendered as an empty shell under output:"export";
// the due-card list hydrates from localStorage on the client.
export default function ReviewPage() {
  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-0 bg-atmosphere-light dark:bg-atmosphere" />
      <div className="relative">
        <ReviewDashboard />
      </div>
    </div>
  );
}
