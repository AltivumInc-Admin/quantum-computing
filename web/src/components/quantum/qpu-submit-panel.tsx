"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  isQpuConfigured,
  getBudget,
  getCredentialChallenge,
  claimCredential,
  submitTask,
  NotSignedInError,
  classifySubmitFailure,
  isRateLimited,
  isRateLimitedOutcome,
  type Budget,
  type CredentialChallenge,
} from "@/lib/qpu-client";
import { HARDWARE_TIERS } from "@/lib/credentials";
import { useLocale, localeCode } from "@/i18n";
import type { TFunction } from "@/i18n";
import { consumeHandoff } from "@/lib/qpu-handoff";
import {
  IQM_TASK_MICROS,
  IQM_SHOT_MICROS,
  MAX_SHOTS,
  DEEP_SAMPLE_SHOTS,
  DEEP_SAMPLE_TITLE,
  costMicros,
  creditsForMicros,
  usd,
  maxShotsAffordable,
  deepSampleReachable,
  remainingLadderPlan,
  tierReachable,
  type HardwareReach,
} from "@/lib/qpu-budget";
import { PRICING } from "./cost";
import {
  cardShell,
} from "./widget-ui";

/**
 * The one surface where a REAL quantum computer runs a learner's circuit — and the
 * PLATFORM pays Amazon Braket for it. The learner is never charged, ever. That fact
 * is the panel's whole reason for existing, so it is stated first, plainly, in every
 * load state (SponsorNote), and no string anywhere in this file may imply the
 * learner pays. A regression guard in the test suite fails on /you pay/i or
 * /charged/i for exactly that reason.
 *
 * The budget is a sponsored ALLOWANCE, not an invoice — which is why the cost is
 * still shown itemized to the cent: a learner who cannot see the real price cannot
 * plan against it, and the cost model taught here is the same one the in-app
 * cost-estimate Rep grades. Two thirds of a run's price is the FLAT $0.30 task fee,
 * so the disclosure that teaches "fewer, bigger runs" (BudgetGuide) is literally the
 * disclosure that stops a learner walking off the budget cliff. The panel is inert
 * (renders nothing) until NEXT_PUBLIC_QPU_URL is configured.
 */

// ONE cost source, ONE ladder source, ONE formatter. Every displayed dollar (preview,
// breakdown, button, confirm, budget bar, history), every rate quoted in prose, and
// every medal threshold named on this surface comes from @/lib/qpu-budget, which
// derives rates from PRICING (cost.ts, parity-locked to lib/utils/cost.py) and the
// ladder from HARDWARE_TIERS (lib/credentials.ts, locked to the committed fixture).
// NOTHING is hand-typed here: this panel used to hand-copy the ladder's `3` and its
// $2.35, so a tier change would have left the surface that TEACHES the plan quoting a
// stale one while its suite stayed green. Re-exported for the existing parity tests.
export {
  IQM_TASK_MICROS,
  IQM_SHOT_MICROS,
  costMicros,
  usd,
  maxShotsAffordable,
} from "@/lib/qpu-budget";

// Rate strings for prose ("$0.30 per task", "$0.00145 per shot") — same source.
const PER_TASK_USD = usd(IQM_TASK_MICROS);
const PER_SHOT_USD = `$${PRICING.IQM.perShot}`;

// ---- The teaching identity, entirely derived (never hand-typed) --------------
// A run's flat task fee is worth this many shots ($0.30 / $0.00145 = 206.9 → 207).
// This single ratio is why "fewer, bigger runs" is both better science and better
// value, and it moves automatically with any reprice.
const SHOTS_PER_TASK_FEE = Math.round(IQM_TASK_MICROS / IQM_SHOT_MICROS);
// The same MAX_SHOTS shots, bought two ways. Identical statistics, very different money.
const SPLIT_RUNS = 10;
const CONCENTRATED_MICROS = costMicros(MAX_SHOTS); // 1,000 shots in ONE run  → $1.75
const SPLIT_MICROS = SPLIT_RUNS * costMicros(MAX_SHOTS / SPLIT_RUNS); // ten 100s → $4.45
/** Shot noise at p = 0.5: the standard error of an estimated probability is
 *  1/(2√N). The SAME formula the cost-estimate Rep already teaches and grades
 *  (cost-estimate-widget.tsx), so the credential and the Rep teach one thing. */
const noisePct = (shots: number) => (100 / (2 * Math.sqrt(shots))).toFixed(1);

/**
 * The graduation link. `#quickstart` did not exist — GitHub slugifies headings, so the
 * old anchor silently no-oped and dropped the learner at the top of a ~500-line README
 * with no route to the section they were sent for. This is the real slug of the README
 * heading "### Path C — Full workspace (AWS Braket, real hardware)", and
 * qpu-submit-panel.test.tsx re-derives every heading's slug from README.md and pins
 * this string to it, so renaming that heading reddens the suite instead of quietly
 * breaking the one link the terminal state has.
 */
export const REPO_URL = "https://github.com/AltivumInc-Admin/quantum-computing";
export const README_QUICKSTART_ANCHOR = "path-c--full-workspace-aws-braket-real-hardware";

/**
 * The learner's hardware standing — the three numbers every reachability question on
 * this surface is answered from. All three come off the budget the panel already
 * fetched, so nothing new is loaded to tell the truth about the ladder.
 *
 * `null` when the server did not report the medal counters (an older Lambda). The
 * NULL IS THE POINT: reachability is then UNKNOWABLE, and the type refuses to let any
 * caller compute it anyway. An unknown must never be reported as a foreclosure — that
 * was the exact defect that shipped "NaN of 1 run — out of reach" to production.
 */
const reachOf = (b: Budget): HardwareReach | null =>
  b.completedRuns === null || b.completedShots === null
    ? null
    : {
        completedRuns: b.completedRuns,
        completedShots: b.completedShots,
        remainingMicros: b.remainingMicros,
      };

/** A budget with too little left for even a 1-shot run is SPENT — not "low". */
const isSpent = (b: Budget) => b.remainingMicros < costMicros(1);
/**
 * Does this learner hold a sponsored allowance at all?
 *
 * The programme was WITHDRAWN on 2026-07-28 — nothing is given away, and a new
 * learner's cap is 0. Learners stamped before then keep theirs, so the surface
 * has to branch rather than assume: showing "$0.00 of $0.00 left" under the
 * heading "Lifetime sponsored QPU budget" would be advertising a programme that
 * no longer exists, which is the same lie as the copy this panel already fought.
 */
const hasAllowance = (b: Budget) => b.capMicros > 0;
/** Can the PAID wallet fund at least the cheapest possible run? (null = metering
 *  not reported by the server → no.) */
const walletCanFund = (b: Budget) =>
  b.walletCredits != null && b.walletCredits >= creditsForMicros(costMicros(1));

const PRESETS: { name: string; qasm: string }[] = [
  {
    name: "Bell state",
    qasm: "OPENQASM 3.0;\nqubit[2] q;\nh q[0];\ncnot q[0], q[1];\nbit[2] c;\nc = measure q;",
  },
  {
    name: "GHZ (3-qubit)",
    qasm: "OPENQASM 3.0;\nqubit[3] q;\nh q[0];\ncnot q[0], q[1];\ncnot q[1], q[2];\nbit[3] c;\nc = measure q;",
  },
];

const card = cardShell;

export function QpuSubmitPanel({ className }: { className?: string }) {
  if (!isQpuConfigured()) return null;
  return <Panel className={className} />;
}

// "throttled" is NOT a flavour of "error": the service is up, the learner simply
// asked too often, and the only correct instruction is to wait. Collapsing it into
// "error" is what made the edge's 429 (lambda/qpu/edge.yaml) invisible to learners.
type Load = "loading" | "signed-out" | "error" | "throttled" | "ready";

function Panel({ className }: { className?: string }) {
  const { t } = useLocale();
  const [load, setLoad] = useState<Load>("loading");
  const [budget, setBudget] = useState<Budget | null>(null);
  const [challenge, setChallenge] = useState<CredentialChallenge | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [b, c] = await Promise.all([getBudget(), getCredentialChallenge()]);
      setBudget(b);
      setChallenge(c);
      setLoad("ready");
    } catch (e) {
      setLoad(
        e instanceof NotSignedInError ? "signed-out" : isRateLimited(e) ? "throttled" : "error",
      );
    }
  }, []);

  useEffect(() => {
    // Data-fetch on mount: refresh() setStates only AFTER its await (a microtask,
    // not synchronously), so this is the sanctioned fetch effect, not a cascading
    // render. Children also call refresh() to reload after a claim/submit.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  return (
    <section aria-label="Run on real quantum hardware" className={className}>
      <header className="mb-4">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent-dark dark:text-accent font-mono">
          Real hardware
        </p>
        <h2 className="mt-1 font-display text-display-md tracking-tight text-(--ink)">
          Run on IQM Garnet
        </h2>
      </header>

      {/* Who pays — always visible, in every load state. The trust centerpiece.
          Fails CLOSED: while the budget is still loading (or the learner is signed
          out) `budget` is null and we do NOT claim sponsorship. Guessing wrong in
          that direction promises free hardware to someone who will be charged;
          guessing wrong the other way merely under-promises to the handful of
          grandfathered learners, who see the correct line a moment later. */}
      <SponsorNote sponsored={budget !== null && hasAllowance(budget)} />

      {load === "loading" && (
        <div aria-hidden className={`mt-4 h-28 ${card} animate-pulse motion-reduce:animate-none`} />
      )}
      {load === "signed-out" && (
        <p className={`mt-4 ${card} px-5 py-4 text-sm text-(--mut)`}>
          Sign in to your workspace to run circuits on real hardware.
        </p>
      )}
      {load === "error" && (
        <p role="alert" className={`mt-4 ${card} px-5 py-4 text-sm text-(--mut)`}>
          Couldn&apos;t reach the hardware service. Please try again.
        </p>
      )}
      {/* role="status", not "alert": nothing is broken and nothing is lost — this is
          an advisory with a wait in it, the same register as the within-reach panel's
          unavailable-record line. */}
      {load === "throttled" && (
        <p role="status" className={`mt-4 ${card} px-5 py-4 text-sm text-(--mut)`}>
          {t("qpuUi.rateLimitedService")}
        </p>
      )}

      {load === "ready" && budget && challenge && (
        // Full-width band: money + plan on the LEFT, the interactive run + history on
        // the RIGHT. Below lg it collapses to one column in this exact DOM order
        // (budget, guide, run, history) — the same order the narrow rail always used,
        // so reading order and focus order never diverge from the visual.
        <div className="mt-4 animate-fade-up grid gap-4 lg:grid-cols-2 lg:items-start">
          <div className="flex flex-col gap-4">
            {/* The sponsored bar ONLY for learners who actually hold an
                allowance. Everyone else buys their runs, so the funding surface
                is their credit wallet — showing them a $0.00 sponsored budget
                would advertise a withdrawn programme. */}
            {hasAllowance(budget) ? <BudgetBar budget={budget} /> : <WalletBar budget={budget} />}
            {/* The plan surface: the cost model is the only thing that lets a learner
                plan a path to all three medals BEFORE spending. OPEN until they have
                spent anything — a learner who has never run has everything to lose. */}
            <BudgetGuide budget={budget} />
          </div>
          <div className="flex flex-col gap-4">
            {budget.credentialed ? (
              // The terminal "budget spent" card belongs ONLY to a learner who
              // actually HAD an allowance and exhausted it. A learner who never
              // held one has nothing to have spent — telling them their budget
              // is gone describes a programme they were never part of. They get
              // the live form instead, with submit disabled and the wallet card
              // above it explaining that runs need credits.
              hasAllowance(budget) && isSpent(budget) && !walletCanFund(budget) ? (
                <BudgetSpent budget={budget} />
              ) : (
                <SubmitForm budget={budget} onSubmitted={refresh} />
              )
            ) : (
              <CredentialGate challenge={challenge} onEarned={refresh} />
            )}
            {budget.tasks.length > 0 && <RunHistory tasks={budget.tasks} />}
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Who pays. The single most prominent money surface in the product, and the one the
 * old copy got wrong: it said "You pay the exact Amazon Braket price" and "Every cent
 * runs your circuit on the physical device" — an unowned possessive that was the
 * setup line for the lie. Both are deleted forever. Rates stay derived from PRICING,
 * so a reprice can never strand this prose.
 */
/**
 * Who pays, said in the learner's own terms. The sponsored allowance was withdrawn
 * on 2026-07-28, so the lead sentence is now CONDITIONAL: only a learner who still
 * holds a stamped allowance is told the platform pays.
 *
 * The unconditional version survived the /sponsored/i sweep because it never used
 * the word — "The platform pays for these runs. You are never charged." is the
 * promise in its strongest form and its plainest English. A vocabulary check cannot
 * catch a claim phrased without the vocabulary, which is why the test that guards
 * this asserts the sentence.
 *
 * What does NOT change between the two branches: the at-cost, no-markup pricing and
 * the hardware description. Those are true either way, and they are the part that
 * earns trust — a learner paying their own way has more reason to care that the
 * price is unmarked-up, not less.
 */
function SponsorNote({ sponsored }: { sponsored: boolean }) {
  return (
    <div className="rounded-card border border-accent/30 bg-accent/[0.06] px-5 py-4">
      {/* Cap the reading measure: the banner spans the full-width band, but the prose
          stays near 70ch so it never becomes an unreadable wide line. */}
      <p className="max-w-[70ch] text-sm leading-relaxed text-(--mut)">
        <span className="font-semibold text-(--ink)">
          {sponsored
            ? "The platform pays for these runs. You are never charged."
            : "You pay for these runs at cost. We add nothing on top."}
        </span>{" "}
        IQM Garnet is a 20-qubit superconducting quantum processor in Amazon&apos;s{" "}
        <span className="tabular-nums">eu-north-1</span> region. Every run bills the
        platform&apos;s AWS account at the exact Amazon Braket price —{" "}
        <span className="tabular-nums font-medium">
          {PER_TASK_USD} per task + {PER_SHOT_USD} per shot
        </span>{" "}
        — with no markup.{" "}
        {sponsored
          ? "The budget below is an allowance we fund, not an invoice: one lifetime allowance per learner, not a monthly credit. It does not refill."
          : "That exact figure is what comes out of your wallet — the credit cost below is the AWS price converted at $0.01 per credit, and it is charged only when a run is submitted."}{" "}
        Nothing here is a subscription or a simulation.
      </p>
    </div>
  );
}

/**
 * The funding surface for a learner who buys their runs — i.e. everyone, now
 * that the sponsored allowance is withdrawn. Deliberately NOT a progress bar:
 * a wallet has no ceiling to be a fraction of, and drawing one would invent a
 * budget the learner does not have.
 */
function WalletBar({ budget }: { budget: Budget }) {
  const { t } = useLocale();
  const credits = budget.walletCredits;
  const runCost = creditsForMicros(costMicros(100));
  return (
    <div className={`${card} px-5 py-4`}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-(--ink)">Hardware credits</p>
        <p className="shrink-0 text-sm tabular-nums text-(--mut)">
          {credits == null ? (
            <span className="text-caption">unavailable</span>
          ) : (
            <span className="font-semibold">{t("qpuUi.walletBalance", { credits })}</span>
          )}
        </p>
      </div>
      <p className="mt-2 text-xs text-caption">
        {credits != null && credits >= runCost ? (
          <>
            Runs are billed at the Amazon Braket price with no markup — a 100-shot run
            costs <span className="tabular-nums">{runCost}</span> credits.
          </>
        ) : (
          <>
            You need credits to run on real hardware. A 100-shot run costs{" "}
            <span className="tabular-nums">{runCost}</span> credits, billed at the
            Amazon Braket price with no markup.{" "}
            <Link href="/pricing" className="link-underline">
              Top up
            </Link>
            .
          </>
        )}
      </p>
      <LadderProgress budget={budget} />
    </div>
  );
}

function BudgetBar({ budget }: { budget: Budget }) {
  const { t } = useLocale();
  const pct = budget.capMicros > 0 ? Math.min(100, (budget.spentMicros / budget.capMicros) * 100) : 0;
  // The live frontier. The old caption ("The platform funds real-hardware access…")
  // buried the who-pays fact in 12px — it now leads the SponsorNote instead — and,
  // worse, it let a dead budget pass for a live one: a learner with $0.28 left was
  // shown "$0.28" and nothing else, a figure that buys ZERO runs. Both branches
  // below are exactly true, and the shot figure is the same frontier the confirm
  // dialog quotes, so the two can never disagree on screen.
  const affordable = maxShotsAffordable(budget.remainingMicros);
  // LIFETIME is said HERE, where the number lives — before the money is gone, not
  // only in the error after it. Newcomers arrive assuming budgets refill (monthly
  // credits, free tiers); this one never does, and that is the whole plan constraint.
  const left = `${usd(budget.remainingMicros)} of ${usd(budget.capMicros)} left`;
  return (
    <div className={`${card} px-5 py-4`}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-(--ink)">
          Lifetime sponsored QPU budget
        </p>
        <p className="shrink-0 text-sm tabular-nums text-(--mut)">
          <span className="font-semibold">{usd(budget.remainingMicros)}</span>
          <span className="text-caption"> of {usd(budget.capMicros)} left</span>
        </p>
      </div>
      {/* A real progressbar, and its aria-valuetext is the SAME sentence as the visible
          figure. The old track was role="img" labelled in the OPPOSITE framing (spent),
          so a screen-reader user and a sighted user were read different numbers off the
          same bar. */}
      <div
        className="mt-2 h-2 w-full overflow-hidden rounded-full bg-(--track)"
        role="progressbar"
        aria-label="Lifetime sponsored QPU budget"
        aria-valuemin={0}
        aria-valuemax={budget.capMicros}
        aria-valuenow={budget.remainingMicros}
        aria-valuetext={left}
      >
        <div className="h-full rounded-full bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-xs text-caption">
        {affordable > 0 ? (
          <>
            Enough for{" "}
            <span className="tabular-nums font-medium text-(--mut)">
              {affordable.toLocaleString("en-US")}
            </span>{" "}
            more shots. Every run costs{" "}
            <span className="tabular-nums">{PER_TASK_USD}</span> before a single shot fires.
          </>
        ) : (
          <>
            Not enough left for another run — every run starts at{" "}
            <span className="tabular-nums">{PER_TASK_USD}</span>.
          </>
        )}
      </p>
      {/* The PAID wallet, only when the server reports one (null = pre-metering
          Lambda or metering not configured — an invented "0 credits" would tell a
          paying learner their balance vanished). Rendered on the same card as the
          sponsored budget because they are the two funding sources of one run:
          allowance first, then credits. */}
      {budget.walletCredits != null && (
        <p className="mt-1 text-xs text-caption tabular-nums">
          {t("qpuUi.walletBalance", { credits: budget.walletCredits })}
        </p>
      )}
      <LadderProgress budget={budget} />
    </div>
  );
}

/**
 * The medal ladder, on the surface where the money is spent.
 *
 * Without it the shot-frontier caption above is uninterpretable — "enough for 1,310
 * more shots" means nothing to a learner who cannot see that 1,000 of them is a medal.
 * Every THRESHOLD comes from HARDWARE_TIERS (the wall's own source) and every DISPLAY
 * TITLE from the wall's own dictionary keys, so the two surfaces cannot disagree about
 * what the ladder is, and a tier edit moves both. A tier the remaining budget can no
 * longer reach says so here too — the same verdict the wall renders, never a silently
 * unreachable counter ticking toward nothing.
 *
 * That claim was briefly FALSE. This read `tier.title` — the tier's stable ENGLISH
 * identity, never its label (credentials.ts:74) — and hardcoded "shots"/"run(s)" and
 * an en-US formatter, while the wall and Within-reach were localized. A Spanish
 * learner saw "Serie de ejecuciones" in Within-reach and "Run series" HERE, on the
 * same /workspace page, describing the same rung.
 */
function LadderProgress({ budget }: { budget: Budget }) {
  const { t, locale } = useLocale();
  const reach = reachOf(budget);
  // No record, no counters, no claims. The old code walked straight into the
  // arithmetic here and printed "NaN of 1 run — out of reach" on the founder's own
  // screen: a medal declared permanently lost because a field was missing.
  if (reach === null) {
    return (
      <p role="status" className="mt-2 text-xs leading-relaxed text-warm-dark dark:text-warm-light">
        {/* From the dictionary, not a module constant. This branch describes the SAME
            fact Within-reach reports one panel away on /workspace, and that panel is
            localized — so an English literal here put one fact on screen in two
            languages at once for a Spanish learner. (The ladder's own titles and unit
            nouns were fixed for exactly this reason; the branch that fires when the
            ladder cannot be drawn at all was left behind.) */}
        {t("qpuUi.recordUnavailable")}
      </p>
    );
  }
  return (
    <p className="mt-2 flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-xs tabular-nums text-caption">
      {/* `tier`, not `t` — the translator owns that name in this scope now. */}
      {HARDWARE_TIERS.map((tier, i) => {
        const value = tier.metric === "shots" ? reach.completedShots : reach.completedRuns;
        const earned = value >= tier.n;
        // The unit noun agrees with the THRESHOLD, the number it sits beside
        // ("0 of 1 run", "0 of 3 runs") — the same keys and the same agreement the
        // Within-reach rung uses, so the two readouts cannot drift apart.
        const unit = t(
          tier.metric === "shots" ? "workspaceUi.unitShot" : "workspaceUi.unitRun",
          {},
          tier.n,
        );
        const lost = !earned && !tierReachable(tier, reach);
        return (
          <span key={`${tier.metric}:${tier.n}`}>
            {i > 0 && <span aria-hidden="true" className="mr-1.5 text-gray-300 dark:text-gray-600">·</span>}
            <span className={earned ? "text-(--mut)" : undefined}>
              {t(`credentialsUi.tiers.hardware.${tier.metric}.${tier.n}`)}:{" "}
              {/* Count AND unit inside one emphasis span, because they arrive as one
                  dictionary sentence: rungProgress owns the join ("N of M units"), and
                  splitting it across nodes would hardcode English word order into the
                  markup. es-MX happens to share that order; a locale that did not
                  would silently scramble. */}
              <span className="font-medium">
                {t("workspaceUi.rungProgress", {
                  current: Math.min(value, tier.n).toLocaleString(localeCode(locale)),
                  target: tier.n.toLocaleString(localeCode(locale)),
                  unit,
                })}
              </span>
              {lost && (
                <span className="text-warm-dark dark:text-warm-light">
                  {" — "}
                  {/* The wall's OWN verdict word, lowercased for this inline position
                      (the same toLocaleLowerCase idiom within-reach.tsx uses for its
                      group noun). Reusing the chip key is what keeps one verdict from
                      being two different words on one page. */}
                  {t("credentialsUi.outOfReach").toLocaleLowerCase(localeCode(locale))}
                </span>
              )}
            </span>
          </span>
        );
      })}
    </p>
  );
}

/**
 * How the sponsored budget works — the "clarity is paramount" surface.
 *
 * Not documentation: a MECHANISM. The flat task fee dominates, so the same statistics
 * cost wildly different amounts depending on how you buy them, and a learner who
 * cannot see that will spend three thoughtless default runs and foreclose the top
 * medal without ever being told. Making the frontier visible BEFORE the click is what
 * makes the ladder honest.
 *
 * Native <details>/<summary>: keyboard-operable and screen-reader-announced with zero
 * JS, no focus trap, no ARIA to get wrong. The disclosure triangle is the native
 * marker — no icon, no emoji. Every figure derives; the cap comes from the server, so
 * a grandfathered learner sees THEIR cap, not a hardcoded one.
 */
function BudgetGuide({ budget }: { budget: Budget }) {
  const capMicros = budget.capMicros;
  // Open by default until the learner has completed a run: before the first submit
  // they can still spend the allowance well, and everything in here is what "well"
  // means. Once they have run, it collapses to a reference they can reopen. Held in
  // state (not a bare `open` attribute) so a re-render never reopens what they closed.
  const [open, setOpen] = useState(budget.completedRuns === 0);
  // The killer fact, stated rather than buried: ten default-sized runs cost MORE than
  // the entire allowance. Comparative, never hardcoded — a grandfathered $5.00 learner
  // must not be told $4.45 is "more than your budget", because it isn't.
  const splitOverCap = SPLIT_MICROS > capMicros;
  // The plan is quoted from where the learner ACTUALLY stands, and only while it is
  // still buyable. Asserting "a plan that fits: $2.35" to someone holding $1.16 was
  // the same defect class as the unearnable medal: a promise the money contradicts.
  // Reachability needs the hardware record; without it (an older Lambda that omits the
  // counters) there is no honest personalized plan to quote — so we don't. The static
  // cost mechanics below stand on their own; an unknown is never dressed as a plan.
  const reach = reachOf(budget);
  const plan = reach ? remainingLadderPlan(reach) : null;
  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
      className={`${card} group px-5 py-4`}
    >
      <summary className="cursor-pointer list-item text-sm font-medium text-(--ink) interactive focus-ring rounded-control">
        How hardware runs are priced
      </summary>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-(--mut)">
        <p>
          <span className="font-medium text-(--ink)">
            Ten <span className="tabular-nums">100</span>-shot runs cost{" "}
            <span className="tabular-nums">{usd(SPLIT_MICROS)}</span>
            {capMicros <= 0 ? (
              // No allowance: there is no budget to be a fraction of, so the
              // figure stands on its own as a price.
              <>.</>
            ) : splitOverCap ? (
              <>
                {" "}
                — more than your entire <span className="tabular-nums">{usd(capMicros)}</span>{" "}
                lifetime budget.
              </>
            ) : (
              <>
                {" "}
                of your <span className="tabular-nums">{usd(capMicros)}</span> lifetime budget.
              </>
            )}
          </span>{" "}
          The same{" "}
          <span className="tabular-nums">{(SPLIT_RUNS * 100).toLocaleString("en-US")}</span> shots in
          one run cost <span className="tabular-nums">{usd(CONCENTRATED_MICROS)}</span>. How you buy
          them decides whether the allowance lasts.
        </p>
        <p>
          Runs are metered two ways: a flat <span className="font-medium">task fee</span> of{" "}
          <span className="tabular-nums font-medium">{PER_TASK_USD}</span> every time you submit,
          plus <span className="tabular-nums font-medium">{PER_SHOT_USD} per shot</span>. The task
          fee dominates — submitting once costs what about{" "}
          <span className="tabular-nums">{SHOTS_PER_TASK_FEE}</span> shots cost.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">
              What {MAX_SHOTS.toLocaleString("en-US")} shots cost bought as one run and as ten
              100-shot runs
            </caption>
            <thead>
              <tr>
                <th scope="col" className="sr-only">
                  How the shots are bought
                </th>
                <th scope="col" className="sr-only">
                  Cost
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-(--bd)">
                <td className="py-1.5 pr-4">
                  <span className="tabular-nums">{MAX_SHOTS.toLocaleString("en-US")}</span> shots in
                  one run
                </td>
                <td className="py-1.5 text-right font-semibold tabular-nums text-(--ink)">
                  {usd(CONCENTRATED_MICROS)}
                </td>
              </tr>
              <tr className="border-b border-(--bd)">
                <td className="py-1.5 pr-4">
                  <span className="tabular-nums">{MAX_SHOTS.toLocaleString("en-US")}</span> shots as
                  ten 100-shot runs
                </td>
                <td className="py-1.5 text-right font-semibold tabular-nums text-(--ink)">
                  {usd(SPLIT_MICROS)}
                </td>
              </tr>
              {/* Only a learner who HOLDS an allowance has a budget to compare
                  against; for everyone else the prices above stand alone. */}
              {capMicros > 0 && (
                <tr>
                  <td className="py-1.5 pr-4">your whole lifetime budget</td>
                  <td className="py-1.5 text-right font-semibold tabular-nums text-(--ink)">
                    {usd(capMicros)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p>
          Identical precision either way (±<span className="tabular-nums">{noisePct(MAX_SHOTS)}%</span>
          ). The second way pays the {PER_TASK_USD} task fee ten times instead of once.
        </p>
        <p>
          <span className="font-medium text-(--ink)">
            Fewer, bigger runs are both better science and better value.
          </span>{" "}
          Shots buy statistical precision — at p = 0.5 the standard error of an estimated
          probability is 1/(2√N), so <span className="tabular-nums">100</span> shots pin an outcome
          to ±<span className="tabular-nums">{noisePct(100)}%</span> and{" "}
          <span className="tabular-nums">{MAX_SHOTS.toLocaleString("en-US")}</span> shots to ±
          <span className="tabular-nums">{noisePct(MAX_SHOTS)}%</span>. Runs buy nothing but the
          right to submit again.
        </p>
        {plan &&
          (plan.complete ? (
          <p>
            <span className="font-medium text-(--ink)">
              You hold all three Hardware medals.
            </span>{" "}
            Anything you run now is your own experiment, on the same allowance.
          </p>
        ) : plan.fits ? (
          <p>
            <span className="font-medium text-(--ink)">
              A plan that fits: {plan.runs} run{plan.runs === 1 ? "" : "s"}
              {plan.shots > 0 && (
                <>
                  {" "}
                  totalling <span className="tabular-nums">
                    {plan.shots.toLocaleString("en-US")}
                  </span>{" "}
                  shots
                </>
              )}{" "}
              — <span className="tabular-nums">{usd(plan.micros)}</span>.
            </span>{" "}
            Split them however you like; cost depends only on how many runs and how many shots,
            never on how you divide them. That plan takes you to all three Hardware medals from
            where you stand.
          </p>
        ) : (
          <p>
            <span className="font-medium text-(--ink)">
              All three medals no longer fit your remaining budget.
            </span>{" "}
            From here they would take {plan.runs} more run{plan.runs === 1 ? "" : "s"} totalling{" "}
            <span className="tabular-nums">{plan.shots.toLocaleString("en-US")}</span> more shots —{" "}
            <span className="tabular-nums">{usd(plan.micros)}</span>, against the{" "}
            <span className="tabular-nums">{usd(budget.remainingMicros)}</span> you have left. The
            medals you can still reach are listed under the budget bar.
          </p>
          ))}
      </div>
    </details>
  );
}

/**
 * The terminal state. Exhaustion is a persistent property of the account, not an
 * event — so it gets a card, not a disabled form with a red banner, which is where a
 * learner's last impression of the hardware track was being formed. No apology, no
 * gratitude, no consolation: a graduation path. The counts come from the server
 * aggregates, so they stay truthful past the 50-row task window.
 */
function BudgetSpent({ budget }: { budget: Budget }) {
  // The same server aggregates the ladder reads. Absent (an older Lambda) they are
  // UNKNOWN, not zero — so the card drops the counts rather than print "NaN shots" over
  // a learner's real record. The graduation path below never depended on them.
  const record =
    budget.completedRuns !== null && budget.completedShots !== null
      ? { runs: budget.completedRuns, shots: budget.completedShots }
      : null;
  return (
    <div className={`${card} px-5 py-4`}>
      <h3 className="text-sm font-semibold text-(--ink)">Hardware budget spent</h3>
      <p className="mt-2 text-sm leading-relaxed text-(--mut)">
        Your <span className="tabular-nums font-medium">{usd(budget.capMicros)}</span> hardware
        budget is spent
        {record ? (
          <>
            :{" "}
            <span className="tabular-nums font-medium text-(--ink)">
              {record.runs}
            </span>{" "}
            completed run{record.runs === 1 ? "" : "s"} on IQM Garnet,{" "}
            <span className="tabular-nums font-medium text-(--ink)">
              {record.shots.toLocaleString("en-US")}
            </span>{" "}
            shots. Those runs stay on your record.
          </>
        ) : (
          <>. Your completed runs stay on your record.</>
        )}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-(--mut)">
        The hardware track continues on your own AWS account, against the same device. The
        repository submits through the Braket Python SDK, not the OpenQASM above — you rebuild the
        circuit as a <span className="font-mono text-xs">braket.circuits.Circuit</span> and run{" "}
        <span className="font-mono text-xs">
          run_circuit(circuit, device_name=&quot;iqm_garnet&quot;, shots=1000,
          s3_location=(&quot;amazon-braket-&lt;your-bucket&gt;&quot;, &quot;quantum&quot;))
        </span>{" "}
        from <span className="font-mono text-xs">lib/hardware</span>, which prints a cost estimate
        before it submits. The <span className="font-mono text-xs">s3_location</span> is required —
        the call fails fast without it, before any cost is incurred. Amazon Braket then bills your
        account at list price —{" "}
        <span className="tabular-nums">
          {PER_TASK_USD} per task + {PER_SHOT_USD} per shot
        </span>
        , the same rates shown here.
      </p>
      <a
        href={`${REPO_URL}#${README_QUICKSTART_ANCHOR}`}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-flex items-center rounded-control surface-accent px-3.5 py-1.5 text-sm font-medium interactive focus-ring"
      >
        Run it on your own AWS account
      </a>
      <p className="mt-2 text-xs text-caption">
        <span className="font-mono">make setup</span>
      </p>
      {/* The second continuation path, shown only where it is real: metering is
          configured (walletCredits reported) but this learner has too few credits
          to fund a run. Without this the card offers exactly one way forward and
          silently omits the one the pricing page sells. */}
      {budget.walletCredits != null && !walletCanFund(budget) && (
        <p className="mt-3 text-sm leading-relaxed text-(--mut)">
          Or keep running here: top up your credit wallet on the{" "}
          <Link href="/pricing" className="link-underline">
            Pricing page
          </Link>{" "}
          — credits fund every run at the same Braket rates, with no markup.
        </p>
      )}
    </div>
  );
}

function CredentialGate({
  challenge,
  onEarned,
}: {
  challenge: CredentialChallenge;
  onEarned: () => void;
}) {
  const { t } = useLocale();
  const [value, setValue] = useState("");
  // "wrong" is reserved for the server's authoritative 200 {credentialed:false}
  // (and a locally unparseable answer) — a THROWN failure is never a wrong
  // answer, so it must not render the recompute hint (mirrors Panel.refresh()).
  // "throttled" is likewise not "unreachable": a rate-limited claim told the
  // learner the service was down, so they retried immediately and stayed blocked.
  const [state, setState] = useState<
    "idle" | "checking" | "wrong" | "expired" | "unreachable" | "throttled"
  >("idle");
  const shots = challenge.requiredShots;

  const submit = async () => {
    const cents = Math.round(parseFloat(value) * 100);
    if (!Number.isFinite(cents)) {
      setState("wrong");
      return;
    }
    setState("checking");
    try {
      const { credentialed } = await claimCredential(cents);
      if (credentialed) onEarned();
      else setState("wrong");
    } catch (e) {
      setState(
        e instanceof NotSignedInError ? "expired" : isRateLimited(e) ? "throttled" : "unreachable",
      );
    }
  };

  return (
    <div className={`${card} px-5 py-4`}>
      <p className="text-sm font-medium text-(--ink)">
        One step before your first run: price it.
      </p>
      {/* Naming whose money it is makes the gate MORE compelling, not less. */}
      <p className="mt-1 text-sm leading-relaxed text-(--mut)">
        Real hardware costs real money — ours. Price your first run before we spend it: what does a{" "}
        <span className="tabular-nums font-medium">{shots.toLocaleString("en-US")}</span>-shot run on
        IQM Garnet cost, to the nearest cent?
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center rounded-control border border-(--bd) bg-(--field) px-2 focus-within:ring-2 focus-within:ring-accent/40">
          <span className="text-caption">$</span>
          <label htmlFor="qpu-cred" className="sr-only">
            Estimated cost in dollars
          </label>
          <input
            id="qpu-cred"
            inputMode="decimal"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (state !== "idle" && state !== "checking") setState("idle");
            }}
            placeholder="0.00"
            className="w-24 bg-transparent px-1 py-1.5 font-mono text-sm text-(--ink) outline-none tabular-nums"
          />
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={state === "checking" || value.trim() === ""}
          className="inline-flex items-center rounded-control surface-accent px-3.5 py-1.5 text-sm font-medium interactive focus-ring disabled:opacity-50"
        >
          {state === "checking" ? "Checking…" : "Unlock hardware access"}
        </button>
      </div>
      {state === "wrong" && (
        <p role="status" className="mt-2 text-xs text-caption animate-fade-up">
          Not quite. Recompute:{" "}
          <span className="tabular-nums">
            {PER_TASK_USD} per task + {PER_SHOT_USD} × {shots.toLocaleString("en-US")} shots
          </span>
          , rounded to the nearest cent.
        </p>
      )}
      {state === "expired" && (
        <p role="alert" className="mt-2 text-xs text-red-700 dark:text-red-300 animate-fade-up">
          Your session expired. Sign in again.
        </p>
      )}
      {state === "unreachable" && (
        <p role="alert" className="mt-2 text-xs text-red-700 dark:text-red-300 animate-fade-up">
          Couldn&apos;t reach the hardware service. Try again.
        </p>
      )}
      {state === "throttled" && (
        <p role="status" className="mt-2 text-xs text-caption animate-fade-up">
          {t("qpuUi.rateLimitedService")}
        </p>
      )}
    </div>
  );
}

function SubmitForm({ budget, onSubmitted }: { budget: Budget; onSubmitted: () => void }) {
  const { t } = useLocale();
  // The one-shot playground handoff, consumed HERE (form mount, not panel mount) so
  // it survives the CredentialGate detour: a first-time learner prices a run, earns
  // the credential, and the form still finds the circuit waiting when it mounts.
  // State initializers run exactly once, so the consume never re-fires on re-render.
  const [handoff] = useState(() => consumeHandoff());
  const [handoffNoteShown, setHandoffNoteShown] = useState(handoff !== null);
  const [qasm, setQasm] = useState(handoff?.qasm ?? PRESETS[0].qasm);
  const [shots, setShots] = useState(100);
  const [phase, setPhase] = useState<"form" | "confirm" | "submitting" | "done">("form");
  const [outcome, setOutcome] = useState<{ ok: boolean; msg: string } | null>(null);
  // The idempotency key belongs to THIS run's intent: minted once when the
  // learner opens the confirm step, reused if they retry a failed submit, and
  // cleared whenever they edit the circuit/shots (a new intent → a new key).
  const [idem, setIdem] = useState<string | null>(null);

  const micros = useMemo(() => costMicros(shots), [shots]);
  const overBudget = micros > budget.remainingMicros;
  // Funding, decided the same way the server decides it: allowance first, then
  // the PAID wallet. A run the allowance can't cover is not blocked when the
  // wallet can pay for it — it is DISCLOSED as wallet-funded at the confirm step.
  const runCredits = creditsForMicros(micros);
  const walletFunded = overBudget && budget.walletCredits != null;
  const walletCovers = walletFunded && (budget.walletCredits ?? 0) >= runCredits;
  const validShots = Number.isInteger(shots) && shots >= 1 && shots <= MAX_SHOTS;
  const canSubmit =
    validShots && qasm.trim() !== "" && (!overBudget || walletCovers);
  // What the budget still buys AFTER this run — the cliff, made visible before the click.
  const afterMicros = Math.max(0, budget.remainingMicros - micros);
  const afterShots = maxShotsAffordable(afterMicros);

  // THE FORECLOSURE CHECK — the whole reason this branch exists.
  //
  // Deep sample (1,000 shots) can be closed off FOREVER by runs that each look
  // harmless: three at the default 100 shots cost $1.335 and leave $1.165, which buys
  // at most 596 more shots — 896 total, forever short of 1,000. The old panel let that
  // happen in silence. So at the one moment the learner is about to commit money, we
  // compare the frontier BEFORE this run with the frontier AFTER it, and if this run is
  // the one that closes the door we say so. It does not block the run: it is their
  // allowance and a deliberate 1,000-shot-less campaign is a legitimate use of it. It
  // only refuses to let the door close quietly.
  //
  // The post-run figures assume this run COMPLETES (its shots then count toward the
  // medal). A FAILED/CANCELLED run is refunded and counts for nothing, which restores
  // the budget too — so this is the correct, and the conservative, comparison.
  const reachNow = reachOf(budget);
  // The check compares the medal frontier BEFORE this run with the one AFTER it. With no
  // hardware record (an older Lambda omits the counters) that frontier is unknowable —
  // and an unknown must never be dressed as a foreclosure — so the whole check stands
  // down: no record, no warning.
  const reachAfter: HardwareReach | null = reachNow && {
    completedRuns: reachNow.completedRuns + 1,
    completedShots: reachNow.completedShots + shots,
    remainingMicros: afterMicros,
  };
  const deepSampleForeclosed =
    validShots &&
    reachNow !== null &&
    reachAfter !== null &&
    deepSampleReachable(reachNow) &&
    !deepSampleReachable(reachAfter);
  const shotsCeilingAfter = reachAfter ? reachAfter.completedShots + afterShots : 0;

  // The confirm step now carries the panel's most consequential sentences (an
  // irreversible spend, and what it forecloses), yet it used to appear silently and
  // leave focus behind on a button that no longer existed. Announce it, and put focus
  // on the action it is asking about.
  const submitRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (phase === "confirm") submitRef.current?.focus();
  }, [phase]);

  // A thrown submit whose truth is unknown: the intent key awaiting resolution
  // against the server's run history. Any NEW intent cancels the wait.
  const [unresolvedKey, setUnresolvedKey] = useState<string | null>(null);

  // Resolve an ambiguous (thrown) submit against the run history. The reserve
  // transaction writes the task row atomically with the spend, so the key's
  // presence in the newest rows IS the truth: present means the run committed
  // before the connection died; absent means it never reached us and no budget
  // was spent — the claim the message below is then entitled to make. Tries
  // immediately (the drop may have been momentary) and again on every browser
  // "online" event; cleanup cancels when the intent changes or the form unmounts.
  useEffect(() => {
    if (unresolvedKey === null) return;
    let cancelled = false;
    const attempt = async () => {
      try {
        const fresh = await getBudget();
        if (cancelled) return;
        // `row`, not `t` — the translator owns that name in this scope now.
        const hit = fresh.tasks.find((row) => row.idempotencyKey === unresolvedKey);
        setUnresolvedKey(null);
        if (hit) {
          setOutcome({
            ok: true,
            msg: `Good news — this run had already reached us before the connection dropped: task ${
              hit.taskArn ? hit.taskArn.split("/").pop() : hit.idempotencyKey.slice(0, 8)
            } is in your run history. No retry needed.`,
          });
          setPhase("done");
          onSubmitted();
        } else {
          setOutcome({
            ok: false,
            msg: "Connection restored. This run never reached us, so no budget was spent — submit again when you're ready; it will not double-spend.",
          });
        }
      } catch {
        /* still unreachable — the next "online" event retries */
      }
    };
    void attempt();
    const onOnline = () => void attempt();
    window.addEventListener("online", onOnline);
    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
    };
  }, [unresolvedKey, onSubmitted]);

  const editForm = () => {
    setPhase("form");
    setIdem(null); // editing = a new intent
    setUnresolvedKey(null); // and abandons any pending truth-check
  };

  const openConfirm = () => {
    setIdem((k) => k ?? crypto.randomUUID());
    setPhase("confirm");
  };

  const doSubmit = async () => {
    // idem is null right after a braket-submit-failed retry-reset; mint the new
    // key AND persist it, so an AMBIGUOUS failure of this attempt still reuses
    // the same key on the next retry (the double-spend protection).
    const key = idem ?? crypto.randomUUID();
    if (!idem) setIdem(key);
    setPhase("submitting");
    setOutcome(null);
    setUnresolvedKey(null); // this attempt supersedes any pending truth-check
    try {
      const res = await submitTask(shots, qasm, key);
      if (res.ok) {
        setOutcome({
          ok: true,
          msg: res.taskArn
            ? `Submitted to IQM Garnet — task ${res.taskArn.split("/").pop()}. Results will appear in your run history once the device completes it.`
            : "Submitted to IQM Garnet. Results will appear in your run history.",
        });
        setPhase("done");
        onSubmitted();
      } else {
        setOutcome({
          ok: false,
          msg: outcomeMessage(res.status, res.error, budget.capMicros, t, res.creditsNeeded),
        });
        setPhase("confirm"); // keep the key so a retry reuses it...
        // ...EXCEPT after braket-submit-failed: the server has already released
        // the hold and a RELEASED row now owns this key, so a same-key retry
        // returns that cached failure and never reaches the device again — the
        // learner is told "Try again" but the retry can never succeed. The
        // refund is definitive (nothing was charged), so the retry is a NEW
        // intent and safely mints a new key.
        if (res.error === "braket-submit-failed") setIdem(null);
        // A 402 means the budget is gone. Re-fetch so the panel flips to the terminal
        // BudgetSpent card instead of stranding the learner on a dead form under a red
        // banner, which is what shipped before.
        if (res.status === 402) onSubmitted();
      }
    } catch (e) {
      // The request may have reached the server before the connection died, and
      // the server reserves the spend BEFORE it submits to the device — so a
      // thrown submit must NOT claim the budget was untouched. `idem` is untouched
      // and the phase returns to "confirm", so a retry reuses the SAME key and the
      // server dedupes instead of double-spending — which is what makes the
      // "retrying is safe" sentence true. Beyond the message, the unresolvedKey
      // effect above settles the ambiguity for real: it checks the run history
      // (now, and again when connectivity returns) and reports what actually
      // happened. First live report (2026-07-15): a wifi drop read as a software
      // failure — name the connection when we can tell it was one.
      if (e instanceof NotSignedInError) {
        setOutcome({
          ok: false,
          msg: "Your session expired before this run was sent — nothing was submitted and no budget was spent. Sign in again.",
        });
      } else {
        const kind = classifySubmitFailure(e);
        setOutcome({
          ok: false,
          msg:
            kind === "offline"
              ? "Your connection dropped — you appear to be offline. This was a network problem, not a hardware failure. Once you are back online, this panel checks your run history and reports whether the run went through."
              : kind === "network"
                ? "The connection was interrupted before this run could be confirmed — a network drop, not a hardware failure. Checking your run history to see whether it went through."
                : "We couldn't confirm this run. Checking your run history; retrying is safe and will not double-spend your budget.",
        });
        setUnresolvedKey(key);
      }
      setPhase("confirm");
    }
  };

  if (phase === "done") {
    return (
      <div className={`${card} px-5 py-4`}>
        <p role="status" className="text-sm leading-relaxed text-(--ink) animate-fade-up">
          {outcome?.msg}
        </p>
        <button
          type="button"
          onClick={() => {
            setOutcome(null);
            editForm();
          }}
          className="mt-3 inline-flex rounded-control border border-(--bd) px-3 py-1.5 text-sm font-medium text-(--mut) interactive focus-ring"
        >
          Run another
        </button>
      </div>
    );
  }

  return (
    <div className={`${card} px-5 py-4`}>
      <label htmlFor="qpu-qasm" className="text-sm font-medium text-(--ink)">
        Circuit (OpenQASM 3.0)
      </label>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.name}
            type="button"
            onClick={() => setQasm(p.qasm)}
            className="rounded-chip border border-(--bd) px-2 py-0.5 text-xs text-(--mut) interactive focus-ring"
          >
            {p.name}
          </button>
        ))}
      </div>
      {handoffNoteShown && handoff && (
        // The handoff acknowledgement — same informational styling as the confirm
        // note (accent border + wash), sized down. Dismiss only hides the note; the
        // circuit stays in the editor.
        <div
          role="status"
          className="mt-2 flex items-start justify-between gap-3 rounded-control border border-accent/40 bg-accent/[0.06] px-3 py-2"
        >
          <p className="text-xs leading-relaxed text-(--mut)">
            Loaded from the playground
            {handoff.name ? (
              <>
                : <span className="font-medium">{handoff.name}</span>
              </>
            ) : null}
            .
          </p>
          <button
            type="button"
            onClick={() => setHandoffNoteShown(false)}
            aria-label="Dismiss the playground note"
            className="shrink-0 rounded-control px-1 text-sm leading-none text-caption interactive focus-ring"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
      )}
      <textarea
        id="qpu-qasm"
        value={qasm}
        spellCheck={false}
        disabled={phase === "submitting"}
        onChange={(e) => {
          setQasm(e.target.value);
          editForm();
        }}
        rows={Math.max(4, qasm.split("\n").length)}
        className="mt-2 w-full rounded-control border border-(--bd) bg-(--field) px-3 py-2.5 font-mono text-sm text-(--ink) focus-ring resize-y disabled:opacity-60"
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label htmlFor="qpu-shots" className="text-sm text-(--mut)">
          Shots
        </label>
        <input
          id="qpu-shots"
          type="number"
          min={1}
          max={MAX_SHOTS}
          value={shots}
          disabled={phase === "submitting"}
          onChange={(e) => {
            setShots(Math.floor(Number(e.target.value)));
            editForm();
          }}
          className="w-24 rounded-control border border-(--bd) bg-(--field) px-2 py-1.5 font-mono text-sm text-(--ink) focus-ring tabular-nums disabled:opacity-60"
        />
        {/* The bare "max 1,000" was a trap under a sponsored cap. The maxed run is
            now the OPTIMAL play (it banks Deep sample outright), so price it. */}
        <span className="text-xs text-caption tabular-nums">
          max {MAX_SHOTS.toLocaleString("en-US")} — the full{" "}
          {MAX_SHOTS.toLocaleString("en-US")}-shot run costs {usd(CONCENTRATED_MICROS)}
        </span>
      </div>

      {/* The itemized cost — the honest breakdown, always shown. */}
      <CostBreakdown shots={shots} micros={micros} />

      {overBudget && (
        // overBudget implies remaining < micros <= $1.75, and below $1.75 the frontier
        // is always achieved in a single run — so this figure and the budget bar's can
        // never disagree on screen.
        <p role="status" className="mt-2 text-xs tabular-nums text-red-700 dark:text-red-300">
          This run ({usd(micros)}) is more than your remaining budget (
          {usd(budget.remainingMicros)}), which covers at most{" "}
          {maxShotsAffordable(budget.remainingMicros).toLocaleString("en-US")} shots.
        </p>
      )}
      {outcome && !outcome.ok && (
        <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300 animate-fade-up">
          {outcome.msg}
        </p>
      )}

      {phase === "form" ? (
        <button
          type="button"
          disabled={!canSubmit}
          onClick={openConfirm}
          className="mt-4 inline-flex items-center rounded-control border border-(--bd) px-4 py-2 text-sm font-medium text-(--ink) interactive focus-ring disabled:opacity-50"
        >
          Review this run
        </button>
      ) : (
        <div
          role="status"
          className="mt-4 rounded-control border border-accent/40 bg-accent/[0.06] px-4 py-3 animate-fade-up"
        >
          {/* WHICH money is about to move. The sponsored allowance and the paid
              wallet are different money with different consequences, so the
              disclosure names the source before the irreversible click — never
              a generic "this spends" that lets a learner think their purchased
              credits are the platform's allowance. */}
          {walletFunded ? (
            <p className="text-sm text-(--ink)">
              This run is{" "}
              <span className="font-semibold">funded by your wallet</span>:{" "}
              <span className="font-semibold tabular-nums">{runCredits} credits</span> (
              {usd(micros)}) of your{" "}
              <span className="tabular-nums">{budget.walletCredits ?? 0}</span>. This is a real,
              irreversible run on the physical device. It cannot be undone once submitted.
            </p>
          ) : (
            <p className="text-sm text-(--ink)">
              This spends <span className="font-semibold tabular-nums">{usd(micros)}</span> of your{" "}
              <span className="tabular-nums">{usd(budget.remainingMicros)}</span> hardware budget on a
              real, irreversible run on the physical device. It cannot be undone once submitted.
            </p>
          )}
          {/* The foresight line — the frontier, quoted BEFORE the click. This is what
              stops a learner walking off the cliff: three thoughtless 100-shot default
              runs foreclose the top medal, and this is where they can see it coming.
              A wallet-funded run leaves the allowance untouched, so the allowance
              frontier is unchanged and quoting it would be noise. */}
          {!walletFunded && (
            <p className="mt-1.5 text-sm tabular-nums text-(--mut)">
              {afterShots > 0 ? (
                <>
                  After this run: {usd(afterMicros)} left — enough for{" "}
                  {afterShots.toLocaleString("en-US")} more shots.
                </>
              ) : (
                <>After this run: {usd(afterMicros)} left — not enough for another run.</>
              )}
            </p>
          )}
          {!walletFunded && deepSampleForeclosed && (
            // The consequence, stated before the money moves — not blocked, not softened.
            <p className="mt-1.5 text-sm leading-relaxed text-warm-dark dark:text-warm-light">
              This run closes off the{" "}
              <span className="font-medium">{DEEP_SAMPLE_TITLE}</span> medal for good. Counting this
              run, your record plus every shot the remaining budget
              could still buy tops out at{" "}
              <span className="tabular-nums font-medium">
                {shotsCeilingAfter.toLocaleString("en-US")}
              </span>{" "}
              shots — the medal needs{" "}
              <span className="tabular-nums font-medium">
                {DEEP_SAMPLE_SHOTS.toLocaleString("en-US")}
              </span>
              . Fewer, bigger runs keep it in reach.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              ref={submitRef}
              disabled={phase === "submitting" || !canSubmit}
              onClick={doSubmit}
              className="inline-flex items-center rounded-control surface-accent px-4 py-2 text-sm font-semibold interactive focus-ring disabled:opacity-50 tabular-nums"
            >
              {/* "— $0.45" alone is the universal grammar of "you are being charged
                  this". `spends` is the verb the rest of this file already uses. */}
              {phase === "submitting" ? "Submitting…" : `Submit to real hardware — spends ${usd(micros)}`}
            </button>
            <button
              type="button"
              disabled={phase === "submitting"}
              onClick={editForm}
              className="inline-flex items-center rounded-control border border-(--bd) px-4 py-2 text-sm font-medium text-(--mut) interactive focus-ring disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CostBreakdown({ shots, micros }: { shots: number; micros: number }) {
  return (
    <dl className="mt-3 rounded-control bg-(--field) border border-(--bd) px-3 py-2.5 text-sm">
      <div className="flex justify-between">
        <dt className="text-(--mut)">Task fee</dt>
        <dd className="tabular-nums text-(--ink)">{usd(IQM_TASK_MICROS)}</dd>
      </div>
      <div className="mt-1 flex justify-between">
        <dt className="text-(--mut)">
          Shots — {PER_SHOT_USD} × {shots.toLocaleString("en-US")}
        </dt>
        <dd className="tabular-nums text-(--ink)">{usd(IQM_SHOT_MICROS * shots)}</dd>
      </div>
      <div className="mt-2 flex justify-between border-t border-(--bd) pt-2">
        <dt className="font-medium text-(--ink)">Total to the device</dt>
        <dd className="font-semibold tabular-nums text-(--ink)">{usd(micros)}</dd>
      </div>
      <p className="mt-2 text-[0.7rem] text-caption">
        The exact Amazon Braket charge, to the nearest cent. The platform pays it — this is what
        your run costs us.
      </p>
    </dl>
  );
}

function RunHistory({ tasks }: { tasks: Budget["tasks"] }) {
  return (
    <div className={`${card} px-5 py-4`}>
      <h3 className="text-sm font-medium text-(--ink)">Run history</h3>
      <ul className="mt-2 divide-y divide-(--bd)">
        {tasks.map((t) => (
          <li key={t.idempotencyKey} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span className="min-w-0 truncate text-(--mut)">
              <span className="tabular-nums">{t.shots.toLocaleString("en-US")}</span> shots
              {t.taskArn ? ` · ${t.taskArn.split("/").pop()}` : ""}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="tabular-nums text-caption">{usd(t.estMicros)}</span>
              <StatusChip status={t.status} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const tone =
    status === "COMPLETED"
      ? "bg-accent/12 text-accent-dark dark:text-accent-light"
      : status === "FAILED" || status === "RELEASED"
        ? "bg-gray-200/70 text-gray-500 dark:bg-white/[0.06] dark:text-gray-400"
        : "bg-amber-500/15 text-amber-700 dark:text-amber-300";
  return (
    <span className={`rounded-chip px-1.5 py-0.5 text-[0.6rem] font-medium uppercase tracking-wide ${tone}`}>
      {status.toLowerCase()}
    </span>
  );
}

// "No budget was spent" is claimed ONLY where the server provably never committed
// the reservation: every 4xx is a rejection before (or an all-or-none cancellation
// of) the reserve transaction, and 502 braket-submit-failed is the one path that runs
// the compensating release. Any other 5xx/timeout can die AFTER the money is
// reserved, so there we say only what we know.
//
// Every "charge/charged" verb is gone from these strings: the learner is never
// charged, so a message telling them their budget "was not charged" quietly implies
// that it otherwise WOULD have been. The lifetime-budget line takes capMicros rather
// than hardcoding it — a grandfathered learner holds a different cap and must be told
// the truth about THEIR allowance.
//
// `t` is threaded in for the RATE LIMIT branch only. The other sentences are still
// English literals like the rest of this panel — translating them is a separate,
// larger job, and half-translating this function would have been the same mixed-locale
// defect the ladder above just had. The rate-limit sentence has to come from the
// dictionary because it is NEW copy: shipping it hardcoded would guarantee a Spanish
// learner never sees it.
function outcomeMessage(
  status: number,
  error: string,
  capMicros: number,
  t: TFunction,
  creditsNeeded?: number,
): string {
  // Checked BEFORE the switch, and on the status as well as the token. WAF blocks at
  // the edge — before the Lambda reserves anything — so "no budget was spent" is
  // provable here, and the actionable half ("wait a minute") is the whole point: the
  // default 4xx branch below is true but tells the learner nothing they can act on.
  if (isRateLimitedOutcome(status, error)) return t("qpuUi.rateLimitedSubmit");
  switch (error) {
    case "insufficient-credits":
      // The server names the price of the run it refused to fund; quote THAT,
      // never a locally recomputed figure that could disagree with the debit.
      return t("qpuUi.insufficientCredits", { credits: creditsNeeded ?? 0 });
    case "over-lifetime-budget":
      // Deleted forever: "That's a lot of real hardware runs." False after the cap
      // change (it buys 2-5 runs) and a register violation regardless.
      return `Your hardware budget (${usd(capMicros)}) is spent. This run was not submitted.`;
    case "over-daily-budget":
      return "The daily hardware budget across all learners is reached. It resets at 00:00 UTC — try again tomorrow.";
    case "qpu-disabled":
      return "Real-hardware runs are paused right now. Please try again later.";
    case "credential-required":
      return "Price a run first to unlock hardware access.";
    case "email-not-verified":
      return "Verify your email before running on real hardware.";
    case "braket-submit-failed":
      return "The device did not accept this run, so the hold was released — no budget was spent. Try again.";
    default:
      if (status >= 400 && status < 500) {
        return status === 402
          ? "Budget reached. This run was not submitted and no budget was spent."
          : "That run couldn't be submitted. No budget was spent.";
      }
      return "We couldn't confirm this run. Check your run history; retrying is safe and will not double-spend your budget.";
  }
}
