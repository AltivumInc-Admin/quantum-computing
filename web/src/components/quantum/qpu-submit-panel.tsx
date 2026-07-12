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
 * The one surface where a learner spends a sponsored budget to run a circuit on a
 * REAL quantum computer. Its whole reason for existing is honesty about the money:
 * every cent goes to the physical device at the exact Amazon Braket price, with no
 * platform markup — so the cost is always shown itemized and stated plainly. The
 * panel is inert (renders nothing) until NEXT_PUBLIC_QPU_URL is configured.
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
const MAX_SHOTS = 1000;

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

      {/* The transparency block — always visible, the trust centerpiece. */}
      <TransparencyNote />

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
          {budget.credentialed ? (
            <SubmitForm budget={budget} onSubmitted={refresh} />
          ) : (
            <CredentialGate challenge={challenge} onEarned={refresh} />
          )}
          {budget.tasks.length > 0 && <RunHistory tasks={budget.tasks} />}
        </div>
      )}
    </section>
  );
}

function TransparencyNote() {
  return (
    <div className="rounded-card border border-accent/30 bg-accent/[0.06] px-5 py-4">
      <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-200">
        <span className="font-semibold text-gray-900 dark:text-white">
          Every cent runs your circuit on the physical device.
        </span>{" "}
        IQM Garnet is a 20-qubit superconducting quantum processor in Amazon&apos;s{" "}
        <span className="tabular-nums">eu-north-1</span> region. You pay the exact Amazon Braket
        price —{" "}
        <span className="tabular-nums font-medium">
          {PER_TASK_USD} per task + {PER_SHOT_USD} per shot
        </span>{" "}
        — with no platform markup. Nothing here is a subscription or a simulation.
      </p>
    </div>
  );
}

function BudgetBar({ budget }: { budget: Budget }) {
  const pct = budget.capMicros > 0 ? Math.min(100, (budget.spentMicros / budget.capMicros) * 100) : 0;
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
        The platform funds real-hardware access so you can learn on the real thing.
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
      <p className="mt-1 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
        Real hardware costs real money, so we ask you to compute it first. What does a{" "}
        <span className="tabular-nums font-medium">{shots.toLocaleString("en-US")}</span>-shot run on
        IQM Garnet cost, to the nearest cent?
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center rounded-control border border-gray-200 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-900/50 px-2 focus-within:ring-2 focus-within:ring-accent/40">
          <span className="text-gray-500">$</span>
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
        setOutcome({ ok: false, msg: outcomeMessage(res.status, res.error) });
        setPhase("confirm"); // keep the key so a retry reuses it
      }
    } catch (e) {
      // The request may have reached the server before the connection died, and
      // the server reserves the spend BEFORE it submits to the device — so a
      // thrown submit must NOT claim "not charged". `idem` is untouched and the
      // phase returns to "confirm", so a retry reuses the SAME key and the
      // server dedupes instead of double-charging — which is what makes the
      // "retrying is safe" sentence true.
      setOutcome({
        ok: false,
        msg:
          e instanceof NotSignedInError
            ? "Your session expired before this run was sent — nothing was submitted or charged. Sign in again."
            : "We couldn't confirm this run. Check your run history; retrying is safe and will not double-charge.",
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
        <span className="text-xs text-caption">max {MAX_SHOTS.toLocaleString("en-US")}</span>
      </div>

      {/* The itemized cost — the honest breakdown, always shown. */}
      <CostBreakdown shots={shots} micros={micros} />

      {overBudget && (
        <p role="status" className="mt-2 text-xs text-red-700 dark:text-red-300">
          This run ({usd(micros)}) is more than your remaining budget ({usd(budget.remainingMicros)}).
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
            <span className="tabular-nums">{usd(budget.remainingMicros)}</span> budget on a real,
            irreversible run on the physical device. It cannot be undone once submitted.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={phase === "submitting" || !canSubmit}
              onClick={doSubmit}
              className="inline-flex items-center rounded-control surface-accent px-4 py-2 text-sm font-semibold interactive focus-ring disabled:opacity-50 tabular-nums"
            >
              {phase === "submitting" ? "Submitting…" : `Submit to real hardware — ${usd(micros)}`}
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
        The exact Amazon Braket charge, shown to the nearest cent. It goes to the device, not us.
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

// "Your budget was not charged" is claimed ONLY where the server provably never
// committed the reservation: every 4xx is a rejection before (or an all-or-none
// cancellation of) the reserve transaction, and 502 braket-submit-failed is the
// one path that runs the compensating release. Any other 5xx/timeout can die
// AFTER the money is reserved, so there we say only what we know.
function outcomeMessage(status: number, error: string): string {
  switch (error) {
    case "over-lifetime-budget":
      return "You've used your full sponsored QPU budget. That's a lot of real hardware runs.";
    case "over-daily-budget":
      return "The daily hardware budget across all learners is reached. It resets at 00:00 UTC — try again tomorrow.";
    case "qpu-disabled":
      return "Real-hardware runs are paused right now. Please try again later.";
    case "credential-required":
      return "Price a run first to unlock hardware access.";
    case "email-not-verified":
      return "Verify your email before running on real hardware.";
    case "braket-submit-failed":
      return "The device did not accept this run, so the hold was released — your budget was not charged. Try again.";
    default:
      if (status >= 400 && status < 500) {
        return status === 402
          ? "Budget reached. This run was not submitted and your budget was not charged."
          : "That run couldn't be submitted. Your budget was not charged.";
      }
      return "We couldn't confirm this run. Check your run history; retrying is safe and will not double-charge.";
  }
}
