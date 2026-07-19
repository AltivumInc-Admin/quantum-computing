import type { Metadata } from "next";
import { CredentialsWall } from "@/components/credentials-wall";

export const metadata: Metadata = {
  title: "Credentials — Quantum Workspace",
  robots: { index: false, follow: false },
  description:
    "Software-verified credentials: medals for modules completed, skills held in proven retention, weeks of unbroken practice, and circuits run on a real quantum computer — sponsored, so you never pay.",
};

// Static route (no params) — prerendered as an inert shell under output:"export";
// the medal wall hydrates from localStorage on the client (see CredentialsWall).
export default function CredentialsPage() {
  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-0 bg-atmosphere-light dark:bg-atmosphere" />
      <div className="relative">
        <CredentialsWall />
      </div>
    </div>
  );
}
