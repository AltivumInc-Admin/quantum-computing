/**
 * The DEPENDENCY-FREE shared primitives — the widget shell recipe, the failure
 * card, the eyebrow micro-label and the reveal-panel tone pair — split out of
 * widget-ui so `widget-fence` can render the failure state without statically
 * importing the whole primitive module (which pulls in the math kernel, the
 * Dirac readout and CopyButton). Every widget is code-split behind
 * next/dynamic; the fence itself ships in the lesson chunk, so what it imports
 * eagerly matters — and a light widget that needs only a shell and a label
 * (quiz, review-card) should not drag the kernel into its own chunk either.
 *
 * Every symbol here is re-exported from `./widget-ui`, which stays the
 * canonical import path for widgets that already need the heavy module.
 */

import type { ReactNode } from "react";

// The smoke-and-glass widget shell: the `.glass` recipe (translucent fill +
// backdrop blur + hairline border + glass elevation) on a rounded card.
// Deliberately carries NO shadow utility — `.glass` already sets
// `box-shadow: var(--shadow-resting)`.
export const cardShell = "rounded-card glass";

/**
 * The failure state for a widget: a bad fence config, a parse error, or a
 * widget chunk that threw. Styled on the warm tier (the system's failure hue,
 * shared with CopyButton's failed state and the incorrect-verdict chips) so a
 * broken explorable is visually distinct from an ordinary muted caption.
 */
export function ErrorCard({
  label,
  message,
  className = "my-6",
}: {
  label: string;
  message?: string;
  className?: string;
}) {
  return (
    <div className={`not-prose ${className} ${cardShell} px-4 py-3`}>
      <p className="font-mono text-sm text-warm-dark dark:text-warm-light">
        {message ? `${label} error: ${message}` : `${label} error`}
      </p>
    </div>
  );
}

/**
 * The check glyph shared by every solved/correct affordance in the widget
 * family (previously redeclared byte-identically in six modules, shipping the
 * same markup in six separate dynamic chunks). `size` keeps the geometry a
 * caller concern so larger consumers can adopt it unchanged.
 */
export function CheckIcon({ size = "h-3.5 w-3.5" }: { size?: string } = {}) {
  return (
    <svg
      className={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

/**
 * The verdict badge shared by the Rep/activity widgets and the /review roster.
 * `tone` picks the semantic pair: `accent` for a correct/solved outcome, `warm`
 * for a not-quite one. Previously copy-pasted byte-identically across six
 * widgets, plus a seventh drifted copy on the dashboard.
 *
 * `size` exists for that roster status row, whose chips sit on the 10px
 * uppercase roster scale beside a "Due" sibling — the dashboard had kept its
 * own copy rather than jump to the widget-header scale.
 */
const VERDICT_BADGE_SIZE: Record<"sm" | "xs", { box: string; icon: string }> = {
  sm: { box: "gap-1.5 text-xs", icon: "h-3.5 w-3.5" },
  xs: { box: "gap-1 text-[10px]", icon: "h-3 w-3" },
};

export function VerdictBadge({
  tone,
  children,
  size = "sm",
  showCheck = tone === "accent",
}: {
  tone: "accent" | "warm";
  children: ReactNode;
  size?: "sm" | "xs";
  /** The check glyph; defaults on for the accent (correct/solved) tone. */
  showCheck?: boolean;
}) {
  const scale = VERDICT_BADGE_SIZE[size];
  return (
    <span
      className={`inline-flex items-center rounded-chip px-2 py-0.5 font-semibold ${scale.box} ${
        tone === "accent"
          ? "bg-accent/10 text-accent-dark dark:text-accent-light"
          : "bg-warm/10 text-warm-dark dark:text-warm-light"
      }`}
    >
      {showCheck && <CheckIcon size={scale.icon} />}
      {children}
    </span>
  );
}

/**
 * The geometry-free tone pair for a revealed panel (a hint, a worked answer, an
 * itemized breakdown, a verdict body): a left rule plus a tinted fill. Kept
 * SEMANTICALLY NEUTRAL — quiz's hint/answer disclosures compute no verdict, so
 * they must not consume `VERDICT_STYLES` — and `VERDICT_STYLES` is defined in
 * terms of it, so a token retune reaches both families at once. The recipe had
 * been hand-written verbatim in five widgets.
 */
export const REVEAL_PANEL: Record<"accent" | "warm", string> = {
  accent: "border-l-2 border-accent/60 bg-accent/5 dark:bg-accent/10",
  warm: "border-l-2 border-warm/60 bg-warm/5 dark:bg-warm/10",
};

/**
 * The micro-label above a widget or a section inside one. `strong` is the
 * heavier activity/Rep idiom (font-semibold) the challenge/quiz/predict family
 * uses; the default font-medium is the explorable idiom. Both spellings were
 * copy-pasted across nine files and had already drifted on the dark-mode color
 * (`dark:text-accent` vs `dark:text-accent-light`) — `dark:text-accent` is
 * canonical, so two Rep widgets in one lesson can no longer render different
 * header colors.
 *
 * `tone` picks the hue pair. It exists because `className` is layout-only, so
 * quiz's warm "Hint" caption could not be expressed and had hand-rolled the
 * geometry sixteen lines above a real `<EyebrowLabel strong>` — the exact drift
 * this component was created to stop.
 */
const EYEBROW_TONE: Record<"accent" | "warm", string> = {
  accent: "text-accent-dark dark:text-accent",
  warm: "text-warm-dark dark:text-warm-light",
};

export function EyebrowLabel({
  children,
  as: Tag = "span",
  id,
  strong = false,
  tone = "accent",
  className = "",
}: {
  children: ReactNode;
  as?: "span" | "h3";
  id?: string;
  strong?: boolean;
  tone?: "accent" | "warm";
  /** Layout only (e.g. `mb-2 block`) — never color/weight. */
  className?: string;
}) {
  return (
    <Tag
      id={id}
      className={`font-mono text-[10px] ${
        strong ? "font-semibold" : "font-medium"
      } uppercase tracking-[0.2em] ${EYEBROW_TONE[tone]}${
        className ? ` ${className}` : ""
      }`}
    >
      {children}
    </Tag>
  );
}
