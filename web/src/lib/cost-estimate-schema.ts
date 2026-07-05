// Parse + validate the JSON inside a ```qcostestimate fenced block.
//
// A cost-estimate Rep asks the learner to price a hardware run in their head —
// commit to a dollar figure BEFORE the reveal — and grades the commit against
// the real pricing table (cost.ts, itself parity-locked to lib/utils/cost.py).
// Mirrors predict-schema.ts.

import { PRICING, isPerShot, type Provider } from "@/components/quantum/cost";

export interface CostEstimateSpec {
  id: string;
  prompt: string;
  /** A per-shot QPU provider — the Rep drills the task-fee + per-shot model. */
  provider: Provider;
  shots: number;
  tasks: number;
  hint?: string;
}

export interface ParsedCostEstimate {
  spec?: CostEstimateSpec;
  error?: string;
}

// The floor clears the bottom collision band: on the cheapest per-shot rate
// (Rigetti, $0.00035) the true cost stays within a display-cent of the bare
// task fee up to 14 shots, so a spec at the old floor of 10 parsed cleanly and
// then failed the grader's collision guard. 15 is the first shots value valid
// on every per-shot provider (mid-range collisions — e.g. IonQ at exactly 30 —
// are still caught loudly by the grader). The ceiling keeps the Rep head-math.
export const MIN_SHOTS = 15;
export const MAX_SHOTS = 1_000_000;
export const MAX_TASKS = 1000;

export function parseCostEstimate(source: string): ParsedCostEstimate {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(source);
  } catch (e) {
    return { error: `invalid cost-estimate JSON: ${(e as Error).message}` };
  }

  // The id is this Rep's localStorage schedule key — stable and author-assigned.
  if (typeof data.id !== "string" || !data.id.trim()) {
    return { error: 'cost-estimate needs a non-empty string "id" (its stable storage key)' };
  }
  if (typeof data.prompt !== "string" || !data.prompt.trim()) {
    return { error: 'cost-estimate needs a non-empty "prompt" string' };
  }
  const provider = data.provider as Provider;
  if (typeof provider !== "string" || !(provider in PRICING)) {
    return { error: `cost-estimate "provider" must be one of: ${Object.keys(PRICING).join(", ")}` };
  }
  if (!isPerShot(provider)) {
    return { error: 'cost-estimate "provider" must be a per-shot QPU (the Rep drills the task+shot model)' };
  }
  if (
    typeof data.shots !== "number" ||
    !Number.isInteger(data.shots) ||
    data.shots < MIN_SHOTS ||
    data.shots > MAX_SHOTS
  ) {
    return { error: `cost-estimate "shots" must be an integer in ${MIN_SHOTS}..${MAX_SHOTS}` };
  }
  if (
    data.tasks != null &&
    (typeof data.tasks !== "number" || !Number.isInteger(data.tasks) || data.tasks < 1 || data.tasks > MAX_TASKS)
  ) {
    return { error: `cost-estimate "tasks" must be an integer in 1..${MAX_TASKS}` };
  }

  return {
    spec: {
      id: data.id,
      prompt: data.prompt,
      provider,
      shots: data.shots,
      tasks: typeof data.tasks === "number" ? data.tasks : 1,
      hint: typeof data.hint === "string" ? data.hint : undefined,
    },
  };
}
