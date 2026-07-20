"use client";

import { useId, type ReactNode } from "react";
import { basisLabel, type Complex } from "./math";
import type { ParsedGate } from "./qsim-dsl";
import { diracString, toPythonState } from "./state-readout";
import { formatFixed, formatPercent } from "./format";
import { cardShell, ErrorCard } from "./error-card";
import { CopyButton } from "../copy-button";

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
          : "border border-(--bd) bg-(--field) text-(--mut)"
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
        |{label}&#10217;
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
            className="absolute top-0 bottom-0 w-0.5 bg-accent dark:bg-accent-light"
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
      <p className="min-w-0 flex-1 break-words font-mono text-sm text-gray-700 dark:text-gray-200">
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

// `cardShell` and `ErrorCard` live in ./error-card so the widget fence can
// render the failure state without pulling this module (and its math/copy
// dependencies) into the eagerly-loaded lesson chunk. Re-exported here so
// widgets keep importing everything from "./widget-ui".
export { cardShell, ErrorCard };

/**
 * The micro-label above a widget or a section inside one. `strong` is the
 * heavier activity/Rep idiom (font-semibold) the challenge/quiz/predict family
 * uses; the default font-medium is the explorable idiom. Both spellings were
 * copy-pasted across nine files and had already drifted on the dark-mode color
 * (`dark:text-accent` vs `dark:text-accent-light`) — `dark:text-accent` is
 * canonical, so two Rep widgets in one lesson can no longer render different
 * header colors.
 */
export function EyebrowLabel({
  children,
  as: Tag = "span",
  id,
  strong = false,
  className = "",
}: {
  children: ReactNode;
  as?: "span" | "h3";
  id?: string;
  strong?: boolean;
  /** Layout only (e.g. `mb-2 block`) — never color/weight. */
  className?: string;
}) {
  return (
    <Tag
      id={id}
      className={`font-mono text-[10px] ${
        strong ? "font-semibold" : "font-medium"
      } uppercase tracking-[0.2em] text-accent-dark dark:text-accent${
        className ? ` ${className}` : ""
      }`}
    >
      {children}
    </Tag>
  );
}

export function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-chip border border-(--bd) bg-(--field) px-2.5 py-0.5 text-[11px] font-mono text-(--mut)">
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
 * The header verdict badge shared by the Rep/activity widgets. `tone` picks the
 * semantic pair: `accent` for a correct/solved outcome, `warm` for a
 * not-quite one. Previously copy-pasted byte-identically across six widgets.
 */
export function VerdictBadge({
  tone,
  children,
  showCheck = tone === "accent",
}: {
  tone: "accent" | "warm";
  children: ReactNode;
  /** The check glyph; defaults on for the accent (correct/solved) tone. */
  showCheck?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-chip px-2 py-0.5 text-xs font-semibold ${
        tone === "accent"
          ? "bg-accent/10 text-accent-dark dark:text-accent-light"
          : "bg-warm/10 text-warm-dark dark:text-warm-light"
      }`}
    >
      {showCheck && <CheckIcon />}
      {children}
    </span>
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
  solved:
    "border-l-2 border-accent/60 bg-accent/5 dark:bg-accent/10 text-accent-dark dark:text-accent-light",
  wrong:
    "border-l-2 border-warm/60 bg-warm/5 dark:bg-warm/10 text-warm-dark dark:text-warm-light",
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

export const secondaryActionClass =
  "rounded-control border border-gray-200 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-900/50 px-4 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 focus-ring transition-colors motion-reduce:transition-none";

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
