/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { readFileSync } from "fs";
import path from "path";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

jest.mock("@/lib/qpu-client", () => ({
  __esModule: true,
  isQpuConfigured: jest.fn(() => true),
  NotSignedInError: class NotSignedInError extends Error {},
  getBudget: jest.fn(),
  getCredentialChallenge: jest.fn(),
  claimCredential: jest.fn(),
  submitTask: jest.fn(),
}));

import * as client from "@/lib/qpu-client";
import { PRICING, estimateCost } from "@/components/quantum/cost";
import {
  QpuSubmitPanel,
  IQM_TASK_MICROS,
  IQM_SHOT_MICROS,
  costMicros,
  maxShotsAffordable,
  usd,
} from "@/components/quantum/qpu-submit-panel";

// Every expected dollar figure below is DERIVED from a locked source, never
// hardcoded: a hardcoded "$0.74" would stay green while the panel drifted from a
// reprice and go red on the correct fix — an inverted tripwire. Rates come from the
// pricing table (cost.ts, parity-locked to lib/utils/cost.py); the sponsored CAP
// comes from the shared ladder fixture, which lambda/qpu/qpu-core.test.mjs locks to
// the real LIFETIME_CAP_MICROS. So neither side hand-copies the other's numbers.
const LADDER = JSON.parse(
  readFileSync(
    path.join(__dirname, "../../../../lambda/qpu/__fixtures__/hardware-ladder.json"),
    "utf8",
  ),
) as { lifetimeCapMicros: number; maxShots: number };

const CAP = LADDER.lifetimeCapMicros; // $2.50 today — derived, so a cap change lands here
const MAX_SHOTS = LADDER.maxShots; // 1,000 — and it IS the Deep sample threshold

const centsOf = (v: number) => Math.round(v * 100 + 1e-7);
/** The server's component-wise cent settlement for the credential challenge
 *  (qpu-core.mjs correctCents / cost-estimate-grade.ts). */
const challengeCents = (shots: number) =>
  centsOf(PRICING.IQM.perTask) + centsOf(PRICING.IQM.perShot * shots);

const budget = (over: Partial<Record<string, unknown>> = {}) => ({
  capMicros: CAP,
  spentMicros: 0,
  remainingMicros: CAP,
  credentialed: true,
  completedRuns: 0,
  completedShots: 0,
  tasks: [],
  ...over,
});
const challenge = (over = {}) => ({
  credentialed: true,
  requiredShots: 300,
  requiredTasks: 1,
  device: "iqm_garnet",
  ...over,
});

const m = client as jest.Mocked<typeof client>;

/**
 * THE REGRESSION GUARD — the whole point of this change.
 *
 * The platform pays; the learner never does. So the panel may never tell a learner
 * they pay or were charged. The ONE permitted use of "charged" is the SponsorNote's
 * own negation ("You are never charged"), so every occurrence must be that one. The
 * noun "charge" ("the exact Amazon Braket charge") is fine and deliberate — the payer
 * there is explicitly the platform.
 */
function expectNeverSaysTheLearnerPays() {
  const text = document.body.textContent ?? "";
  expect(text).not.toMatch(/you pay/i);
  expect(text).not.toMatch(/\bnot charged\b/i); // "your budget was not charged"
  expect(text).not.toMatch(/double-charge/i);
  expect(text).not.toMatch(/every cent runs your circuit/i);
  expect(text).not.toMatch(/that's a lot of real hardware runs/i);
  // NB: "the exact Amazon Braket price" is APPROVED copy and must NOT be banned —
  // in the SponsorNote its subject is the PLATFORM's AWS account ("Every run bills
  // the platform's AWS account at the exact Amazon Braket price"). The lie was the
  // old subject: "YOU PAY the exact Amazon Braket price", which /you pay/i catches.
  // Any surviving "charged" must be the negated one.
  for (const match of text.matchAll(/\S+\s+\S*charged/gi)) {
    expect(match[0]).toMatch(/never charged/i);
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  (m.isQpuConfigured as jest.Mock).mockReturnValue(true);
});

test("renders nothing until NEXT_PUBLIC_QPU_URL is configured", () => {
  (m.isQpuConfigured as jest.Mock).mockReturnValue(false);
  const { container } = render(<QpuSubmitPanel />);
  expect(container).toBeEmptyDOMElement();
});

test("the panel's rates derive from PRICING and settle to the kernel's exact cents", () => {
  expect(IQM_TASK_MICROS).toBe(Math.round(PRICING.IQM.perTask * 1_000_000));
  expect(IQM_SHOT_MICROS).toBe(Math.round(PRICING.IQM.perShot * 1_000_000));
  for (let shots = 1; shots <= MAX_SHOTS; shots++) {
    expect(Math.round(costMicros(shots) / 10_000)).toBe(centsOf(estimateCost("IQM", shots, 0)));
  }
});

// ---- the frontier ----------------------------------------------------------
describe("maxShotsAffordable — the frontier that decides if Deep sample is reachable", () => {
  it("concentrates shots into fewer runs until MAX_SHOTS binds", () => {
    expect(maxShotsAffordable(CAP)).toBe(1310); // 2 runs: 1000 + 310
    expect(maxShotsAffordable(costMicros(MAX_SHOTS))).toBe(MAX_SHOTS); // exactly one maxed run
  });

  it("returns 0 for any budget that cannot buy even a 1-shot run", () => {
    expect(maxShotsAffordable(costMicros(1))).toBe(1); // exactly enough
    expect(maxShotsAffordable(costMicros(1) - 1)).toBe(0);
    expect(maxShotsAffordable(IQM_TASK_MICROS)).toBe(0); // the task fee alone buys nothing
    expect(maxShotsAffordable(0)).toBe(0);
  });

  it("is never an over-estimate: the frontier is always actually affordable", () => {
    // Property check — the number the UI promises must be a number the server accepts.
    for (let rem = 0; rem <= CAP; rem += 7_919) {
      const shots = maxShotsAffordable(rem);
      if (shots === 0) continue;
      const runs = Math.ceil(shots / MAX_SHOTS);
      expect(IQM_TASK_MICROS * runs + IQM_SHOT_MICROS * shots).toBeLessThanOrEqual(rem);
    }
  });

  it("the 3-run cliff is real: three default 100-shot runs foreclose Deep sample", () => {
    // This is the lesson, disclosed rather than padded away. After k naive runs the
    // learner has k*100 shots banked and maxShotsAffordable(left) still to come.
    const after = (k: number) => k * 100 + maxShotsAffordable(CAP - k * costMicros(100));
    expect(after(0)).toBeGreaterThanOrEqual(MAX_SHOTS);
    expect(after(2)).toBeGreaterThanOrEqual(MAX_SHOTS); // still reachable
    expect(after(3)).toBeLessThan(MAX_SHOTS); // FORECLOSED
  });
});

// ---- who pays --------------------------------------------------------------
test("states plainly that the PLATFORM pays and the learner is never charged", async () => {
  m.getBudget.mockResolvedValue(budget());
  m.getCredentialChallenge.mockResolvedValue(challenge());
  render(<QpuSubmitPanel />);
  expect(await screen.findByText(/the platform pays for these runs/i)).toBeInTheDocument();
  expect(screen.getByText(/you are never charged/i)).toBeInTheDocument();
  expect(screen.getByText(/no markup/i)).toBeInTheDocument();
  expect(screen.getByText(/an allowance we fund, not an invoice/i)).toBeInTheDocument();
  // The quoted rate line derives from PRICING, so a reprice updates the prose.
  expect(
    screen.getByText(`${usd(IQM_TASK_MICROS)} per task + $${PRICING.IQM.perShot} per shot`),
  ).toBeInTheDocument();
  expectNeverSaysTheLearnerPays();
});

test("NEVER tells the learner they pay — in the signed-out state", async () => {
  m.getBudget.mockRejectedValue(new client.NotSignedInError());
  m.getCredentialChallenge.mockRejectedValue(new client.NotSignedInError());
  render(<QpuSubmitPanel />);
  await screen.findByText(/sign in to your workspace/i);
  // The SponsorNote is device/pricing fact, not user state — it renders here too.
  expect(screen.getByText(/the platform pays for these runs/i)).toBeInTheDocument();
  expectNeverSaysTheLearnerPays();
});

test("NEVER tells the learner they pay — in the uncredentialed gate state", async () => {
  m.getBudget.mockResolvedValue(budget({ credentialed: false }));
  m.getCredentialChallenge.mockResolvedValue(challenge({ credentialed: false }));
  render(<QpuSubmitPanel />);
  await screen.findByText(/one step before your first run/i);
  // Naming whose money it is makes the gate MORE compelling, not less.
  expect(screen.getByText(/real hardware costs real money — ours/i)).toBeInTheDocument();
  expectNeverSaysTheLearnerPays();
});

// ---- the budget bar + the live frontier -------------------------------------
test("shows the remaining sponsored budget against the learner's OWN cap", async () => {
  const spent = costMicros(MAX_SHOTS);
  m.getBudget.mockResolvedValue(budget({ spentMicros: spent, remainingMicros: CAP - spent }));
  m.getCredentialChallenge.mockResolvedValue(challenge());
  render(<QpuSubmitPanel />);
  expect(await screen.findByText(usd(CAP - spent))).toBeInTheDocument();
  expect(screen.getByText(new RegExp(`of \\${usd(CAP)} left`, "i"))).toBeInTheDocument();
});

test("a GRANDFATHERED learner sees THEIR cap, never a hardcoded one", async () => {
  // qpu-core.mjs stamps capMicros with if_not_exists, so a learner who submitted
  // under the old $5.00 allowance keeps it forever. Every figure must derive from
  // budget.capMicros — a hardcoded "$2.50" would be a lie to this user.
  const OLD_CAP = 5_000_000;
  m.getBudget.mockResolvedValue(
    budget({ capMicros: OLD_CAP, spentMicros: 0, remainingMicros: OLD_CAP }),
  );
  m.getCredentialChallenge.mockResolvedValue(challenge());
  render(<QpuSubmitPanel />);
  expect(await screen.findByText(/of \$5\.00 left/i)).toBeInTheDocument();
  expect(screen.queryByText(new RegExp(`of \\${usd(CAP)} left`, "i"))).not.toBeInTheDocument();
});

test("the budget bar states the live frontier — the most shots still buyable", async () => {
  m.getBudget.mockResolvedValue(budget());
  m.getCredentialChallenge.mockResolvedValue(challenge());
  render(<QpuSubmitPanel />);
  await screen.findByText("Sponsored QPU budget");
  // The figure sits in its own tabular-nums span, so assert across descendants.
  const panel = screen.getByLabelText("Run on real quantum hardware");
  const frontier = maxShotsAffordable(CAP).toLocaleString("en-US");
  expect(panel).toHaveTextContent(new RegExp(`Enough for ${frontier} more shots`, "i"));
  // And it names the flat fee, which is the whole reason the frontier isn't linear.
  expect(screen.getByText(/before a single shot fires/i)).toBeInTheDocument();
});

// ---- the guide (the "clarity is paramount" surface) -------------------------
test("the budget guide teaches the flat-fee lesson with derived, honest figures", async () => {
  m.getBudget.mockResolvedValue(budget());
  m.getCredentialChallenge.mockResolvedValue(challenge());
  render(<QpuSubmitPanel />);
  expect(await screen.findByText(/how the sponsored budget works/i)).toBeInTheDocument();

  // The teaching identity: the SAME 1,000 shots, bought two ways.
  const concentrated = usd(costMicros(MAX_SHOTS)); // $1.75
  const split = usd(10 * costMicros(MAX_SHOTS / 10)); // $4.45 — ten 100-shot runs
  const guide = screen.getByText(/how the sponsored budget works/i).closest("details")!;
  expect(guide).toHaveTextContent(concentrated);
  expect(guide).toHaveTextContent(split);
  expect(guide).toHaveTextContent(usd(CAP)); // and the learner's own budget, adjacent
  // The plan that earns all three medals: 3 runs totalling 1,000 shots.
  expect(guide).toHaveTextContent(usd(3 * IQM_TASK_MICROS + IQM_SHOT_MICROS * MAX_SHOTS)); // $2.35
  // The buying-them-badly way costs MORE than the whole allowance — the learner is
  // shown both numbers and left to do the subtraction (true for any cap).
  expect(10 * costMicros(MAX_SHOTS / 10)).toBeGreaterThan(CAP);
});

// ---- the submit form --------------------------------------------------------
test("the shots hint prices the maxed run, which is now the OPTIMAL play", async () => {
  m.getBudget.mockResolvedValue(budget());
  m.getCredentialChallenge.mockResolvedValue(challenge());
  render(<QpuSubmitPanel />);
  const hint = new RegExp(
    `max ${MAX_SHOTS.toLocaleString("en-US")}.*${MAX_SHOTS.toLocaleString("en-US")}-shot run costs \\${usd(costMicros(MAX_SHOTS))}`,
    "i",
  );
  expect(await screen.findByText(hint)).toBeInTheDocument();
});

test("credentialed: itemized cost + a two-step confirm that submits to real hardware", async () => {
  m.getBudget.mockResolvedValue(budget());
  m.getCredentialChallenge.mockResolvedValue(challenge());
  m.submitTask.mockResolvedValue({
    ok: true,
    taskArn: "arn:aws:braket:eu-north-1:1:quantum-task/xyz",
    estMicros: costMicros(100),
  });
  render(<QpuSubmitPanel />);
  expect(await screen.findByText("Total to the device")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /review this run/i }));
  expect(screen.getByText(/real, irreversible run on the physical device/i)).toBeInTheDocument();
  // The CTA says SPENDS, not a bare "— $0.45" (the grammar of being charged).
  const submit = screen.getByRole("button", {
    name: `Submit to real hardware — spends ${usd(costMicros(100))}`,
  });
  await act(async () => {
    fireEvent.click(submit);
  });
  expect(m.submitTask).toHaveBeenCalledWith(100, expect.stringContaining("OPENQASM"), expect.any(String));
  expect(await screen.findByText(/submitted to iqm garnet — task xyz/i)).toBeInTheDocument();
});

test("the confirm step shows the frontier AFTER this run — the cliff, before the click", async () => {
  m.getBudget.mockResolvedValue(budget());
  m.getCredentialChallenge.mockResolvedValue(challenge());
  render(<QpuSubmitPanel />);
  fireEvent.click(await screen.findByRole("button", { name: /review this run/i }));
  const after = CAP - costMicros(100);
  const shots = maxShotsAffordable(after).toLocaleString("en-US");
  expect(
    screen.getByText(
      new RegExp(`after this run: \\${usd(after)} left — enough for\\s*${shots}\\s*more shots`, "i"),
    ),
  ).toBeInTheDocument();
});

test("the confirm step says plainly when a run leaves too little for another", async () => {
  // Enough for exactly this run, and nothing after it.
  const remaining = costMicros(100);
  m.getBudget.mockResolvedValue(
    budget({ spentMicros: CAP - remaining, remainingMicros: remaining }),
  );
  m.getCredentialChallenge.mockResolvedValue(challenge());
  render(<QpuSubmitPanel />);
  fireEvent.click(await screen.findByRole("button", { name: /review this run/i }));
  expect(screen.getByText(/not enough for another run/i)).toBeInTheDocument();
});

test("a run that costs more than the remaining budget can't be reviewed, and says what fits", async () => {
  const remaining = costMicros(100) - 10_000; // one cent short of the default run
  m.getBudget.mockResolvedValue(
    budget({ spentMicros: CAP - remaining, remainingMicros: remaining }),
  );
  m.getCredentialChallenge.mockResolvedValue(challenge());
  render(<QpuSubmitPanel />);
  await waitFor(() => expect(screen.getByRole("button", { name: /review this run/i })).toBeDisabled());
  const fits = maxShotsAffordable(remaining).toLocaleString("en-US");
  expect(
    screen.getByText(new RegExp(`more than your remaining budget.*covers at most ${fits} shots`, "i")),
  ).toBeInTheDocument();
});

// ---- the terminal state -----------------------------------------------------
test("a spent budget renders the terminal card with a graduation path, not a dead form", async () => {
  const remaining = costMicros(1) - 1; // cannot buy even a 1-shot run
  m.getBudget.mockResolvedValue(
    budget({
      spentMicros: CAP - remaining,
      remainingMicros: remaining,
      completedRuns: 3,
      completedShots: 1_000,
    }),
  );
  m.getCredentialChallenge.mockResolvedValue(challenge());
  render(<QpuSubmitPanel />);
  expect(await screen.findByText(/sponsored budget spent/i)).toBeInTheDocument();
  // The record survives, stated from the SERVER aggregates (truncation-proof). The
  // counts sit in tabular-nums spans, so assert across descendants.
  const panel = screen.getByLabelText("Run on real quantum hardware");
  expect(panel).toHaveTextContent(/3 completed runs on IQM Garnet, 1,000 shots/i);
  expect(panel).toHaveTextContent(/Those runs stay on your record/i);
  // The graduation path — no apology, no gratitude, no consolation.
  const link = screen.getByRole("link", { name: /run it on your own aws account/i });
  expect(link).toHaveAttribute("href", expect.stringContaining("github.com"));
  // And the dead form is GONE.
  expect(screen.queryByRole("button", { name: /review this run/i })).not.toBeInTheDocument();
  expectNeverSaysTheLearnerPays();
});

// ---- the credential gate ----------------------------------------------------
test("an uncredentialed user must price a run; a correct answer unlocks the form", async () => {
  m.getBudget.mockResolvedValueOnce(budget({ credentialed: false }));
  m.getCredentialChallenge.mockResolvedValueOnce(challenge({ credentialed: false, requiredShots: 300 }));
  m.claimCredential.mockResolvedValue({ credentialed: true });
  m.getBudget.mockResolvedValue(budget());
  m.getCredentialChallenge.mockResolvedValue(challenge());

  render(<QpuSubmitPanel />);
  expect(await screen.findByText(/one step before your first run/i)).toBeInTheDocument();
  expect(screen.getByText(/to the nearest cent/i)).toBeInTheDocument();

  const cents = challengeCents(300);
  fireEvent.change(screen.getByLabelText(/estimated cost in dollars/i), {
    target: { value: (cents / 100).toFixed(2) },
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /unlock hardware access/i }));
  });
  expect(m.claimCredential).toHaveBeenCalledWith(cents);
  expect(await screen.findByLabelText(/circuit \(openqasm/i)).toBeInTheDocument();
});

test("a wrong price (server 200 {credentialed:false}) gets the recompute hint, without unlocking", async () => {
  m.getBudget.mockResolvedValue(budget({ credentialed: false }));
  m.getCredentialChallenge.mockResolvedValue(challenge({ credentialed: false, requiredShots: 300 }));
  m.claimCredential.mockResolvedValue({ credentialed: false });
  render(<QpuSubmitPanel />);
  await screen.findByText(/one step before your first run/i);
  fireEvent.change(screen.getByLabelText(/estimated cost in dollars/i), { target: { value: "9.99" } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /unlock hardware access/i }));
  });
  expect(await screen.findByText(/not quite/i)).toBeInTheDocument();
  expect(screen.getByText(/rounded to the nearest cent/i)).toBeInTheDocument();
  expect(screen.queryByLabelText(/circuit \(openqasm/i)).not.toBeInTheDocument();
});

test("an expired session during the price check says so — NEVER 'Not quite'", async () => {
  m.getBudget.mockResolvedValue(budget({ credentialed: false }));
  m.getCredentialChallenge.mockResolvedValue(challenge({ credentialed: false, requiredShots: 300 }));
  m.claimCredential.mockRejectedValue(new client.NotSignedInError());
  render(<QpuSubmitPanel />);
  await screen.findByText(/one step before your first run/i);
  fireEvent.change(screen.getByLabelText(/estimated cost in dollars/i), { target: { value: "0.74" } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /unlock hardware access/i }));
  });
  expect(await screen.findByRole("alert")).toHaveTextContent(/session expired\. sign in again/i);
  expect(screen.queryByText(/not quite/i)).not.toBeInTheDocument();
});

test("an unreachable service during the price check says so — NEVER 'Not quite'", async () => {
  m.getBudget.mockResolvedValue(budget({ credentialed: false }));
  m.getCredentialChallenge.mockResolvedValue(challenge({ credentialed: false, requiredShots: 300 }));
  m.claimCredential.mockRejectedValue(new TypeError("Failed to fetch"));
  render(<QpuSubmitPanel />);
  await screen.findByText(/one step before your first run/i);
  fireEvent.change(screen.getByLabelText(/estimated cost in dollars/i), { target: { value: "0.74" } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /unlock hardware access/i }));
  });
  expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't reach the hardware service/i);
  expect(screen.queryByText(/not quite/i)).not.toBeInTheDocument();
});

// ---- one price, one key -----------------------------------------------------
test("a 300-shot run shows ONE price across preview, button, and history", async () => {
  const est = costMicros(300);
  const rounded = usd(est);
  const truncated = `$${(Math.floor(est / 10_000) / 100).toFixed(2)}`;
  m.getBudget.mockResolvedValue(
    budget({
      tasks: [
        { idempotencyKey: "k", device: "iqm_garnet", shots: 300, estMicros: est, status: "SUBMITTED", taskArn: null, circuitHash: null, createdAt: 1 },
      ],
    }),
  );
  m.getCredentialChallenge.mockResolvedValue(challenge());
  render(<QpuSubmitPanel />);
  fireEvent.change(await screen.findByLabelText("Shots"), { target: { value: "300" } });
  fireEvent.click(screen.getByRole("button", { name: /review this run/i }));
  expect(
    screen.getByRole("button", { name: `Submit to real hardware — spends ${rounded}` }),
  ).toBeInTheDocument();
  const history = screen.getByRole("heading", { name: "Run history" }).closest("div")!;
  expect(history).toHaveTextContent(rounded);
  if (truncated !== rounded) expect(history).not.toHaveTextContent(truncated);
});

test("submitTask reuses ONE idempotency key across a retry of the same run", async () => {
  m.getBudget.mockResolvedValue(budget());
  m.getCredentialChallenge.mockResolvedValue(challenge());
  m.submitTask
    .mockResolvedValueOnce({ ok: false, status: 503, error: "over-daily-budget" })
    .mockResolvedValueOnce({ ok: true, taskArn: "arn:x/y", estMicros: costMicros(100) });
  render(<QpuSubmitPanel />);
  fireEvent.click(await screen.findByRole("button", { name: /review this run/i }));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /submit to real hardware/i }));
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /submit to real hardware/i }));
  });
  const firstKey = (m.submitTask.mock.calls[0] as unknown[])[2];
  const retryKey = (m.submitTask.mock.calls[1] as unknown[])[2];
  expect(firstKey).toBe(retryKey); // same intent → same key → server dedupes
});

// ---- outcomes: every message is true of the code as written ------------------
test("a network throw does NOT claim the budget is untouched, and keeps the key for a safe retry", async () => {
  m.getBudget.mockResolvedValue(budget());
  m.getCredentialChallenge.mockResolvedValue(challenge());
  m.submitTask
    .mockRejectedValueOnce(new TypeError("Failed to fetch"))
    .mockResolvedValueOnce({ ok: true, taskArn: "arn:x/y", estMicros: costMicros(100) });
  render(<QpuSubmitPanel />);
  fireEvent.click(await screen.findByRole("button", { name: /review this run/i }));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /submit to real hardware/i }));
  });
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent(/couldn't confirm this run/i);
  expect(alert).toHaveTextContent(/will not double-spend your budget/i);
  expect(screen.queryByText(/no budget was spent/i)).not.toBeInTheDocument();
  expectNeverSaysTheLearnerPays();
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /submit to real hardware/i }));
  });
  expect((m.submitTask.mock.calls[1] as unknown[])[2]).toBe(
    (m.submitTask.mock.calls[0] as unknown[])[2],
  );
});

test("an unexplained 5xx does NOT claim the budget is untouched — the server may hold it", async () => {
  m.getBudget.mockResolvedValue(budget());
  m.getCredentialChallenge.mockResolvedValue(challenge());
  m.submitTask.mockResolvedValue({ ok: false, status: 500, error: "internal" });
  render(<QpuSubmitPanel />);
  fireEvent.click(await screen.findByRole("button", { name: /review this run/i }));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /submit to real hardware/i }));
  });
  expect(await screen.findByText(/couldn't confirm this run/i)).toBeInTheDocument();
  expect(screen.queryByText(/no budget was spent/i)).not.toBeInTheDocument();
});

test("a 4xx rejection truthfully says NO BUDGET WAS SPENT (never 'not charged')", async () => {
  m.getBudget.mockResolvedValue(budget());
  m.getCredentialChallenge.mockResolvedValue(challenge());
  m.submitTask.mockResolvedValue({ ok: false, status: 400, error: "qasm exceeds 7000 bytes" });
  render(<QpuSubmitPanel />);
  fireEvent.click(await screen.findByRole("button", { name: /review this run/i }));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /submit to real hardware/i }));
  });
  expect(await screen.findByText(/no budget was spent/i)).toBeInTheDocument();
  expectNeverSaysTheLearnerPays();
});

test("a 502 braket-submit-failed says the hold was released — the one refunded 5xx", async () => {
  m.getBudget.mockResolvedValue(budget());
  m.getCredentialChallenge.mockResolvedValue(challenge());
  m.submitTask.mockResolvedValue({ ok: false, status: 502, error: "braket-submit-failed" });
  render(<QpuSubmitPanel />);
  fireEvent.click(await screen.findByRole("button", { name: /review this run/i }));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /submit to real hardware/i }));
  });
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent(/hold was released/i);
  expect(alert).toHaveTextContent(/no budget was spent/i);
});

test("a 402 names the learner's OWN cap and re-fetches so the panel isn't a dead form", async () => {
  m.getBudget.mockResolvedValue(budget());
  m.getCredentialChallenge.mockResolvedValue(challenge());
  m.submitTask.mockResolvedValue({ ok: false, status: 402, error: "over-lifetime-budget" });
  render(<QpuSubmitPanel />);
  fireEvent.click(await screen.findByRole("button", { name: /review this run/i }));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /submit to real hardware/i }));
  });
  expect(
    await screen.findByText(
      new RegExp(`sponsored lifetime budget \\(\\${usd(CAP)}\\) is spent`, "i"),
    ),
  ).toBeInTheDocument();
  // The 402 must re-fetch the budget (getBudget is called again) so the panel can
  // flip to the terminal BudgetSpent card instead of stranding a dead form.
  await waitFor(() => expect(m.getBudget).toHaveBeenCalledTimes(2));
  expectNeverSaysTheLearnerPays();
});
