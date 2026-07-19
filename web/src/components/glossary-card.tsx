import type { CSSProperties } from "react";
import { TransitionLink } from "@/components/transition-link";

// Companion resource card. Mirrors SectionCard's chrome (rounded card, surface
// token, hover lift/glow) but carries a "Reference" eyebrow and no number badge,
// so it reads as a sibling resource rather than a numbered curriculum module.
//
// `href` is overridable so CurriculumGrid can gate signed-out clicks the same
// way it gates the sibling section cards: /glossary sits behind the AuthWall,
// and identical-looking cards in one grid must not bounce the same visitor
// two different ways.
export function GlossaryCard({ href = "/glossary" }: { href?: string }) {
  return (
    <TransitionLink
      href={href}
      aria-label="Glossary, an A to Z reference of quantum terms"
      style={{ "--hue": 192 } as CSSProperties}
      className="group relative block rounded-card border border-gray-200/60 dark:border-white/[0.06] bg-(--surface-1) backdrop-blur-md overflow-hidden interactive focus-ring shadow-(--shadow-resting) hover:-translate-y-1.5 hover:shadow-(--shadow-raised) hover:border-gray-300/80 dark:hover:border-white/[0.12] transition-all duration-300"
    >
      <div className="section-glow absolute inset-[-1px] rounded-card opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
      <div className="section-bleed relative h-20 rounded-card">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-(--surface-1)" />
      </div>
      <div className="relative p-6 -mt-6">
        <p className="text-xs font-semibold tracking-widest uppercase hue-text mb-3">Reference</p>
        <h3 className="font-display text-display-md tracking-tight text-gray-900 dark:text-white group-hover:text-accent dark:group-hover:text-accent-light transition-colors duration-200">
          Glossary
        </h3>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 leading-relaxed line-clamp-3">
          Look up any quantum term, A to Z — each linked to the lesson that teaches it.
        </p>
        <div className="h-px bg-gradient-to-r from-gray-200/50 dark:from-gray-700/30 to-transparent mt-4 mb-4" />
        <div
          aria-hidden="true"
          className="flex items-center gap-1.5 text-xs font-medium text-caption group-hover:text-accent dark:group-hover:text-accent-light transition-colors duration-200"
        >
          <span>Browse terms</span>
          <svg className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </TransitionLink>
  );
}
