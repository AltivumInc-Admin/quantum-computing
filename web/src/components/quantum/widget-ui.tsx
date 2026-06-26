import { type ReactNode } from "react";
import { basisLabel, type Complex } from "./math";
import type { ParsedGate } from "./qsim-dsl";
import { diracString, toPythonState } from "./state-readout";
import { CopyButton } from "../copy-button";

/**
 * Shared presentational primitives for the circuit-family explorables
 * (CircuitLab, WavefunctionScrubber, CorrelationDemo, BlochBuilder). These were
 * previously copy-pasted verbatim across the widgets; centralizing them keeps
 * the gate-label rules, pill styling, probability-bar geometry, and Dirac/copy
 * readout in one place.
 */

/** Human-readable label for a parsed gate. */
export function gateLabel(g: ParsedGate): string {
  return g.gate === "CNOT"
    ? `CNOT ${g.control}→${g.target}`
    : g.bound
      ? `${g.gate}(θ) q${g.target}`
      : g.theta !== undefined
        ? `${g.gate}(${g.theta.toFixed(2)}) q${g.target}`
        : `${g.gate} q${g.target}`;
}

/** One gate pill. `active` highlights it (e.g. the scrubber's current gate). */
export function GateChip({ label, active = false }: { label: string; active?: boolean }) {
  return (
    <span
      className={`rounded-chip px-2 py-0.5 text-[11px] font-mono transition-colors duration-150 ${
        active
          ? "bg-accent text-white dark:text-gray-950"
          : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
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
  fillClass = "bg-accent",
  labelClassName = "text-gray-500 dark:text-gray-400",
  valueClassName = "text-gray-500 dark:text-gray-400",
}: {
  label: string;
  fraction: number;
  valueText: string;
  fillClass?: string;
  labelClassName?: string;
  valueClassName?: string;
}) {
  const pct = Math.max(0, Math.min(1, fraction)) * 100;
  return (
    <div className="flex items-center gap-2">
      <span className={`w-12 shrink-0 font-mono text-xs ${labelClassName}`}>
        |{label}&#10217;
      </span>
      <span className="relative h-3 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
        <span
          className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-200 motion-reduce:transition-none ${fillClass}`}
          style={{ width: `${pct.toFixed(2)}%` }}
        />
      </span>
      <span className={`w-12 shrink-0 text-right font-mono text-xs tabular-nums ${valueClassName}`}>
        {valueText}
      </span>
    </div>
  );
}

/** Probability bars: one row per basis state (|label⟩, accent fill, percentage). */
export function ProbBars({
  probs,
  n,
  labelFor = basisLabel,
}: {
  probs: number[];
  n: number;
  labelFor?: (idx: number, n: number) => string;
}) {
  return (
    <div className="space-y-1.5">
      {probs.map((p, idx) => (
        <Bar
          key={idx}
          label={labelFor(idx, n)}
          fraction={p}
          valueText={`${(p * 100).toFixed(1)}%`}
        />
      ))}
    </div>
  );
}

/** Dirac state line + copy-as-notation / copy-as-Python buttons. */
export function StateReadout({ state, n }: { state: Complex[]; n: number }) {
  return (
    <div className="mt-4 flex items-start gap-2">
      <p className="min-w-0 flex-1 break-words font-mono text-sm text-gray-700 dark:text-gray-200">
        <span className="text-caption">|&#968;&#10217; = </span>
        <span className="text-accent dark:text-accent-light">{diracString(state, n)}</span>
      </p>
      <div className="flex shrink-0 items-center gap-1">
        <CopyButton getText={() => diracString(state, n)} label="Copy state notation" />
        <span className="flex items-center">
          <CopyButton getText={() => toPythonState(state)} label="Copy state as runnable Python" />
          <span className="-ml-1 rounded bg-accent/10 px-1 py-0.5 font-mono text-[9px] text-accent-dark dark:text-accent-light">py</span>
        </span>
      </div>
    </div>
  );
}

export const cardShell =
  "rounded-card border border-gray-200/80 dark:border-gray-700/40 " +
  "bg-white dark:bg-[color-mix(in_oklab,var(--surface-1)_60%,transparent)] " +
  "shadow-(--shadow-resting)";

export function EyebrowLabel({
  children,
  as: Tag = "span",
  id,
}: {
  children: ReactNode;
  as?: "span" | "h3";
  id?: string;
}) {
  return (
    <Tag
      id={id}
      className="text-[10px] font-semibold uppercase tracking-widest text-accent dark:text-accent-light"
    >
      {children}
    </Tag>
  );
}

export function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-chip bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[11px] font-mono text-gray-600 dark:text-gray-300">
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
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 dark:border-gray-800 px-4 py-2">
        <EyebrowLabel as={eyebrowAs} id={eyebrowId}>{eyebrow}</EyebrowLabel>
        {headerRight}
      </div>
    ) : (
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 dark:border-gray-800 px-4 py-2">
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
      <p className="font-mono text-sm text-gray-500 dark:text-gray-400">
        {`${label} error: ${message ?? ""}`}
      </p>
    </div>
  );
}

/**
 * Polite screen-reader live region for announcing a recomputed teaching result
 * (a verdict, probability, energy, coefficient, ...) when a select / Run /
 * Optimize / toggle changes it. Visually hidden (sr-only); the node stays
 * mounted so aria-live fires on text change. Keep the announcement to one
 * concise line and pass an empty string when there is nothing to announce
 * (e.g. before the first Run). Polite, never assertive, to avoid drag-spam.
 * Mirrors correlation-demo.tsx / metrics-explorer.tsx / job-explorer.tsx.
 */
export function LiveStatus({ children }: { children: ReactNode }) {
  return (
    <p className="sr-only" role="status" aria-live="polite">
      {children}
    </p>
  );
}
