import { basisLabel, type Complex } from "./math";

// Shared formatting for the Dirac-notation state string, used by both the
// inline CircuitLab and the WavefunctionScrubber so the two never disagree on
// how amplitudes are rounded or which terms are shown.

// One epsilon shared by the visibility filter and the formatter, so they can
// never disagree: a term is shown iff at least one component survives the snap,
// which guarantees no phantom "0.00" term and no shown term whose magnitude was
// already rounded away.
const DISPLAY_EPS = 5e-3;

export function formatAmplitude(c: Complex): string {
  const [re, im] = c;
  const r = Math.abs(re) < DISPLAY_EPS ? 0 : re;
  const i = Math.abs(im) < DISPLAY_EPS ? 0 : im;
  if (i === 0) return r.toFixed(2);
  if (r === 0) return `${i.toFixed(2)}i`;
  return `(${r.toFixed(2)}${i >= 0 ? "+" : "-"}${Math.abs(i).toFixed(2)}i)`;
}

export function diracString(state: Complex[], n: number): string {
  const shown = state
    .map((amp, idx) => ({ amp, idx }))
    .filter(({ amp }) => Math.abs(amp[0]) >= DISPLAY_EPS || Math.abs(amp[1]) >= DISPLAY_EPS);
  if (shown.length === 0) return "0";
  let out = "";
  shown.forEach(({ amp, idx }, i) => {
    const formatted = formatAmplitude(amp);
    // formatAmplitude only emits a bare leading "-" for negative real-only or
    // negative imaginary-only amplitudes; the compound "(r±im i)" form is
    // paren-wrapped, so it is always treated as positive here.
    const negative = formatted.startsWith("-");
    const magnitude = negative ? formatted.slice(1) : formatted;
    const term = `${magnitude}|${basisLabel(idx, n)}⟩`;
    if (i === 0) out = negative ? `-${term}` : term;
    else out += `${negative ? " - " : " + "}${term}`;
  });
  return out;
}

// A runnable NumPy complex-array literal for the "Copy as Python" action, so a
// learner can paste the state straight into a notebook. Uses Python's `j` (not
// the display notation's `i`) and snaps numerical noise to exact 0.
export function toPythonState(state: Complex[]): string {
  const eps = 1e-6;
  const fmt = (n: number) => parseFloat(n.toFixed(6)).toString();
  const parts = state.map(([re, im]) => {
    const r = Math.abs(re) < eps ? 0 : re;
    const i = Math.abs(im) < eps ? 0 : im;
    if (r === 0 && i === 0) return "0j";
    if (i === 0) return `${fmt(r)}+0j`;
    if (r === 0) return `${fmt(i)}j`;
    return `(${fmt(r)}${i >= 0 ? "+" : "-"}${fmt(Math.abs(i))}j)`;
  });
  return `np.array([${parts.join(", ")}])`;
}
