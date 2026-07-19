import Link from "next/link";
import type { ReactNode } from "react";

/**
 * One feature band on the welcome page: the two-column kicker / display
 * headline / body / arrow-link scaffold beside a visual. Every band — the
 * three photo bands AND the AI-tutor mock band — flows through this single
 * component, so band styling can never fork between them again (the tutor
 * band used to hand-copy ~70 lines of this markup inline).
 */
export interface FeatureBandProps {
  kicker: string;
  title: string;
  body: string;
  href: string;
  linkLabel: string;
  /** The right (or left, when flipped) column: a framed image, a product
      mock — any ReactNode. */
  visual: ReactNode;
  flip?: boolean;
}

export function Band({ kicker, title, body, href, linkLabel, visual, flip }: FeatureBandProps) {
  return (
    <div className="grid gap-10 lg:grid-cols-2 lg:gap-16 items-center reveal">
      <div className={flip ? "lg:order-2" : undefined}>
        <p className="text-xs font-semibold tracking-[0.2em] uppercase text-accent-dark dark:text-accent-light font-mono mb-3">
          {kicker}
        </p>
        <h3 className="font-display text-display-lg text-(--ink) text-balance">
          {title}
        </h3>
        <p className="mt-4 text-base sm:text-lg text-(--mut) leading-relaxed">
          {body}
        </p>
        <Link
          href={href}
          className="mt-6 inline-flex items-center gap-1.5 text-base font-medium text-accent-dark dark:text-accent-light hover:underline underline-offset-4 interactive focus-ring rounded"
        >
          {linkLabel}
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
          </svg>
        </Link>
      </div>
      <div className={flip ? "lg:order-1" : undefined}>{visual}</div>
    </div>
  );
}

/** The framed photographic visual the three image bands share. */
export function BandImage({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="rounded-card overflow-hidden border border-gray-200/60 dark:border-white/[0.08] bg-smoke shadow-(--shadow-resting)">
      {/* eslint-disable-next-line @next/next/no-img-element -- static export has no image optimizer; assets are pre-sized WebP */}
      <img
        src={src}
        alt={alt}
        width={1280}
        height={853}
        loading="lazy"
        decoding="async"
        className="w-full h-auto"
      />
    </div>
  );
}
