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
import { useLocale, localeCode } from "@/i18n";

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
  const { t } = useLocale();
  const { status, budget } = useWorkspaceBudget();
  const showHardware = status !== "unconfigured";
  // Single-sourced total: one medal per module + every tier. Never a hardcoded 18.
  const totalCredentials =
    sectionsTotal + MASTERY_TIERS.length + CONSISTENCY_TIERS.length + HARDWARE_TIERS.length;

  return (
    <Panel title={t("workspaceUi.withinReach")} id="ws-reach" as="aside" bodyClassName="px-5 pb-4 pt-2">
      <div className="flex flex-col">
        <Rung track="mastery" rung={reachMastery} />
        <Rung track="consistency" rung={reachConsistency} />
        {showHardware && <HardwareRung status={status} budget={budget} />}
      </div>
      <Link
        href="/credentials"
        className="mt-3 block border-t border-(--bd) pt-3 text-xs font-medium text-accent-dark dark:text-accent-light interactive focus-ring rounded-control"
      >
        {t("workspaceUi.allCredentialsLink", { n: totalCredentials })}
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

/**
 * The two purely-local tracks, each with the dictionary keys its readout needs.
 * `unitKey` is a plain phrase for mastery and a plural pair for consistency
 * (reused from the Runbook rather than duplicated), so `unitPlural` says which.
 */
const TRACKS = {
  mastery: {
    labelKey: "workspaceUi.mastery",
    unitKey: "workspaceUi.unitInRetention",
    unitPlural: false,
  },
  consistency: {
    labelKey: "workspaceUi.consistency",
    unitKey: "runbookUi.week",
    unitPlural: true,
  },
} as const;

function Rung({ track, rung }: { track: keyof typeof TRACKS; rung: ReachRung | null }) {
  const { t, locale } = useLocale();
  const { labelKey, unitKey, unitPlural } = TRACKS[track];
  const label = t(labelKey);
  const num = (n: number) => n.toLocaleString(localeCode(locale));

  if (!rung) {
    // "All {{group}} credentials earned." takes a BARE lowercase noun in both
    // dictionaries: "All mastery credentials earned." / "Todas las credenciales de
    // dominio obtenidas." Spanish's "de + bare noun" complement takes no article,
    // so lowercasing the translated group noun is grammatical here — a locale that
    // needed an article or a different case would get per-track keys instead of a
    // transform. toLocaleLowerCase keeps the casing rules with the locale rather
    // than the runtime default.
    return (
      <RungShell group={label}>
        <p className="mt-1 text-xs text-caption">
          {t("workspaceUi.allCredentials", {
            group: label.toLocaleLowerCase(localeCode(locale)),
          })}
        </p>
      </RungShell>
    );
  }
  // The unit noun agrees with the TARGET, the number it actually sits beside in
  // "{current} of {target} {unit}" — "1 of 4 weeks", not the "1 of 4 week" that
  // came out of workspace.ts agreeing the noun with the learner's current value
  // instead. `rung.unit` still carries that already-resolved English noun and is
  // deliberately unread here: workspace.ts builds the rung with no locale in hand,
  // so the render site owns the wording.
  const unit = unitPlural ? t(unitKey, {}, rung.target) : t(unitKey);
  return (
    <RungShell group={label}>
      <div className="mt-0.5 flex items-baseline justify-between gap-2">
        {/* The tier's DISPLAY title, derived from its threshold — `rung.title` is
            the tier's stable English identity, not a label (see credentials.ts). */}
        <span className="text-sm text-(--mut)">
          {t(`credentialsUi.tiers.${track}.${rung.target}`)}
        </span>
        <span className="shrink-0 text-xs tabular-nums text-caption">
          {t("workspaceUi.rungProgress", {
            current: num(rung.current),
            target: num(rung.target),
            unit,
          })}
        </span>
      </div>
      <Bar current={rung.current} target={rung.target} />
      <p className="mt-1.5 text-xs tabular-nums text-caption">
        {/* The DISTANCE is also the plural count: Spanish inflects the verb of this
            very sentence ("falta 1" / "faltan 3"), so omitting the third argument
            left every track saying "faltan 1" at its last step. `num()` groups the
            digits for display; the raw number selects the form. */}
        {t("workspaceUi.distanceToGo", { distance: num(rung.distance) }, rung.distance)}
      </p>
    </RungShell>
  );
}

/**
 * The cheapest cost to reach a single hardware tier from where the learner stands,
 * derived entirely from the qpu-budget money constants (never hand-typed). A runs tier
 * needs its remaining runs (cheapest at one shot each); a shots tier needs its
 * remaining shots packed into as few runs as possible.
 *
 * The unit noun is returned as a KEY, not a word: the plan feeds two readouts whose
 * nouns agree with two different numbers (the target in "N of M units", the distance
 * in "N units to go"), and one baked-in English suffix could only ever match one of
 * them. Spanish agreement makes that mismatch visible.
 */
function tierPlan(
  tier: { n: number; metric: "runs" | "shots" },
  reach: HardwareReach,
): { distance: number; unitKey: string; micros: number; current: number } {
  if (tier.metric === "runs") {
    const distance = tier.n - reach.completedRuns;
    return {
      distance,
      unitKey: "workspaceUi.unitRun",
      micros: distance * costMicros(1),
      current: reach.completedRuns,
    };
  }
  const distance = tier.n - reach.completedShots;
  const runs = Math.max(1, Math.ceil(distance / MAX_SHOTS));
  return {
    distance,
    unitKey: "workspaceUi.unitShot",
    micros: IQM_TASK_MICROS * runs + IQM_SHOT_MICROS * distance,
    current: reach.completedShots,
  };
}

function HardwareRung({ status, budget }: { status: string; budget: Budget | null }) {
  const { t, locale } = useLocale();
  const num = (n: number) => n.toLocaleString(localeCode(locale));
  const group = t("workspaceUi.hardware");

  if (status === "loading") {
    return (
      <RungShell group={group}>
        <p className="mt-1 text-xs text-caption">{t("workspaceUi.checkingHardware")}</p>
      </RungShell>
    );
  }
  // A throttle is not an outage, and it is the one unavailable cause with a useful
  // instruction attached. Checked BEFORE the guard below, whose single sentence
  // ("Hardware record unavailable.") reads as a broken service and told a throttled
  // learner to reload — the thing that cannot work while a rate limit is in force.
  // budget-provider.tsx separates this status for exactly this branch; the same 429
  // says the same thing on the submit panel and the credentials wall, so one throttle
  // no longer produces three diagnoses on one page.
  if (status === "throttled") {
    return (
      <RungShell group={group}>
        <p role="status" className="mt-1 text-xs text-warm-dark dark:text-warm-light">
          {t("qpuUi.rateLimitedService")}
        </p>
      </RungShell>
    );
  }
  // The NaN guard: null counters (an older Lambda) or a failed fetch → unknown, never a
  // foreclosure. Reachability is unknowable, and an unknown is never dressed as one.
  if (status !== "ready" || !budget || budget.completedRuns === null || budget.completedShots === null) {
    return (
      <RungShell group={group}>
        <p role="status" className="mt-1 text-xs text-warm-dark dark:text-warm-light">
          {t("workspaceUi.hardwareUnavailable")}
        </p>
      </RungShell>
    );
  }

  const reach: HardwareReach = {
    completedRuns: budget.completedRuns,
    completedShots: budget.completedShots,
    remainingMicros: budget.remainingMicros,
  };
  // Renamed off `t` — the translator now owns that name in this scope.
  const value = (tier: { n: number; metric: "runs" | "shots" }) =>
    tier.metric === "shots" ? reach.completedShots : reach.completedRuns;
  const next = HARDWARE_TIERS.find((tier) => value(tier) < tier.n);

  if (!next) {
    return (
      <RungShell group={group}>
        <p className="mt-1 text-xs text-caption">{t("workspaceUi.allHardware")}</p>
      </RungShell>
    );
  }

  const plan = tierPlan(next, reach);
  const reachable = tierReachable(next, reach);
  return (
    <RungShell group={group}>
      <div className="mt-0.5 flex items-baseline justify-between gap-2">
        <span className="text-sm text-(--mut)">
          {t(`credentialsUi.tiers.hardware.${next.metric}.${next.n}`)}
        </span>
        <span className="shrink-0 text-xs tabular-nums text-caption">
          {t("workspaceUi.rungProgress", {
            current: num(plan.current),
            target: num(next.n),
            unit: t(plan.unitKey, {}, next.n),
          })}
        </span>
      </div>
      <Bar current={plan.current} target={next.n} />
      <p className="mt-1.5 text-xs tabular-nums text-caption">
        {/* Two agreements off ONE number: the sentence's verb (the third argument
            here) and the unit noun (the third argument to the inner t()). */}
        {t(
          "workspaceUi.distanceUnitToGo",
          { distance: num(plan.distance), unit: t(plan.unitKey, {}, plan.distance) },
          plan.distance,
        )}
        {reachable ? (
          <>
            {" · "}
            {usd(plan.micros)} ·{" "}
            <span className="font-medium text-accent-dark dark:text-accent-light">
              {t("workspaceUi.fits")}
            </span>
          </>
        ) : (
          // Not "Locked" — a word that promises attainability the finite allowance denies.
          <span className="font-medium text-warm-dark dark:text-warm-light">
            {" · "}
            {t("workspaceUi.outOfAllowance")}
          </span>
        )}
      </p>
    </RungShell>
  );
}
