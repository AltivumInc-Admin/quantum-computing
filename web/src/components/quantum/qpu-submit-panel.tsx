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

/**
 * The one surface where a learner spends a sponsored budget to run a circuit on a
 * REAL quantum computer. Its whole reason for existing is honesty about the money:
 * every cent goes to the physical device at the exact Amazon Braket price, with no
 * platform markup — so the cost is always shown itemized and stated plainly. The
 * panel is inert (renders nothing) until NEXT_PUBLIC_QPU_URL is configured.
 */

// Display math replicates the server's component-wise cent settlement so what the
// learner sees equals what the server charges. IQM rates mirror cost.ts / cost.py.
const centsOf = (v: number) => Math.round(v * 100 + 1e-7);
const IQM = { perTask: 0.3, perShot: 0.00145 };
const costCents = (shots: number) => centsOf(IQM.perTask) + centsOf(IQM.perShot * shots);
const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const usdMicros = (micros: number) => `$${(micros / 1_000_000).toFixed(2)}`;
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
        price — <span className="tabular-nums font-medium">$0.30 per task + $0.00145 per shot</span> —
        with no platform markup. Nothing here is a subscription or a simulation.
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
          <span className="font-semibold">{usdMicros(budget.remainingMicros)}</span>
          <span className="text-caption"> of {usdMicros(budget.capMicros)} left</span>
        </p>
      </div>
      <div
        className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-200/80 dark:bg-white/[0.06]"
        role="img"
        aria-label={`${usdMicros(budget.spentMicros)} of ${usdMicros(budget.capMicros)} spent`}
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
  const [state, setState] = useState<"idle" | "checking" | "wrong">("idle");
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
    } catch {
      setState("wrong");
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
        IQM Garnet cost?
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
              if (state === "wrong") setState("idle");
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
          Not quite. Recompute: <span className="tabular-nums">$0.30 per task + $0.00145 × {shots.toLocaleString("en-US")} shots</span>.
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

  const cents = useMemo(() => costCents(shots), [shots]);
  const remainingCents = Math.round(budget.remainingMicros / 10_000);
  const overBudget = cents > remainingCents;
  const validShots = Number.isInteger(shots) && shots >= 1 && shots <= MAX_SHOTS;
  const canSubmit = validShots && qasm.trim() !== "" && !overBudget;

  const doSubmit = async () => {
    setPhase("submitting");
    setOutcome(null);
    const res = await submitTask(shots, qasm);
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
      setPhase("form");
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
            setPhase("form");
            setOutcome(null);
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
        onChange={(e) => {
          setQasm(e.target.value);
          setPhase("form");
        }}
        rows={Math.max(4, qasm.split("\n").length)}
        className="mt-2 w-full rounded-control border border-gray-200 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-900/50 px-3 py-2.5 font-mono text-sm text-gray-800 dark:text-gray-200 focus-ring resize-y"
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
          onChange={(e) => {
            setShots(Math.floor(Number(e.target.value)));
            setPhase("form");
          }}
          className="w-24 rounded-control border border-gray-200 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-900/50 px-2 py-1.5 font-mono text-sm text-gray-900 dark:text-gray-100 focus-ring tabular-nums"
        />
        <span className="text-xs text-caption">max {MAX_SHOTS.toLocaleString("en-US")}</span>
      </div>

      {/* The itemized cost — the honest breakdown, always shown. */}
      <CostBreakdown shots={shots} cents={cents} />

      {overBudget && (
        <p role="status" className="mt-2 text-xs text-red-700 dark:text-red-300">
          This run ({usd(cents)}) is more than your remaining budget ({usd(remainingCents)}).
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
          onClick={() => setPhase("confirm")}
          className="mt-4 inline-flex items-center rounded-control border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-800 dark:text-gray-100 interactive focus-ring disabled:opacity-50"
        >
          Review this run
        </button>
      ) : (
        <div className="mt-4 rounded-control border border-accent/40 bg-accent/[0.06] px-4 py-3 animate-fade-up">
          <p className="text-sm text-gray-800 dark:text-gray-100">
            This spends <span className="font-semibold tabular-nums">{usd(cents)}</span> of your{" "}
            <span className="tabular-nums">{usd(remainingCents)}</span> budget on a real,
            irreversible run on the physical device. It cannot be undone once submitted.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={phase === "submitting" || !canSubmit}
              onClick={doSubmit}
              className="inline-flex items-center rounded-control surface-accent px-4 py-2 text-sm font-semibold interactive focus-ring disabled:opacity-50 tabular-nums"
            >
              {phase === "submitting" ? "Submitting…" : `Submit to real hardware — ${usd(cents)}`}
            </button>
            <button
              type="button"
              onClick={() => setPhase("form")}
              className="inline-flex items-center rounded-control border border-gray-200 dark:border-gray-700/50 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 interactive focus-ring"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CostBreakdown({ shots, cents }: { shots: number; cents: number }) {
  return (
    <dl className="mt-3 rounded-control bg-gray-50 dark:bg-white/[0.03] px-3 py-2.5 text-sm">
      <div className="flex justify-between">
        <dt className="text-gray-600 dark:text-gray-400">Task fee</dt>
        <dd className="tabular-nums text-gray-800 dark:text-gray-200">$0.30</dd>
      </div>
      <div className="mt-1 flex justify-between">
        <dt className="text-gray-600 dark:text-gray-400">
          Shots — $0.00145 × {shots.toLocaleString("en-US")}
        </dt>
        <dd className="tabular-nums text-gray-800 dark:text-gray-200">
          {usd(Math.max(0, cents - 30))}
        </dd>
      </div>
      <div className="mt-2 flex justify-between border-t border-gray-200/70 dark:border-white/[0.08] pt-2">
        <dt className="font-medium text-gray-900 dark:text-white">Total to the device</dt>
        <dd className="font-semibold tabular-nums text-gray-900 dark:text-white">{usd(cents)}</dd>
      </div>
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
              <span className="tabular-nums text-gray-500 dark:text-gray-400">{usdMicros(t.estMicros)}</span>
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
    default:
      return status === 402
        ? "Budget reached."
        : "That run couldn't be submitted. Your budget was not charged.";
  }
}
