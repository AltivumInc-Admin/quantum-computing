import Link from "next/link";
import { COHORT_SIZE, allBadges } from "@/lib/founding-ten";
import { translate } from "@/i18n/translate";
import type { Locale } from "@/i18n/types";

const TOTAL = COHORT_SIZE * 2; // ten charter places + ten patron places

/**
 * The only way into /founding-ten from the rest of the site.
 *
 * DESIGN. Scarcity is only legible if you can see the count, so this is a
 * READOUT, not a link with a label on it — and it is deliberately written in
 * the badge's own typographic idiom: tracked uppercase mono, a middle dot
 * separator, and a zero-padded `NN / NN` pair, exactly as the artwork engraves
 * `CHR · 01 / 10`. Someone who has seen a badge recognises the form before
 * they read the words, which is the whole point of a house typographic voice.
 *
 * It is quiet on purpose. The claim "ten places, ever" is only credible if the
 * site is not shouting it; a marketing banner would undercut the very scarcity
 * it advertises. The numbers do the work.
 *
 * The count comes from the checked-in registry, which is a static JSON import —
 * so it is resolved at build time and baked into the export. No fetch, no
 * loading state, and it cannot disagree with the roster it links to. The Footer
 * that renders this is a client component, so this ships in that bundle; the
 * registry is a handful of rows, so that costs nothing meaningful.
 */
export function FoundingTenLink({ locale }: { locale: Locale }) {
  const claimed = allBadges().length;

  return (
    <Link
      href="/founding-ten"
      className="group inline-flex items-baseline gap-2 rounded focus-ring interactive"
      // The visible text is a bare numeric pair; on its own it would read as
      // "one slash twenty" with no subject. Name the whole thing for AT.
      aria-label={translate(locale, "foundingTen.ariaLabel", { claimed, total: TOTAL })}
    >
      <span className="eyebrow eyebrow-mut transition-colors group-hover:text-accent dark:group-hover:text-accent-light">
        {translate(locale, "foundingTen.label")}
      </span>
      <span aria-hidden="true" className="font-mono text-xs tabular-nums text-caption">
        ·
      </span>
      <span aria-hidden="true" className="font-mono text-xs tabular-nums">
        <span className="text-accent-dark dark:text-accent-light">
          {String(claimed).padStart(2, "0")}
        </span>
        <span className="text-caption"> / {TOTAL}</span>
      </span>
    </Link>
  );
}
