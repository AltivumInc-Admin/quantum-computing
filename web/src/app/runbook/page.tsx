import type { Metadata } from "next";
import { RunbookDashboard } from "@/components/runbook-dashboard";

export const metadata: Metadata = {
  title: "Runbook — Quantum Workspace",
  robots: { index: false, follow: false },
  description:
    "Your mastery ledger: skills carried into proven spaced-repetition retention, your weekly streak, and a contribution graph of every day you practiced.",
};

// Static route (no params) — prerendered as an inert shell under output:"export";
// the ledger hydrates from localStorage on the client (see RunbookDashboard).
export default function RunbookPage() {
  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-0 bg-atmosphere-light dark:bg-atmosphere" />
      <div className="relative">
        <RunbookDashboard />
      </div>
    </div>
  );
}
