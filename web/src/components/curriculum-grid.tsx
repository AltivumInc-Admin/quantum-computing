"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { SectionCard } from "@/components/section-card";
import { GlossaryCard } from "@/components/glossary-card";
import { SectionGateModal, type GateSection } from "@/components/section-gate-modal";

export interface CurriculumSection extends GateSection {
  summary: string;
}

/**
 * The welcome page's curriculum grid. Anyone can browse the modules; opening
 * one is where the sign-up gate lives. Signed-in learners click straight
 * through; signed-out visitors get a per-section preview dialog with the
 * account CTAs instead.
 *
 * The still-resolving "configuring" state gates too (the safe default for a
 * prospect); if the session then resolves to signed-in while the dialog is
 * open, it offers "Continue to section" rather than asking them to sign up.
 * When auth isn't configured at all there is nothing to sign up for, so the
 * cards stay plain links — which is also exactly what the static export and
 * unit tests render.
 */
export function CurriculumGrid({ sections }: { sections: CurriculumSection[] }) {
  const { status } = useAuth();
  const [gatedSection, setGatedSection] = useState<CurriculumSection | null>(null);

  const gate = status === "unauthenticated" || status === "configuring";

  return (
    <>
      <ul role="list" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((section, i) => (
          <li
            key={section.slug}
            className="animate-card-enter"
            style={{ animationDelay: `${150 + i * 80}ms` }}
          >
            <SectionCard
              slug={section.slug}
              index={section.index}
              title={section.title}
              summary={section.summary}
              notebookCount={section.notebookCount}
              hasPopup={gate}
              onClick={
                gate
                  ? (e) => {
                      e.preventDefault();
                      setGatedSection(section);
                    }
                  : undefined
              }
            />
          </li>
        ))}
        <li
          className="animate-card-enter"
          style={{ animationDelay: `${150 + sections.length * 80}ms` }}
        >
          <GlossaryCard />
        </li>
      </ul>

      {gatedSection && (
        <SectionGateModal
          section={gatedSection}
          authenticated={status === "authenticated"}
          onClose={() => setGatedSection(null)}
        />
      )}
    </>
  );
}
