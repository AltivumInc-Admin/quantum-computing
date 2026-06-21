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
      : g.angle !== undefined
        ? `${g.gate}(${g.angle.toFixed(2)}) q${g.target}`
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

/** Probability bars: one row per basis state (|label⟩, accent fill, percentage). */
export function ProbBars({ probs, n }: { probs: number[]; n: number }) {
  return (
    <div className="space-y-1.5">
      {probs.map((p, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <span className="w-12 shrink-0 font-mono text-xs text-gray-500 dark:text-gray-400">
            |{basisLabel(idx, n)}&#10217;
          </span>
          <span className="relative h-3 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-accent transition-[width] duration-200"
              style={{ width: `${(p * 100).toFixed(2)}%` }}
            />
          </span>
          <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums text-gray-500 dark:text-gray-400">
            {(p * 100).toFixed(1)}%
          </span>
        </div>
      ))}
    </div>
  );
}

/** Dirac state line + copy-as-notation / copy-as-Python buttons. */
export function StateReadout({ state, n }: { state: Complex[]; n: number }) {
  return (
    <div className="mt-4 flex items-start gap-2">
      <p className="min-w-0 flex-1 break-words font-mono text-sm text-gray-700 dark:text-gray-200">
        <span className="text-gray-400 dark:text-gray-500">|&#968;&#10217; = </span>
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

/**
 * Standard parse/validation error card for the explorables. The card markup was
 * previously copy-pasted into ~17 widgets; only the `label` prefix and vertical
 * margin (`my-6` vs `my-8`) differed. Renders "<label> error: <message>".
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
    <div
      className={`not-prose ${className} rounded-card border border-gray-200/80 dark:border-gray-700/40 bg-white dark:bg-[color-mix(in_oklab,var(--surface-1)_60%,transparent)] shadow-(--shadow-resting) px-4 py-3`}
    >
      <p className="font-mono text-sm text-gray-500 dark:text-gray-400">
        {`${label} error: ${message ?? ""}`}
      </p>
    </div>
  );
}
