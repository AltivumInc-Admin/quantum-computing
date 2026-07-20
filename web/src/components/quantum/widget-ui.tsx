"use client";

import { useId, type ReactNode } from "react";
import { basisLabel, type Complex } from "./math";
import type { ParsedGate } from "./qsim-dsl";
import { diracString, toPythonState } from "./state-readout";
import { formatFixed, formatPercent } from "./format";
import {
  cardShell,
  ErrorCard,
  EyebrowLabel,
  REVEAL_PANEL,
  CheckIcon,
  VerdictBadge,
} from "./error-card";
import { CopyButton } from "../copy-button";
import { reviewDayPhrase } from "@/lib/review-schedule";

/**
 * Shared presentational primitives for the circuit-family explorables
 * (CircuitLab, WavefunctionScrubber, CorrelationDemo, BlochBuilder). These were
 * previously copy-pasted verbatim across the widgets; centralizing them keeps
 * the gate-label rules, pill styling, probability-bar geometry, and Dirac/copy
 * readout in one place.
 *
 * Token convention: `.text-caption` is the canonical spelling for the muted
 * tier (globals.css calls it "the single source for the muted tier"). The bare
 * `text-(--mut)` arbitrary value renders identically, but new code should use
 * `.text-caption` so a widget author copying a neighbouring file lands on one
 * spelling.
 */

/** Human-readable label for a parsed gate. */
export function gateLabel(g: ParsedGate): string {
  return g.gate === "CNOT"
    ? `CNOT ${g.control}→${g.target}`
    : g.bound
      ? `${g.gate}(θ) q${g.target}`
      : g.theta !== undefined
        ? // formatFixed (not raw toFixed) so a tiny negative literal angle
          // renders "0.00" rather than the signed-zero wart "-0.00".
          `${g.gate}(${formatFixed(g.theta, 2)}) q${g.target}`
        : `${g.gate} q${g.target}`;
}

/**
 * The transport glyph shared by every play/pause affordance (the wavefunction
 * scrubber, the playground's state panel, the runnable editor's Run button).
 * Same rationale as CheckIcon (now in ./error-card, re-exported below): it had
 * been redeclared byte-identically in
 * three modules, shipping the same markup in three separate dynamic chunks.
 * `playing` swaps in the pause bars; callers with no paused state (Run) omit it
 * and get the triangle.
 */
export function PlayIcon({ playing = false }: { playing?: boolean } = {}) {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      {playing ? <path d="M8 5h3v14H8zM13 5h3v14h-3z" /> : <path d="M8 5v14l11-7z" />}
    </svg>
  );
}

/** One gate pill. `active` highlights it (e.g. the scrubber's current gate). */
export function GateChip({ label, active = false }: { label: string; active?: boolean }) {
  return (
    <span
      // "step" fits the scrubber's gate sequence; React drops the attribute
      // entirely when undefined, so non-scrubber consumers are unaffected.
      aria-current={active ? "step" : undefined}
      className={`rounded-chip px-2 py-0.5 text-[11px] font-mono transition-colors duration-150 ${
        active
          ? "chip-selected"
          : "border border-(--bd) bg-(--field) text-caption"
      }`}
    >
      {label}
    </span>
  );
}

/** The row of gate pills for a parsed program. `activeIndex` highlights one. */
export function GateChips({
  gates,
  activeIndex,
}: {
  gates: ParsedGate[];
  activeIndex?: number;
}) {
  return (
    <>
      {gates.map((g, i) => (
        <GateChip key={i} label={gateLabel(g)} active={i === activeIndex} />
      ))}
    </>
  );
}

export function Bar({
  label,
  fraction,
  valueText,
  fillClass = "bar-fill",
  labelClassName = "text-caption",
  valueClassName = "text-caption",
  valueWidth = "w-12",
  ket = true,
  marker,
  ariaLabel,
}: {
  label: string;
  fraction: number;
  valueText: ReactNode;
  fillClass?: string;
  labelClassName?: string;
  valueClassName?: string;
  /** Width class for the right-hand readout column (two-tone readouts use w-24). */
  valueWidth?: string;
  /**
   * Wrap the label in a Dirac ket (`|label⟩`). True for basis-state rows, which
   * is every original caller. Pass `false` for labels that are not kets — the
   * qham term list keys its rows on Pauli strings (`IIIZ`, `XXYY`), and that one
   * hardcoded wrapper was the sole reason the widget hand-rolled its own copy of
   * this row rather than reusing it.
   */
  ket?: boolean;
  /**
   * Expected-value marker: a thin vertical line inside the track at `fraction`.
   * Its presence switches the track to overflow-visible — at 100% the 2px line
   * pokes past the rounded edge and overflow-hidden would clip it.
   */
  marker?: { fraction: number; title?: string };
  /**
   * When set, the row is exposed as a single named `role="img"` node (children
   * become presentational). An aria-label on the bare div would be prohibited
   * naming (ARIA: role=generic) and never reliably reach AT.
   */
  ariaLabel?: string;
}) {
  const pct = Math.max(0, Math.min(1, fraction)) * 100;
  return (
    <div
      className="flex items-center gap-2"
      role={ariaLabel ? "img" : undefined}
      aria-label={ariaLabel}
    >
      <span className={`w-12 shrink-0 font-mono text-xs ${labelClassName}`}>
        {ket ? <>|{label}&#10217;</> : label}
      </span>
      <span
        className={`relative h-3 flex-1 rounded-full bg-(--track) ${
          marker ? "overflow-visible" : "overflow-hidden"
        }`}
      >
        <span
          className={`absolute inset-y-0 left-0 overflow-hidden rounded-full transition-[width] duration-200 motion-reduce:transition-none bar-shimmer ${fillClass}`}
          style={{ width: `${pct.toFixed(2)}%` }}
        />
        {marker && (
          <span
            // Information-bearing graphic (the shots sampler's whole teaching
            // point), so it takes WCAG 1.4.11's 3:1 non-text floor: the light
            // theme pairs DOWN to --accent-dark exactly like the text tier,
            // because the raw light --accent is 2.79:1 on --surface-base.
            // Pinned by token-contrast.test.ts's graphics-tier assertions.
            className="absolute top-0 bottom-0 w-0.5 bg-accent-dark dark:bg-accent-light"
            style={{ left: `${(Math.max(0, Math.min(1, marker.fraction)) * 100).toFixed(2)}%` }}
            title={marker.title}
          />
        )}
      </span>
      <span
        className={`${valueWidth} shrink-0 text-right font-mono text-xs tabular-nums ${valueClassName}`}
      >
        {valueText}
      </span>
    </div>
  );
}

/**
 * The de-emphasized bar fill for rows that are not the one being taught.
 * Single-sourced because grover (gray-300/600) and qft (gray-400/500) had
 * drifted onto two different grays for the identical role.
 */
export const NEUTRAL_BAR_FILL = "bg-gray-300 dark:bg-gray-600";

/** The "this row carries the verdict" label treatment. */
export const EMPHASIS_LABEL = "text-accent-dark dark:text-accent-light font-semibold";

/** Probability bars: one row per basis state (|label⟩, accent fill, percentage). */
export function ProbBars({
  probs,
  n,
  labelFor = basisLabel,
  highlightIndex,
}: {
  probs: number[];
  n: number;
  labelFor?: (idx: number, n: number) => string;
  /**
   * Marks the decisive row (e.g. Deutsch-Jozsa's all-zeros outcome, on which
   * the whole verdict rests). Its label/value get the accent emphasis so the
   * verdict chip has a visible referent; the fills stay uniform, since here
   * every row is real data rather than grover's marked-vs-unmarked split.
   */
  highlightIndex?: number;
}) {
  return (
    <div className="space-y-1.5">
      {probs.map((p, idx) => {
        const emphasized = idx === highlightIndex;
        return (
          <Bar
            key={idx}
            label={labelFor(idx, n)}
            fraction={p}
            valueText={formatPercent(p * 100)}
            labelClassName={emphasized ? EMPHASIS_LABEL : "text-caption"}
            valueClassName={emphasized ? EMPHASIS_LABEL : "text-caption"}
          />
        );
      })}
    </div>
  );
}

/** Dirac state line + copy-as-notation / copy-as-Python buttons. */
export function StateReadout({ state, n }: { state: Complex[]; n: number }) {
  return (
    <div className="mt-4 flex items-start gap-2">
      <p className="min-w-0 flex-1 break-words font-mono text-sm text-(--ink)">
        <span className="text-caption">|&#968;&#10217; = </span>
        <span className="text-accent-dark dark:text-accent-light">{diracString(state, n)}</span>
      </p>
      <div className="flex shrink-0 items-center gap-1">
        <CopyButton getText={() => diracString(state, n)} label="Copy state notation" />
        <span className="flex items-center">
          <CopyButton getText={() => toPythonState(state)} label="Copy state as runnable Python" />
          {/* decorative — the copy button already says "runnable Python" to AT */}
          <span aria-hidden="true" className="-ml-1 rounded bg-accent/10 px-1 py-0.5 font-mono text-[9px] text-accent-dark dark:text-accent-light">py</span>
        </span>
      </div>
    </div>
  );
}

// `cardShell`, `ErrorCard`, `EyebrowLabel`, `REVEAL_PANEL`, `CheckIcon` and
// `VerdictBadge` live in ./error-card so the widget fence — and any light
// consumer that needs only a shell, a label or a badge (quiz, review-card, the
// /review dashboard) — can use them without pulling this module (and its
// math/copy dependencies) into its chunk. Re-exported here so widgets that
// already need the heavy module keep importing everything from "./widget-ui".
export { cardShell, ErrorCard, EyebrowLabel, REVEAL_PANEL, CheckIcon, VerdictBadge };

/**
 * Chip tones. `neutral` is the resting descriptor. `warn` is the caution tier
 * for a caveat the learner must carry (e.g. "STO-3G minimal basis" — a model
 * limitation, not a feature), on the system's warm tokens rather than the raw
 * `amber-100/amber-700` recipe two widgets had each hand-rolled: the same words
 * were rendering neutral in qham and amber in qpes inside one lesson.
 */
export const CHIP_TONE: Record<"neutral" | "warn", string> = {
  neutral: "border-(--bd) bg-(--field) text-caption",
  warn: "border-warm/50 bg-warm/10 text-warm-dark dark:text-warm-light",
};

export function Chip({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "warn";
}) {
  return (
    <span
      className={`rounded-chip border px-2.5 py-0.5 text-[11px] font-mono ${CHIP_TONE[tone]}`}
    >
      {children}
    </span>
  );
}

export function WidgetCard({
  eyebrow,
  eyebrowAs,
  eyebrowId,
  chips,
  headerRight,
  header,
  children,
  className = "my-6",
}: {
  eyebrow?: ReactNode;
  eyebrowAs?: "span" | "h3";
  eyebrowId?: string;
  chips?: ReactNode;
  headerRight?: ReactNode;
  header?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const hasHeader = header !== undefined || eyebrow !== undefined;
  let headerNode: ReactNode = header;
  if (headerNode === undefined && eyebrow !== undefined) {
    headerNode = headerRight !== undefined ? (
      <div className="flex items-center justify-between gap-2 border-b border-(--bd) px-4 py-2">
        <EyebrowLabel as={eyebrowAs} id={eyebrowId}>{eyebrow}</EyebrowLabel>
        {headerRight}
      </div>
    ) : (
      <div className="flex flex-wrap items-center gap-2 border-b border-(--bd) px-4 py-2">
        <EyebrowLabel as={eyebrowAs} id={eyebrowId}>{eyebrow}</EyebrowLabel>
        {chips}
      </div>
    );
  }
  return (
    <div className={`not-prose ${className} ${cardShell}${hasHeader ? " overflow-hidden" : ""}`}>
      {headerNode}
      {children}
    </div>
  );
}

/**
 * The schedule note under a graded Rep's verdict ("Reviewed — next review in 6
 * days." on /review, "Added to your review — back in 6 days." in a lesson).
 * The 6-line nested ternary behind it was copy-pasted byte-identically across
 * all six graded Reps, and the wrapper had already drifted on the top margin
 * (mt-2 vs mt-1).
 *
 * Deliberately carries NO `role="status"`: five of the six call sites already
 * sit inside an outcome live region, and a nested live region is not reliably
 * announced. Callers that need one own the wrapper.
 */
export function ScheduleNote({
  days,
  surface,
}: {
  days: number;
  surface?: "lesson" | "review";
}) {
  const phrase = reviewDayPhrase(days);
  return (
    <p className="mt-2 text-xs text-caption animate-fade-up">
      {surface === "review"
        ? `Reviewed — next review ${phrase}.`
        : `Added to your review — back ${phrase}.`}
    </p>
  );
}

/**
 * The shortest-solution caption on the two DSL-editor Reps, identical but for
 * the leading verb (challenge "Solved", debug-circuit "Fixed"). Sits beside
 * ScheduleNote above and shares its `mt-2` offset so the pair reads as one block.
 *
 * Like ScheduleNote, carries no `role="status"` — both call sites already sit
 * inside an outcome live region.
 */
export function BestGatesNote({
  verb,
  gates,
  best,
}: {
  verb: "Solved" | "Fixed";
  gates: number;
  /** The personal best; only mentioned when this solve did not match it. */
  best: number | null;
}) {
  return (
    <p className="mt-2 text-xs text-caption tabular-nums animate-fade-up">
      {verb} in {gates} gate{gates === 1 ? "" : "s"}
      {best !== null && best < gates
        ? ` — your best is ${best}. Can you match it?`
        : " — your best."}
    </p>
  );
}

/**
 * The result panel below a Rep widget's controls. One source for the three
 * verdict states so sibling widgets a learner meets back to back cannot drift
 * — challenge and debug-circuit had already diverged on the `error` border
 * token (--bd at 0.13 alpha vs --bd-2 at 0.22), rendering different border
 * strengths for the same state. --bd (challenge's value) is canonical.
 */
export const VERDICT_STYLES: Record<"solved" | "wrong" | "error", string> = {
  solved: `${REVEAL_PANEL.accent} text-accent-dark dark:text-accent-light`,
  wrong: `${REVEAL_PANEL.warm} text-warm-dark dark:text-warm-light`,
  error: "border-l-2 border-(--bd) bg-(--field) text-caption",
};

/**
 * Base recipe for a selectable answer option (predict / expectation /
 * cost-estimate). Deliberately carries NO padding — the three widgets size
 * their own options (`px-3` vs `px-2.5`), same reasoning as `fieldClass`.
 */
export const OPTION_BASE =
  "rounded-control border font-mono text-sm interactive focus-ring disabled:cursor-default";

/**
 * Answer-option tones. `neutral` is the unanswered resting state — tokenized
 * (--bd / --field / the muted tier) rather than the raw grays expectation-widget
 * had drifted onto, so a token retune reaches all three widgets.
 */
export const OPTION_TONE: Record<"neutral" | "selected" | "correct" | "wrong", string> = {
  neutral:
    "border-(--bd) bg-(--field) text-caption hover:bg-gray-100 dark:hover:bg-gray-800",
  selected: "border-accent/50 bg-accent/15 text-accent-dark dark:text-accent-light",
  correct: "border-accent/60 bg-accent/15 text-accent-dark dark:text-accent-light",
  wrong: "border-warm/60 bg-warm/10 text-warm-dark dark:text-warm-light",
};

// LiveStatus is now single-sourced in ../live-status and shared with the auth
// surface (password-checklist.tsx). Re-exported here so the explorables keep
// importing it from "./widget-ui" unchanged.
export { LiveStatus } from "../live-status";

export const primaryActionClass =
  "rounded-control surface-accent px-4 py-1.5 text-sm font-semibold focus-ring interactive disabled:opacity-60";

// Tokenized on the same --bd/--field/--ink tier as fieldClass and Chip: the
// raw cool grays rendered a #6b7280-family control beside warm --mut captions
// inside the same card, and a token retune (like #172's) skipped them.
export const secondaryActionClass =
  "rounded-control border border-(--bd) bg-(--field) px-4 py-1.5 text-sm font-medium text-(--ink) hover:bg-(--glass-2) focus-ring transition-colors motion-reduce:transition-none";

// Deliberately carries NO sizing (padding/text-size): appending conflicting
// Tailwind utilities after a token is resolved by stylesheet order, not class
// order, so each control appends its own `px-* py-* text-*` instead.
export const fieldClass =
  "rounded-control border border-(--bd) bg-(--field) text-(--ink) focus-ring";

/**
 * One labeled range-slider row, shared by every explorable that exposes a
 * numeric control (angle θ/φ, depth, iterations, bond length R, error rate, …).
 * Centralizes the invariant contract the per-widget copies kept drifting on:
 * the `slider flex-1 focus-ring` input (focus ring; the >=24px WCAG 2.5.8
 * touch target is owned by the `.slider` recipe in globals.css and pinned by
 * slider-target-size.test.ts), the
 * `aria-label`/`aria-valuetext` pairing, the `tabular-nums` value readout, and a
 * self-owned `useId` wiring `<label htmlFor>` to the input (callers no longer
 * thread their own id). `display` is the rendered value (e.g. `1.57 rad`, `42`,
 * a unit sub-span); `parse` converts the raw string (default `parseFloat`; pass
 * a base-10 `parseInt` for integer sliders). Bespoke geometry stays per-caller:
 * `valueWidth` (the readout column), `labelClassName` (symbol vs word, size),
 * and `rowClassName` (inline `mt-*` row vs full-bleed `border-t … px-4 py-3`
 * card section). `leading` injects a node before the input (e.g. a play button);
 * `labelAbove` stacks the label over the input for grid layouts.
 */
export function LabeledSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  ariaLabel,
  ariaValueText,
  display,
  parse = parseFloat,
  rowClassName = "flex items-center gap-3",
  labelClassName = "shrink-0 font-mono text-sm text-caption",
  valueWidth = "w-16",
  labelAbove = false,
  leading,
}: {
  label?: ReactNode;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  ariaLabel: string;
  ariaValueText?: string;
  display: ReactNode;
  parse?: (raw: string) => number;
  rowClassName?: string;
  labelClassName?: string;
  valueWidth?: string;
  labelAbove?: boolean;
  leading?: ReactNode;
}) {
  const id = useId();
  // A label-less slider (e.g. a timeline scrubber) relies on aria-label alone.
  const labelEl =
    label === undefined ? null : (
      <label htmlFor={id} className={labelClassName}>
        {label}
      </label>
    );
  const inputEl = (
    <input
      id={id}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parse(e.target.value))}
      className="slider flex-1 focus-ring"
      aria-label={ariaLabel}
      aria-valuetext={ariaValueText}
    />
  );
  const valueEl = (
    <span
      className={`${valueWidth} shrink-0 text-right font-mono text-xs tabular-nums text-caption`}
    >
      {display}
    </span>
  );

  if (labelAbove) {
    return (
      <div className={rowClassName}>
        {labelEl}
        <div className="flex items-center gap-3">
          {leading}
          {inputEl}
          {valueEl}
        </div>
      </div>
    );
  }

  return (
    <div className={rowClassName}>
      {leading}
      {labelEl}
      {inputEl}
      {valueEl}
    </div>
  );
}
