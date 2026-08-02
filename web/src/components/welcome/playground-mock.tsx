"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CircuitDiagram } from "@/components/quantum/circuit-diagram";
import { parseProgram, opsFor } from "@/components/quantum/qsim-dsl";
import { basisLabel, probabilities, simulate } from "@/components/quantum/math";
import { formatPercent } from "@/components/quantum/format";
import { usePrefersReducedMotion } from "@/components/quantum/use-display-caps";
import { useLocale } from "@/i18n";

/**
 * The playground band's visual: the product demonstrating itself. A qsim
 * program types itself line by line, and after each committed line the real
 * parser, the real qcsim-parity kernel, and the real CircuitDiagram renderer
 * recompute the diagram and the measurement probabilities — exactly what the
 * band copy promises the playground does. No number here is authored; every
 * value is simulate()'s output for the circuit on screen.
 *
 * Decorative (aria-hidden + inert — the embedded CircuitDiagram is normally
 * focusable, and a focus stop inside hidden decoration would strand keyboard
 * users). The band copy beside it carries the facts. SSR and reduced-motion
 * render the finished final frame; the typing loop only runs on a motion-ok
 * client, and only while the card is on screen in a visible tab.
 */

const SOURCE_LINES = ["H 0", "CNOT 0 1", "RY 1 0.79"];

const TYPE_MS = 55; // per character
const COMMIT_HOLD_MS = 850; // pause after a line lands, letting the redraw read
const FINAL_HOLD_MS = 5200; // dwell on the finished circuit before looping
const RESTART_FADE_MS = 350;

interface Step {
  program: ReturnType<typeof parseProgram>;
  probs: number[];
  n: number;
}

/** One entry per committed-line count, 1..SOURCE_LINES.length. */
function buildSteps(): Step[] {
  return SOURCE_LINES.map((_, i) => {
    const source = SOURCE_LINES.slice(0, i + 1).join("\n");
    const program = parseProgram(source);
    const state = simulate(opsFor(program, 0), program.n);
    return { program, probs: probabilities(state), n: program.n };
  });
}

function ProbRow({
  label,
  pct,
  peak,
  active,
}: {
  label: string;
  pct: number;
  peak: boolean;
  /** False for a reserved slot whose outcome doesn't exist yet (fewer qubits
      committed) — it keeps the row's space but stays completely quiet: no
      label, no fill, no "0.0%" for a measurement nobody could take. */
  active: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-12 shrink-0 font-mono text-[11px] text-gray-400 dark:text-gray-300">
        {active ? label : ""}
      </span>
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
        <div
          className="bar-fill absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-out"
          style={{ width: `${active ? pct : 0}%` }}
        />
      </div>
      <span
        className={`w-12 shrink-0 text-right font-mono text-[11px] tabular-nums ${
          peak ? "text-white/90" : "text-gray-400 dark:text-gray-300"
        }`}
      >
        {active ? formatPercent(pct) : ""}
      </span>
    </div>
  );
}

export function PlaygroundMock() {
  const { t } = useLocale();
  const steps = useMemo(() => buildSteps(), []);
  const final = steps[steps.length - 1];

  // committed = lines locked in (drives diagram + bars); typed = the partial
  // line under the caret. The initial state IS the final frame.
  const [committed, setCommitted] = useState(steps.length);
  const [typed, setTyped] = useState("");
  const [fading, setFading] = useState(false);
  // Bumped on every loop reset and used as a key on the bars block: fresh DOM
  // means the width transition can never "ghost" down from the previous
  // cycle's values behind the fade.
  const [cycle, setCycle] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  // Written by the observers, read by the loop's sleeps: the loop free-runs
  // while true and parks (checking twice a second) while hidden.
  const activeRef = useRef(false);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const el = rootRef.current;
    if (!el || reduced) return;

    let cancelled = false;
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms));
    const waitUntilActive = async () => {
      while (!cancelled && (!activeRef.current || document.hidden)) {
        await sleep(500);
      }
    };

    const io =
      typeof IntersectionObserver === "undefined"
        ? undefined
        : new IntersectionObserver(
            (entries) => {
              activeRef.current = entries.some((e) => e.isIntersecting);
            },
            { threshold: 0.3 },
          );
    if (io) io.observe(el);
    else activeRef.current = true;

    const loop = async () => {
      // First cycle only starts once the card is actually watched.
      await waitUntilActive();
      while (!cancelled) {
        setFading(true);
        await sleep(RESTART_FADE_MS);
        if (cancelled) return;
        setCommitted(0);
        setTyped("");
        setCycle((c) => c + 1);
        setFading(false);
        for (let line = 0; line < SOURCE_LINES.length; line++) {
          const text = SOURCE_LINES[line];
          for (let c = 1; c <= text.length; c++) {
            await waitUntilActive();
            if (cancelled) return;
            setTyped(text.slice(0, c));
            await sleep(TYPE_MS);
          }
          if (cancelled) return;
          setTyped("");
          setCommitted(line + 1);
          await sleep(COMMIT_HOLD_MS);
        }
        await sleep(FINAL_HOLD_MS);
        await waitUntilActive();
      }
    };
    void loop();

    return () => {
      cancelled = true;
      io?.disconnect();
    };
  }, [steps, reduced]);

  // Reduced motion derives the parked, finished frame at render — including a
  // live preference flip mid-loop — with no state writes in the effect.
  const shownCommitted = reduced ? steps.length : committed;
  const shownFading = reduced ? false : fading;
  const step = shownCommitted > 0 ? steps[shownCommitted - 1] : undefined;
  const peak = step ? Math.max(...step.probs) : 0;

  return (
    // A self-dark island like the hero: the embedded diagram and bars resolve
    // their theme tokens to the dark values in BOTH app themes, matching the
    // pinned-smoke card chrome the band visuals share.
    <div
      ref={rootRef}
      aria-hidden="true"
      inert
      className="dark rounded-card overflow-hidden border border-gray-200/60 dark:border-white/[0.08] bg-smoke shadow-(--shadow-resting) p-6 sm:p-8"
    >
      <div className="mb-5 flex items-center justify-between gap-4">
        <p className="flex items-center gap-2 text-xs font-semibold tracking-widest uppercase text-accent-light">
          <span className="h-1.5 w-1.5 rounded-full bg-accent animate-signal" />
          {t("home.playgroundMockTitle")}
        </p>
        <span className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-gray-300">
          qsim
        </span>
      </div>

      <div
        className={`transition-opacity duration-300 ${shownFading ? "opacity-0" : "opacity-100"}`}
      >
        {/* Editor: three fixed rows so the card never changes height mid-loop. */}
        <div className="rounded-control border border-white/10 bg-black/30 px-4 py-3 font-mono text-[13px] leading-6">
          {SOURCE_LINES.map((text, i) => {
            const isDone = i < shownCommitted;
            const isTyping = !reduced && i === shownCommitted;
            const shown = isDone ? text : isTyping ? typed : "";
            const [gate, ...args] = shown.split(" ");
            return (
              <div key={text} className="whitespace-pre">
                {shown ? (
                  <>
                    <span className="text-accent-light">{gate}</span>
                    <span className="text-gray-200">
                      {args.length > 0 ? ` ${args.join(" ")}` : ""}
                    </span>
                  </>
                ) : null}
                {isTyping && (
                  <span className="animate-caret ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] bg-accent-light" />
                )}
              </div>
            );
          })}
        </div>

        {/* The diagram redraw — the height of the finished two-qubit circuit
            is reserved up front so wire growth never reflows the band. */}
        <div className="flex min-h-[170px] flex-col justify-center">
          {step && <CircuitDiagram program={step.program} stale={false} />}
        </div>

        <div className="mt-1">
          <p className="mb-2.5 font-mono text-[10px] uppercase tracking-[0.2em] text-gray-400 dark:text-gray-300">
            {t("home.playgroundMockProbs")}
          </p>
          {/* Four fixed slots (the final frame's outcome count). */}
          <div key={cycle} className="space-y-2">
            {Array.from({ length: 1 << final.n }).map((_, i) => {
              const active = Boolean(step && i < step.probs.length);
              const pct = active ? step!.probs[i] * 100 : 0;
              return (
                <ProbRow
                  key={i}
                  label={active ? basisLabel(i, step!.n) : ""}
                  pct={pct}
                  peak={active && step!.probs[i] === peak && pct > 0}
                  active={active}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
