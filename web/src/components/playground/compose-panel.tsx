"use client";

import { useEffect, useRef, useState } from "react";
import { Panel } from "@/components/workspace/panel";
import { LabeledSlider } from "@/components/quantum/widget-ui";
import { formatRadians } from "@/components/quantum/format";
import { MAX_QUBITS, type Program } from "@/components/quantum/qsim-dsl";
import { CircuitDiagram } from "@/components/quantum/circuit-diagram";
import { MAX_SHARE_SRC } from "@/lib/circuit-url";
import { benchButtonClass, benchGroupLabelClass } from "./controls";

/**
 * The editor half of the bench: a plain styled textarea over the qsim DSL (the
 * QPU panel's own precedent — Monaco buys nothing for a 15-line language), a
 * gate palette that inserts template instructions at the caret, presets that
 * replace the whole source, and the parse status line. The status line is the
 * ONLY place a parse error appears; the right-hand panels keep rendering the
 * last-good program (the Quirk principle — never blank the readouts).
 */

const PALETTE: {
  group: string;
  chips: { label: string; template: string }[];
  hint?: string;
}[] = [
  { group: "Basis", chips: ["H", "X", "Y", "Z"].map((g) => ({ label: g, template: `${g} 0` })) },
  { group: "Phase", chips: ["S", "T"].map((g) => ({ label: g, template: `${g} 0` })) },
  {
    group: "Rotate",
    chips: ["RX", "RY", "RZ"].map((g) => ({ label: g, template: `${g} 0 theta` })),
    hint: "theta binds to the slider",
  },
  { group: "Entangle", chips: [{ label: "CNOT", template: "CNOT 0 1" }] },
];

const PRESETS: { name: string; src: string }[] = [
  { name: "Superposition", src: "H 0" },
  { name: "Bell pair", src: "# Bell pair\nH 0\nCNOT 0 1" },
  { name: "GHZ-3", src: "# GHZ across three qubits\nH 0\nCNOT 0 1\nCNOT 1 2" },
  { name: "GHZ-4", src: "# GHZ across four qubits\nH 0\nCNOT 0 1\nCNOT 1 2\nCNOT 2 3" },
  { name: "Interference", src: "H 0\nZ 0\nH 0" },
  { name: "Ramsey", src: "H 0\nRZ 0 theta\nH 0" },
];

export function ComposePanel({
  source,
  onSourceChange,
  program,
  parsed,
  showTheta,
  theta,
  onThetaChange,
  shareHash,
  onPreset,
}: {
  source: string;
  onSourceChange: (src: string) => void;
  /** A preset REPLACES the circuit — the bench uses this to end "editing" mode. */
  onPreset?: () => void;
  /** The LAST-GOOD program — the diagram renders from this, never from a broken parse (the Quirk principle). */
  program: Program;
  /** The CURRENT parse (may carry an error) — drives the status line. */
  parsed: Program;
  /** From the LAST-GOOD program, so mid-edit errors don't flash the slider away. */
  showTheta: boolean;
  theta: number;
  onThetaChange: (v: number) => void;
  /** Canonical share fragment for the current source, or null while it doesn't parse. */
  shareHash: string | null;
}) {
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  // Last-known caret, tracked on the textarea's own events. A palette click
  // moves focus to the button before the handler runs, so reading selectionStart
  // at click time would always see a blurred textarea — the ref remembers where
  // the learner actually was. null = untouched -> append at the end.
  const caretRef = useRef<number | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  const rememberCaret = () => {
    const ta = taRef.current;
    if (ta) caretRef.current = ta.selectionEnd;
  };

  const insertInstruction = (template: string) => {
    const pos = Math.min(caretRef.current ?? source.length, source.length);
    const before = source.slice(0, pos);
    const after = source.slice(pos);
    // The instruction always lands on its own line, wherever the caret sits.
    const prefix = before.length === 0 || before.endsWith("\n") ? "" : "\n";
    const suffix = after.length === 0 || after.startsWith("\n") ? "" : "\n";
    onSourceChange(before + prefix + template + suffix + after);
    const caret = pos + prefix.length + template.length;
    caretRef.current = caret;
    // Hand focus back after React commits the new value.
    requestAnimationFrame(() => {
      const ta = taRef.current;
      if (!ta) return;
      ta.focus();
      try {
        ta.setSelectionRange(caret, caret);
      } catch {
        /* selection unavailable */
      }
    });
  };

  const applyPreset = (src: string) => {
    caretRef.current = null; // the old caret means nothing in the new circuit
    onSourceChange(src);
    // Swapping in a preset is a "start fresh" gesture: without this, Save would
    // still OVERWRITE the previously loaded circuit under its old name.
    onPreset?.();
  };

  const copyShareLink = async () => {
    try {
      // Flush the canonical fragment first so the copied URL never lags the
      // 300ms debounce behind the latest keystroke.
      if (shareHash !== null) window.history.replaceState(null, "", `#${shareHash}`);
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — the address bar still holds the link */
    }
  };

  const gateCount = parsed.gates.length;
  const statusText = `${parsed.n} qubit${parsed.n === 1 ? "" : "s"} — ${gateCount} gate${
    gateCount === 1 ? "" : "s"
  }`;

  return (
    <Panel
      title="Compose"
      id="compose"
      headingRight={
        <button
          type="button"
          onClick={() => void copyShareLink()}
          className="rounded px-1.5 py-0.5 text-xs font-medium text-accent-dark hover:underline dark:text-accent-light interactive focus-ring"
        >
          {copied ? "Copied" : "Copy share link"}
        </button>
      }
    >
      <textarea
        ref={taRef}
        value={source}
        onChange={(e) => {
          caretRef.current = e.target.selectionEnd;
          onSourceChange(e.target.value);
        }}
        onSelect={rememberCaret}
        onBlur={rememberCaret}
        aria-label="qsim circuit source"
        spellCheck={false}
        rows={Math.max(10, source.split("\n").length + 1)}
        maxLength={MAX_SHARE_SRC}
        className="w-full resize-y rounded-control border border-gray-200 bg-gray-50 px-3 py-2.5 font-mono text-sm text-gray-800 dark:border-gray-700/50 dark:bg-gray-900/50 dark:text-gray-200 focus-ring"
      />

      <p role="status" className="mt-2 min-h-4 text-xs">
        {parsed.error ? (
          <span className="font-mono text-danger-dark dark:text-danger-light">{parsed.error}</span>
        ) : (
          <span className="tabular-nums text-caption">{statusText}</span>
        )}
      </p>

      <CircuitDiagram program={program} stale={Boolean(parsed.error)} />

      <div className="mt-4 space-y-2">
        {PALETTE.map((row) => (
          <div key={row.group} className="flex flex-wrap items-center gap-1.5">
            <span className={benchGroupLabelClass}>{row.group}</span>
            {row.chips.map((chip) => (
              <button
                key={chip.label}
                type="button"
                onClick={() => insertInstruction(chip.template)}
                aria-label={`Insert ${chip.template}`}
                className="rounded-chip bg-gray-100 px-2 py-1 font-mono text-[11px] text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 interactive focus-ring"
              >
                {chip.label}
              </button>
            ))}
            {row.hint && <span className="text-[10px] text-caption">{row.hint}</span>}
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        <span className={benchGroupLabelClass}>Presets</span>
        {PRESETS.map((p) => (
          <button
            key={p.name}
            type="button"
            onClick={() => applyPreset(p.src)}
            className={benchButtonClass}
          >
            {p.name}
          </button>
        ))}
      </div>

      <p className="mt-3 text-xs text-caption">
        One instruction per line, up to {MAX_QUBITS} qubits — a line starting with # is a
        comment.
      </p>

      {showTheta && (
        <LabeledSlider
          label={<>&#952;</>}
          value={theta}
          min={0}
          max={2 * Math.PI}
          step={Math.PI / 60}
          onChange={onThetaChange}
          ariaLabel="Rotation angle theta in radians"
          ariaValueText={`${theta.toFixed(2)} radians`}
          display={formatRadians(theta)}
          rowClassName="mt-4 flex items-center gap-3"
          labelClassName="font-mono text-sm text-gray-600 dark:text-gray-300"
        />
      )}
    </Panel>
  );
}
