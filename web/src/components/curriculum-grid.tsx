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
 * cards stay plain links — the state unit tests and an env-less local export
 * render. The CONFIGURED production build is different since the platform
 * AuthWall landed (a72b705): the provider prerenders as "configuring", so the
 * exported HTML carries the gated cards (aria-haspopup) and protected routes
 * prerender as the wall's gate screen.
 *
 * The glossary card gates here too, but routes instead of opening the
 * section-shaped preview dialog: signed-out clicks go to
 * /login?mode=signup&next=/glossary (sign-up framing, destination kept) —
 * without this, the AuthWall would yank the visitor to a bare sign-in form
 * while the identical-looking section cards get the polished pitch.
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
                      // Only plain primary clicks are gated — modified clicks
                      // (new tab/window) keep their native browser behavior.
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
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
          <GlossaryCard
            href={
              gate
                ? `/login?mode=signup&next=${encodeURIComponent("/glossary")}`
                : undefined
            }
          />
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
