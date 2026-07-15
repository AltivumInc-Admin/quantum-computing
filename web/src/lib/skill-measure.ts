/**
 * Personal-best skill measurements, captured at grade time. v1 tracks the
 * SHORTEST solution (fewest gates) a learner has found for a build-a-circuit
 * Rep — a real, crammable-resistant efficiency signal and the roadmap's named
 * "shortest-circuit" measure. Stored per Rep under `qc:measure:<cardId>`.
 *
 * Unlike the Runbook's set-once day flags, a personal best is a NUMERIC minimum,
 * so it cannot ride the generic lexicographic merge (which would pick the LARGER
 * gate count). progress-merge.ts carries a dedicated `qc:measure:*` rule that
 * keeps the better value; betterMeasurement below is that same pure comparison,
 * shared so the widget and the merge can never disagree.
 *
 * Storage is guarded like the sibling stores; recordBest does not dispatch the
 * qc-progress event — its only caller (a widget on solve) already fires one.
 */

const MEASURE_PREFIX = "qc:measure:";
const measureKey = (id: string) => `${MEASURE_PREFIX}${id}`;

export interface Measurement {
  /**
   * Fewest gates the learner has used to solve this Rep (lower is better). A
   * first-order complexity proxy: every gate counts equally, so it does NOT
   * distinguish a two-qubit CNOT from a single-qubit H. Good enough to reward
   * "don't add redundant gates"; a hardware-fidelity-weighted metric is a
   * later refinement. (Free-form tier:"py" solves carry no gate count and are
   * simply not measured.)
   */
  gates: number;
}

function isValidMeasurement(x: unknown): x is Measurement {
  return typeof x === "object" && x !== null && Number.isFinite((x as Measurement).gates);
}

/** The better of two measurements — fewer gates wins; ties are stable. */
export function betterMeasurement(a: Measurement, b: Measurement): Measurement {
  if (a.gates !== b.gates) return a.gates < b.gates ? a : b;
  return a; // tie — deterministic, both are equal on the tracked metric
}

export function getBest(id: string): Measurement | null {
  try {
    const raw = localStorage.getItem(measureKey(id));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isValidMeasurement(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Every stored personal-best measurement, keyed by its card id — a `qc:measure:*`
 * prefix scan, the same shape getAllCardIds uses. The Records zone titles each with
 * getCardContent(id).prompt and shows the shortest solutions the learner has found.
 * Guarded like its siblings; returns [] when storage is unavailable.
 */
export function getAllMeasurements(): { id: string; gates: number }[] {
  try {
    const out: { id: string; gates: number }[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(MEASURE_PREFIX)) {
        const m = getBest(k.slice(MEASURE_PREFIX.length));
        if (m) out.push({ id: k.slice(MEASURE_PREFIX.length), gates: m.gates });
      }
    }
    return out;
  } catch {
    return [];
  }
}

/** Record a solve's measurement, keeping only the better value. */
export function recordBest(id: string, m: Measurement): void {
  try {
    const cur = getBest(id);
    const best = cur ? betterMeasurement(cur, m) : m;
    if (!cur || best.gates !== cur.gates) {
      localStorage.setItem(measureKey(id), JSON.stringify(best));
    }
  } catch {
    /* storage unavailable — the best simply isn't remembered */
  }
}
