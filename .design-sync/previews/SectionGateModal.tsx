// SectionGateModal — the welcome-page sign-up gate: a per-section preview
// dialog shown in place of navigation for signed-out visitors. It renders via
// createPortal to document.body, so in a preview cell it overlays the viewport
// rather than sitting inside the card (expected for a modal — may need the
// orchestrator override cfg.overrides.SectionGateModal:{cardMode:"single"}).
import * as React from "react";
import { SectionGateModal } from "quantum-ds";
import { getSections } from "@/lib/sections";
import { pitchFor } from "@/lib/section-pitch";

const s = getSections().find((x) => x.slug === "01-foundations")!;

export function SignedOut() {
  return (
    <div style={{ padding: 20 }}>
      <SectionGateModal
        section={{
          slug: s.slug,
          index: s.index,
          title: s.title,
          notebookCount: s.notebookCount,
          runnableCount: s.runnableCount,
          pitch: pitchFor(s.slug, "Hands-on lessons and exercises."),
        }}
        authenticated={false}
        onClose={() => {}}
      />
    </div>
  );
}
