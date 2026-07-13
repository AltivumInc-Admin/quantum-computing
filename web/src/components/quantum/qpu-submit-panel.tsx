"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  isQpuConfigured,
  getBudget,
  getCredentialChallenge,
  claimCredential,
  submitTask,
  NotSignedInError,
  type Budget,
  type CredentialChallenge,
} from "@/lib/qpu-client";
import { PRICING } from "./cost";

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

// ONE cost source, ONE formatter — mirrors the server's exact charge
// (costMicros = task + per-shot, in integer micro-dollars). Every displayed
// dollar (preview, breakdown, button, confirm, budget bar, history) AND every
// rate quoted in prose derives from PRICING in cost.ts — the pricing table the
// whole app grades against, itself parity-locked to lib/utils/cost.py by the
// committed cost.json fixture — so a reprice lands everywhere at once instead
// of leaving this panel quoting a stale rate. (Exported for the parity test,
// which asserts the derived micros settle to the same cents as the kernel.)
// The server charges the exact Braket cost (no markup); micros are shown to the
// nearest cent, the resolution any price displays at.
export const IQM_TASK_MICROS = Math.round(PRICING.IQM.perTask * 1_000_000);
export const IQM_SHOT_MICROS = Math.round(PRICING.IQM.perShot * 1_000_000);
export const costMicros = (shots: number) => IQM_TASK_MICROS + IQM_SHOT_MICROS * shots;
export const usd = (micros: number) => `$${(Math.round(micros / 10_000) / 100).toFixed(2)}`;
// Rate strings for prose ("$0.30 per task", "$0.00145 per shot") — same source.
const PER_TASK_USD = usd(IQM_TASK_MICROS);
const PER_SHOT_USD = `$${PRICING.IQM.perShot}`;
// The server's hard shot ceiling — and, not by coincidence, the "Deep sample" medal
// threshold (see lambda/qpu/__fixtures__/hardware-ladder.json, which locks them
// equal). One number: the ceiling, the medal, the $1.75 run, the curriculum's card.
const MAX_SHOTS = 1000;

// ---- The teaching identity, entirely derived (never hand-typed) --------------
// A run's flat task fee is worth this many shots ($0.30 / $0.00145 = 206.9 → 207).
// This single ratio is why "fewer, bigger runs" is both better science and better
// value, and it moves automatically with any reprice.
const SHOTS_PER_TASK_FEE = Math.round(IQM_TASK_MICROS / IQM_SHOT_MICROS);
// The same 1,000 shots, bought two ways. Identical statistics, very different money.
const SPLIT_RUNS = 10;
const CONCENTRATED_MICROS = costMicros(MAX_SHOTS); // 1,000 shots in ONE run  → $1.75
const SPLIT_MICROS = SPLIT_RUNS * costMicros(MAX_SHOTS / SPLIT_RUNS); // ten 100s → $4.45
// The plan that earns all three Hardware medals: 3 runs totalling 1,000 shots.
// Cost depends ONLY on (runs, shots), never on how the shots are split.
const LADDER_RUNS = 3;
const LADDER_MICROS = IQM_TASK_MICROS * LADDER_RUNS + IQM_SHOT_MICROS * MAX_SHOTS; // $2.35
/** Shot noise at p = 0.5: the standard error of an estimated probability is
 *  1/(2√N). The SAME formula the cost-estimate Rep already teaches and grades
 *  (cost-estimate-widget.tsx), so the credential and the Rep teach one thing. */
const noisePct = (shots: number) => (100 / (2 * Math.sqrt(shots))).toFixed(1);

/**
 * The most shots the remaining budget can still buy, over ANY number of runs.
 *
 * cost(r, s) = TASK*r + SHOT*s, with s <= MAX_SHOTS*r — so concentrating shots into
 * fewer runs is optimal until MAX_SHOTS binds, and past that another run's task fee
 * buys headroom. Just take the best over every affordable run count.
 *
 * This is EXACTLY the frontier that decides whether the "Deep sample" medal is still
 * reachable, so it must never be approximated. It is also the honest answer to a
 * question the old UI let stand silently: a learner with $0.28 left has a number that
 * buys ZERO runs, and the bar used to just show them the $0.28.
 */
export function maxShotsAffordable(remainingMicros: number): number {
  let best = 0;
  const maxRuns = Math.floor(remainingMicros / (IQM_TASK_MICROS + IQM_SHOT_MICROS));
  for (let r = 1; r <= maxRuns; r++) {
    const forShots = remainingMicros - IQM_TASK_MICROS * r;
    if (forShots < 0) break;
    best = Math.max(best, Math.min(MAX_SHOTS * r, Math.floor(forShots / IQM_SHOT_MICROS)));
  }
  return best;
}

/** A budget with too little left for even a 1-shot run is SPENT — not "low". */
const isSpent = (b: Budget) => b.remainingMicros < costMicros(1);

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

const card =
  "rounded-card border border-gray-200/70 dark:border-white/[0.08] bg-(--surface-1) shadow-(--shadow-resting)";

export function QpuSubmitPanel() {
  if (!isQpuConfigured()) return null;
  return <Panel />;
}

type Load = "loading" | "signed-out" | "error" | "ready";

function Panel() {
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
      setLoad(e instanceof NotSignedInError ? "signed-out" : "error");
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
    <section aria-label="Run on real quantum hardware" className="mt-6">
      <header className="mb-4">
        <p className="text-xs font-medium uppercase tracking-widest text-accent dark:text-accent-light">
          Real hardware
        </p>
        <h2 className="mt-1 font-display text-display-md tracking-tight text-gray-900 dark:text-white">
          Run on IQM Garnet
        </h2>
      </header>

      {/* Who pays — always visible, in every load state. The trust centerpiece. */}
      <SponsorNote />

      {load === "loading" && (
        <div aria-hidden className={`mt-4 h-28 ${card} animate-pulse`} />
      )}
      {load === "signed-out" && (
        <p className={`mt-4 ${card} px-5 py-4 text-sm text-gray-600 dark:text-gray-300`}>
          Sign in to your workspace to run circuits on real hardware.
        </p>
      )}
      {load === "error" && (
        <p role="alert" className={`mt-4 ${card} px-5 py-4 text-sm text-gray-600 dark:text-gray-300`}>
          Couldn&apos;t reach the hardware service. Please try again.
        </p>
      )}

      {load === "ready" && budget && challenge && (
        <div className="mt-4 animate-fade-up space-y-4">
          <BudgetBar budget={budget} />
          {/* The plan surface: the cost model is the only thing that lets a learner
              plan a path to all three medals BEFORE spending. Closed by default —
              the live frontier in the bar above carries the truth at all times. */}
          <BudgetGuide capMicros={budget.capMicros} />
          {budget.credentialed ? (
            isSpent(budget) ? (
              <BudgetSpent budget={budget} />
            ) : (
              <SubmitForm budget={budget} onSubmitted={refresh} />
            )
          ) : (
            <CredentialGate challenge={challenge} onEarned={refresh} />
          )}
          {budget.tasks.length > 0 && <RunHistory tasks={budget.tasks} />}
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
function SponsorNote() {
  return (
    <div className="rounded-card border border-accent/30 bg-accent/[0.06] px-5 py-4">
      <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-200">
        <span className="font-semibold text-gray-900 dark:text-white">
          The platform pays for these runs. You are never charged.
        </span>{" "}
        IQM Garnet is a 20-qubit superconducting quantum processor in Amazon&apos;s{" "}
        <span className="tabular-nums">eu-north-1</span> region. Every run bills the
        platform&apos;s AWS account at the exact Amazon Braket price —{" "}
        <span className="tabular-nums font-medium">
          {PER_TASK_USD} per task + {PER_SHOT_USD} per shot
        </span>{" "}
        — with no markup. The budget below is an allowance we fund, not an invoice. Nothing here
        is a subscription or a simulation.
      </p>
    </div>
  );
}

function BudgetBar({ budget }: { budget: Budget }) {
  const pct = budget.capMicros > 0 ? Math.min(100, (budget.spentMicros / budget.capMicros) * 100) : 0;
  // The live frontier. The old caption ("The platform funds real-hardware access…")
  // buried the who-pays fact in 12px — it now leads the SponsorNote instead — and,
  // worse, it let a dead budget pass for a live one: a learner with $0.28 left was
  // shown "$0.28" and nothing else, a figure that buys ZERO runs. Both branches
  // below are exactly true, and the shot figure is the same frontier the confirm
  // dialog quotes, so the two can never disagree on screen.
  const affordable = maxShotsAffordable(budget.remainingMicros);
  return (
    <div className={`${card} px-5 py-4`}>
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-medium text-gray-900 dark:text-white">Sponsored QPU budget</p>
        <p className="text-sm tabular-nums text-gray-700 dark:text-gray-200">
          <span className="font-semibold">{usd(budget.remainingMicros)}</span>
          <span className="text-caption"> of {usd(budget.capMicros)} left</span>
        </p>
      </div>
      <div
        className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-200/80 dark:bg-white/[0.06]"
        role="img"
        aria-label={`${usd(budget.spentMicros)} of ${usd(budget.capMicros)} spent`}
      >
        <div className="h-full rounded-full bg-accent-dark dark:bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-xs text-caption">
        {affordable > 0 ? (
          <>
            Enough for{" "}
            <span className="tabular-nums font-medium text-gray-700 dark:text-gray-300">
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
    </div>
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
function BudgetGuide({ capMicros }: { capMicros: number }) {
  return (
    <details className={`${card} group px-5 py-4`}>
      <summary className="cursor-pointer list-item text-sm font-medium text-gray-900 dark:text-white interactive focus-ring rounded-control">
        How the sponsored budget works
      </summary>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
        <p>
          Runs are metered two ways: a flat <span className="font-medium">task fee</span> of{" "}
          <span className="tabular-nums font-medium">{PER_TASK_USD}</span> every time you submit,
          plus <span className="tabular-nums font-medium">{PER_SHOT_USD} per shot</span>. The task
          fee dominates — submitting once costs what about{" "}
          <span className="tabular-nums">{SHOTS_PER_TASK_FEE}</span> shots cost.
        </p>
        <p>So the same statistics cost very different amounts depending on how you buy them:</p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Cost of 1,000 shots, bought two ways</caption>
            <tbody>
              <tr className="border-b border-gray-200/70 dark:border-white/[0.08]">
                <td className="py-1.5 pr-4">
                  <span className="tabular-nums">{MAX_SHOTS.toLocaleString("en-US")}</span> shots in
                  one run
                </td>
                <td className="py-1.5 text-right font-semibold tabular-nums text-gray-900 dark:text-white">
                  {usd(CONCENTRATED_MICROS)}
                </td>
              </tr>
              <tr className="border-b border-gray-200/70 dark:border-white/[0.08]">
                <td className="py-1.5 pr-4">
                  <span className="tabular-nums">{MAX_SHOTS.toLocaleString("en-US")}</span> shots as
                  ten 100-shot runs
                </td>
                <td className="py-1.5 text-right font-semibold tabular-nums text-gray-900 dark:text-white">
                  {usd(SPLIT_MICROS)}
                </td>
              </tr>
              <tr>
                <td className="py-1.5 pr-4">your whole sponsored budget</td>
                <td className="py-1.5 text-right font-semibold tabular-nums text-gray-900 dark:text-white">
                  {usd(capMicros)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p>
          Identical precision either way (±<span className="tabular-nums">{noisePct(MAX_SHOTS)}%</span>
          ). The second way pays the {PER_TASK_USD} task fee ten times instead of once.
        </p>
        <p>
          <span className="font-medium text-gray-800 dark:text-gray-200">
            Fewer, bigger runs are both better science and better value.
          </span>{" "}
          Shots buy statistical precision — at p = 0.5 the standard error of an estimated
          probability is 1/(2√N), so <span className="tabular-nums">100</span> shots pin an outcome
          to ±<span className="tabular-nums">{noisePct(100)}%</span> and{" "}
          <span className="tabular-nums">{MAX_SHOTS.toLocaleString("en-US")}</span> shots to ±
          <span className="tabular-nums">{noisePct(MAX_SHOTS)}%</span>. Runs buy nothing but the
          right to submit again.
        </p>
        <p>
          <span className="font-medium text-gray-800 dark:text-gray-200">
            A plan that fits: {LADDER_RUNS} runs totalling{" "}
            <span className="tabular-nums">{MAX_SHOTS.toLocaleString("en-US")}</span> shots —{" "}
            <span className="tabular-nums">{usd(LADDER_MICROS)}</span>.
          </span>{" "}
          Split them however you like; cost depends only on how many runs and how many shots, never
          on how you divide them. That plan also earns all three Hardware medals.
        </p>
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
  const runs = budget.completedRuns;
  const shots = budget.completedShots;
  return (
    <div className={`${card} px-5 py-4`}>
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Sponsored budget spent</h3>
      <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
        Your <span className="tabular-nums font-medium">{usd(budget.capMicros)}</span> sponsored
        budget is spent:{" "}
        <span className="tabular-nums font-medium text-gray-800 dark:text-gray-200">{runs}</span>{" "}
        completed run{runs === 1 ? "" : "s"} on IQM Garnet,{" "}
        <span className="tabular-nums font-medium text-gray-800 dark:text-gray-200">
          {shots.toLocaleString("en-US")}
        </span>{" "}
        shots. Those runs stay on your record.
      </p>
      <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
        The hardware track continues on your own AWS account. The repository runs the same circuits,
        unmodified, against Amazon Braket at list price —{" "}
        <span className="tabular-nums">
          {PER_TASK_USD} per task + {PER_SHOT_USD} per shot
        </span>
        , the same rates shown here, billed to you.
      </p>
      <a
        href="https://github.com/AltivumInc-Admin/quantum-computing#quickstart"
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-flex items-center rounded-control surface-accent px-3.5 py-1.5 text-sm font-medium interactive focus-ring"
      >
        Run it on your own AWS account
      </a>
      <p className="mt-2 text-xs text-caption">
        <span className="font-mono">make setup</span>
      </p>
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
  const [value, setValue] = useState("");
  // "wrong" is reserved for the server's authoritative 200 {credentialed:false}
  // (and a locally unparseable answer) — a THROWN failure is never a wrong
  // answer, so it must not render the recompute hint (mirrors Panel.refresh()).
  const [state, setState] = useState<"idle" | "checking" | "wrong" | "expired" | "unreachable">(
    "idle",
  );
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
      setState(e instanceof NotSignedInError ? "expired" : "unreachable");
    }
  };

  return (
    <div className={`${card} px-5 py-4`}>
      <p className="text-sm font-medium text-gray-900 dark:text-white">
        One step before your first run: price it.
      </p>
      {/* Naming whose money it is makes the gate MORE compelling, not less. */}
      <p className="mt-1 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
        Real hardware costs real money — ours. Price your first run before we spend it: what does a{" "}
        <span className="tabular-nums font-medium">{shots.toLocaleString("en-US")}</span>-shot run on
        IQM Garnet cost, to the nearest cent?
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center rounded-control border border-gray-200 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-900/50 px-2 focus-within:ring-2 focus-within:ring-accent/40">
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
            className="w-24 bg-transparent px-1 py-1.5 font-mono text-sm text-gray-900 dark:text-gray-100 outline-none tabular-nums"
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
    </div>
  );
}

function SubmitForm({ budget, onSubmitted }: { budget: Budget; onSubmitted: () => void }) {
  const [qasm, setQasm] = useState(PRESETS[0].qasm);
  const [shots, setShots] = useState(100);
  const [phase, setPhase] = useState<"form" | "confirm" | "submitting" | "done">("form");
  const [outcome, setOutcome] = useState<{ ok: boolean; msg: string } | null>(null);
  // The idempotency key belongs to THIS run's intent: minted once when the
  // learner opens the confirm step, reused if they retry a failed submit, and
  // cleared whenever they edit the circuit/shots (a new intent → a new key).
  const [idem, setIdem] = useState<string | null>(null);

  const micros = useMemo(() => costMicros(shots), [shots]);
  const overBudget = micros > budget.remainingMicros;
  const validShots = Number.isInteger(shots) && shots >= 1 && shots <= MAX_SHOTS;
  const canSubmit = validShots && qasm.trim() !== "" && !overBudget;
  // What the budget still buys AFTER this run — the cliff, made visible before the click.
  const afterMicros = Math.max(0, budget.remainingMicros - micros);
  const afterShots = maxShotsAffordable(afterMicros);

  const editForm = () => {
    setPhase("form");
    setIdem(null); // editing = a new intent
  };

  const openConfirm = () => {
    setIdem((k) => k ?? crypto.randomUUID());
    setPhase("confirm");
  };

  const doSubmit = async () => {
    const key = idem ?? crypto.randomUUID();
    setPhase("submitting");
    setOutcome(null);
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
        setOutcome({ ok: false, msg: outcomeMessage(res.status, res.error, budget.capMicros) });
        setPhase("confirm"); // keep the key so a retry reuses it
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
      // "retrying is safe" sentence true.
      setOutcome({
        ok: false,
        msg:
          e instanceof NotSignedInError
            ? "Your session expired before this run was sent — nothing was submitted and no budget was spent. Sign in again."
            : "We couldn't confirm this run. Check your run history; retrying is safe and will not double-spend your budget.",
      });
      setPhase("confirm");
    }
  };

  if (phase === "done") {
    return (
      <div className={`${card} px-5 py-4`}>
        <p role="status" className="text-sm leading-relaxed text-gray-800 dark:text-gray-100 animate-fade-up">
          {outcome?.msg}
        </p>
        <button
          type="button"
          onClick={() => {
            setOutcome(null);
            editForm();
          }}
          className="mt-3 inline-flex rounded-control border border-gray-200 dark:border-gray-700/50 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 interactive focus-ring"
        >
          Run another
        </button>
      </div>
    );
  }

  return (
    <div className={`${card} px-5 py-4`}>
      <label htmlFor="qpu-qasm" className="text-sm font-medium text-gray-900 dark:text-white">
        Circuit (OpenQASM 3.0)
      </label>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.name}
            type="button"
            onClick={() => setQasm(p.qasm)}
            className="rounded-chip border border-gray-200 dark:border-gray-700/50 px-2 py-0.5 text-xs text-gray-600 dark:text-gray-300 interactive focus-ring"
          >
            {p.name}
          </button>
        ))}
      </div>
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
        className="mt-2 w-full rounded-control border border-gray-200 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-900/50 px-3 py-2.5 font-mono text-sm text-gray-800 dark:text-gray-200 focus-ring resize-y disabled:opacity-60"
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label htmlFor="qpu-shots" className="text-sm text-gray-700 dark:text-gray-300">
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
          className="w-24 rounded-control border border-gray-200 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-900/50 px-2 py-1.5 font-mono text-sm text-gray-900 dark:text-gray-100 focus-ring tabular-nums disabled:opacity-60"
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
          className="mt-4 inline-flex items-center rounded-control border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-800 dark:text-gray-100 interactive focus-ring disabled:opacity-50"
        >
          Review this run
        </button>
      ) : (
        <div className="mt-4 rounded-control border border-accent/40 bg-accent/[0.06] px-4 py-3 animate-fade-up">
          <p className="text-sm text-gray-800 dark:text-gray-100">
            This spends <span className="font-semibold tabular-nums">{usd(micros)}</span> of your{" "}
            <span className="tabular-nums">{usd(budget.remainingMicros)}</span> sponsored budget on a
            real, irreversible run on the physical device. It cannot be undone once submitted.
          </p>
          {/* The foresight line — the frontier, quoted BEFORE the click. This is what
              stops a learner walking off the cliff: three thoughtless 100-shot default
              runs foreclose the top medal, and this is where they can see it coming. */}
          <p className="mt-1.5 text-sm tabular-nums text-gray-700 dark:text-gray-200">
            {afterShots > 0 ? (
              <>
                After this run: {usd(afterMicros)} left — enough for{" "}
                {afterShots.toLocaleString("en-US")} more shots.
              </>
            ) : (
              <>After this run: {usd(afterMicros)} left — not enough for another run.</>
            )}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
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
              className="inline-flex items-center rounded-control border border-gray-200 dark:border-gray-700/50 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 interactive focus-ring disabled:opacity-50"
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
    <dl className="mt-3 rounded-control bg-gray-50 dark:bg-white/[0.03] px-3 py-2.5 text-sm">
      <div className="flex justify-between">
        <dt className="text-gray-600 dark:text-gray-400">Task fee</dt>
        <dd className="tabular-nums text-gray-800 dark:text-gray-200">{usd(IQM_TASK_MICROS)}</dd>
      </div>
      <div className="mt-1 flex justify-between">
        <dt className="text-gray-600 dark:text-gray-400">
          Shots — {PER_SHOT_USD} × {shots.toLocaleString("en-US")}
        </dt>
        <dd className="tabular-nums text-gray-800 dark:text-gray-200">{usd(IQM_SHOT_MICROS * shots)}</dd>
      </div>
      <div className="mt-2 flex justify-between border-t border-gray-200/70 dark:border-white/[0.08] pt-2">
        <dt className="font-medium text-gray-900 dark:text-white">Total to the device</dt>
        <dd className="font-semibold tabular-nums text-gray-900 dark:text-white">{usd(micros)}</dd>
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
      <h3 className="text-sm font-medium text-gray-900 dark:text-white">Run history</h3>
      <ul className="mt-2 divide-y divide-gray-100 dark:divide-white/[0.06]">
        {tasks.map((t) => (
          <li key={t.idempotencyKey} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span className="min-w-0 truncate text-gray-700 dark:text-gray-300">
              <span className="tabular-nums">{t.shots.toLocaleString("en-US")}</span> shots
              {t.taskArn ? ` · ${t.taskArn.split("/").pop()}` : ""}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="tabular-nums text-gray-500 dark:text-gray-400">{usd(t.estMicros)}</span>
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
function outcomeMessage(status: number, error: string, capMicros: number): string {
  switch (error) {
    case "over-lifetime-budget":
      // Deleted forever: "That's a lot of real hardware runs." False after the cap
      // change (it buys 2-5 runs) and a register violation regardless.
      return `Your sponsored lifetime budget (${usd(capMicros)}) is spent. This run was not submitted.`;
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
