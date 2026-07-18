"use client";

import Link from "next/link";
import { Panel } from "./panel";
import { useWorkspaceBudget } from "./budget-provider";
import type { WorkspaceModel, ReachRung } from "@/lib/workspace";
import { MASTERY_TIERS, CONSISTENCY_TIERS, HARDWARE_TIERS } from "@/lib/credentials";
import {
  IQM_TASK_MICROS,
  IQM_SHOT_MICROS,
  MAX_SHOTS,
  costMicros,
  usd,
  tierReachable,
  type HardwareReach,
} from "@/lib/qpu-budget";
import type { Budget } from "@/lib/qpu-client";

/**
 * Z7 — WITHIN REACH. The nearest UNEARNED rung of each track and its exact distance —
 * an OBJECTIVE (a distance to a named credential rung), never a reward: no medal art,
 * no "Almost there!", no urgency. Mastery and consistency are pure local reads and are
 * never absent; the hardware rung is present only when the QPU surface is configured,
 * and — carrying the NaN guard — reads "hardware record unavailable" rather than a
 * false foreclosure when the server did not report the medal counters.
 */
export function WithinReach({
  reachMastery,
  reachConsistency,
  sectionsTotal,
}: Pick<WorkspaceModel, "reachMastery" | "reachConsistency"> & { sectionsTotal: number }) {
  const { status, budget } = useWorkspaceBudget();
  const showHardware = status !== "unconfigured";
  // Single-sourced total: one medal per module + every tier. Never a hardcoded 18.
  const totalCredentials =
    sectionsTotal + MASTERY_TIERS.length + CONSISTENCY_TIERS.length + HARDWARE_TIERS.length;

  return (
    <Panel title="Within reach" id="ws-reach" as="aside" bodyClassName="px-5 pb-4 pt-2">
      <div className="flex flex-col">
        <Rung group="Mastery" rung={reachMastery} />
        <Rung group="Consistency" rung={reachConsistency} />
        {showHardware && <HardwareRung status={status} budget={budget} />}
      </div>
      <Link
        href="/credentials"
        className="mt-3 block border-t border-(--bd) pt-3 text-xs font-medium text-accent-dark dark:text-accent-light interactive focus-ring rounded-control"
      >
        All {totalCredentials} credentials →
      </Link>
    </Panel>
  );
}

function RungShell({ group, children }: { group: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-(--bd) py-3 first:border-t-0">
      <p className="text-sm font-semibold text-(--ink)">{group}</p>
      {children}
    </div>
  );
}

function Bar({ current, target }: { current: number; target: number }) {
  const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
  return (
    <div className="mt-2 h-0.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-white/10">
      <div className="h-full rounded-full bg-accent-dark dark:bg-accent" style={{ width: `${pct}%` }} />
    </div>
  );
}

function Rung({ group, rung }: { group: string; rung: ReachRung | null }) {
  if (!rung) {
    return (
      <RungShell group={group}>
        <p className="mt-1 text-xs text-caption">All {group.toLowerCase()} credentials earned.</p>
      </RungShell>
    );
  }
  return (
    <RungShell group={group}>
      <div className="mt-0.5 flex items-baseline justify-between gap-2">
        <span className="text-sm text-(--mut)">{rung.title}</span>
        <span className="shrink-0 text-xs tabular-nums text-caption">
          {rung.current} of {rung.target} {rung.unit}
        </span>
      </div>
      <Bar current={rung.current} target={rung.target} />
      <p className="mt-1.5 text-xs tabular-nums text-caption">{rung.distance} to go</p>
    </RungShell>
  );
}

/**
 * The cheapest cost to reach a single hardware tier from where the learner stands,
 * derived entirely from the qpu-budget money constants (never hand-typed). A runs tier
 * needs its remaining runs (cheapest at one shot each); a shots tier needs its
 * remaining shots packed into as few runs as possible.
 */
function tierPlan(
  tier: { n: number; metric: "runs" | "shots" },
  reach: HardwareReach,
): { distance: number; unit: string; micros: number; current: number } {
  if (tier.metric === "runs") {
    const distance = tier.n - reach.completedRuns;
    return { distance, unit: distance === 1 ? "run" : "runs", micros: distance * costMicros(1), current: reach.completedRuns };
  }
  const distance = tier.n - reach.completedShots;
  const runs = Math.max(1, Math.ceil(distance / MAX_SHOTS));
  return {
    distance,
    unit: "shots",
    micros: IQM_TASK_MICROS * runs + IQM_SHOT_MICROS * distance,
    current: reach.completedShots,
  };
}

function HardwareRung({ status, budget }: { status: string; budget: Budget | null }) {
  if (status === "loading") {
    return (
      <RungShell group="Hardware">
        <p className="mt-1 text-xs text-caption">Checking your hardware record…</p>
      </RungShell>
    );
  }
  // The NaN guard: null counters (an older Lambda) or a failed fetch → unknown, never a
  // foreclosure. Reachability is unknowable, and an unknown is never dressed as one.
  if (status !== "ready" || !budget || budget.completedRuns === null || budget.completedShots === null) {
    return (
      <RungShell group="Hardware">
        <p role="status" className="mt-1 text-xs text-warm-dark dark:text-warm-light">
          Hardware record unavailable.
        </p>
      </RungShell>
    );
  }

  const reach: HardwareReach = {
    completedRuns: budget.completedRuns,
    completedShots: budget.completedShots,
    remainingMicros: budget.remainingMicros,
  };
  const value = (t: { n: number; metric: "runs" | "shots" }) =>
    t.metric === "shots" ? reach.completedShots : reach.completedRuns;
  const next = HARDWARE_TIERS.find((t) => value(t) < t.n);

  if (!next) {
    return (
      <RungShell group="Hardware">
        <p className="mt-1 text-xs text-caption">All hardware credentials earned.</p>
      </RungShell>
    );
  }

  const plan = tierPlan(next, reach);
  const reachable = tierReachable(next, reach);
  return (
    <RungShell group="Hardware">
      <div className="mt-0.5 flex items-baseline justify-between gap-2">
        <span className="text-sm text-(--mut)">{next.title}</span>
        <span className="shrink-0 text-xs tabular-nums text-caption">
          {plan.current} of {next.n.toLocaleString("en-US")} {plan.unit}
        </span>
      </div>
      <Bar current={plan.current} target={next.n} />
      <p className="mt-1.5 text-xs tabular-nums text-caption">
        {plan.distance.toLocaleString("en-US")} {plan.unit} to go
        {reachable ? (
          <>
            {" · "}
            {usd(plan.micros)} ·{" "}
            <span className="font-medium text-accent-dark dark:text-accent-light">fits</span>
          </>
        ) : (
          // Not "Locked" — a word that promises attainability the finite allowance denies.
          <span className="font-medium text-warm-dark dark:text-warm-light"> · out of allowance</span>
        )}
      </p>
    </RungShell>
  );
}
