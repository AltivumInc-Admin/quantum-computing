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
  // The REAL classifier: it is pure (navigator + instanceof), and mocking it
  // would let these tests pass while the classification itself rotted. Same for the
  // two rate-limit predicates and the error class they key on — a stubbed
  // isRateLimited would let the panel render the wait-a-minute copy for a 500.
  classifySubmitFailure: (jest.requireActual("@/lib/qpu-client") as typeof import("@/lib/qpu-client"))
    .classifySubmitFailure,
  isRateLimited: (jest.requireActual("@/lib/qpu-client") as typeof import("@/lib/qpu-client"))
    .isRateLimited,
  isRateLimitedOutcome: (jest.requireActual("@/lib/qpu-client") as typeof import("@/lib/qpu-client"))
    .isRateLimitedOutcome,
  QpuHttpError: (jest.requireActual("@/lib/qpu-client") as typeof import("@/lib/qpu-client"))
    .QpuHttpError,
}));

import * as client from "@/lib/qpu-client";
import { PRICING, estimateCost } from "@/components/quantum/cost";
import { LocaleProvider, translate } from "@/i18n";
import {
  QpuSubmitPanel,
  IQM_TASK_MICROS,
  IQM_SHOT_MICROS,
  costMicros,
  maxShotsAffordable,
  usd,
  REPO_URL,
  README_QUICKSTART_ANCHOR,
} from "@/components/quantum/qpu-submit-panel";

// Every expected dollar figure below is DERIVED from a locked source, never
// hardcoded: a hardcoded "$0.74" would stay green while the panel drifted from a
// reprice and go red on the correct fix — an inverted tripwire. Rates come from the
// pricing table (cost.ts, parity-locked to lib/utils/cost.py); the sponsored CAP and
// the LADDER come from the shared fixture, which lambda/qpu/qpu-core.test.mjs locks to
// the real LIFETIME_CAP_MICROS. So neither side hand-copies the other's numbers.
//
// THE TRIPWIRE TOPOLOGY, and it only works one way round: the PANEL derives its ladder
// from HARDWARE_TIERS (web/src/lib/credentials.ts) and these tests derive theirs from
// the FIXTURE. Change a tier in the code and the rendered plan moves while the expected
// plan does not — RED. Change the fixture and credentials.test.ts goes red. The panel
// used to hand-copy both numbers, so a tier change reddened the Lambda's feasibility
// lock and the credential suite but NOT the surface that teaches the plan: it would
// have shipped a stale, wrong plan on the one screen whose job is cost optimality.
const LADDER = JSON.parse(
  readFileSync(
    path.join(__dirname, "../../../../lambda/qpu/__fixtures__/hardware-ladder.json"),
    "utf8",
  ),
) as {
  lifetimeCapMicros: number;
  maxShots: number;
  tiers: { n: number; title: string; metric: "runs" | "shots" }[];
  cheapestPath: { runs: number; shots: number; costMicros: number };
};

const CAP = LADDER.lifetimeCapMicros; // $2.50 today — derived, so a cap change lands here
const MAX_SHOTS = LADDER.maxShots; // 1,000 — and it IS the Deep sample threshold
const RUN_TIERS = LADDER.tiers.filter((t) => t.metric === "runs");
const SHOT_TIERS = LADDER.tiers.filter((t) => t.metric === "shots");
const LADDER_RUNS = Math.max(...RUN_TIERS.map((t) => t.n)); // 3 — "Run series"
const DEEP_SHOTS = Math.max(...SHOT_TIERS.map((t) => t.n)); // 1,000 — "Deep sample"
const DEEP_TITLE = SHOT_TIERS.find((t) => t.n === DEEP_SHOTS)!.title;
const LADDER_MICROS = IQM_TASK_MICROS * LADDER_RUNS + IQM_SHOT_MICROS * DEEP_SHOTS; // $2.35

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
  // The Spanish tests below store a locale preference; clear it so it cannot leak
  // into the English assertions that make up the rest of this file.
  localStorage.clear();
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
  // The figure appears in the bar AND (once it binds) in the guide's plan verdict, so
  // pin it to the bar itself rather than to the document.
  const bar = await screen.findByRole("progressbar");
  expect(bar).toHaveAttribute("aria-valuetext", `${usd(CAP - spent)} of ${usd(CAP)} left`);
  expect(screen.getAllByText(usd(CAP - spent)).length).toBeGreaterThan(0);
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
  await screen.findByText("Lifetime sponsored QPU budget");
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

test("the guide STATES its killer fact and is OPEN until the learner has run", async () => {
  // It was collapsed by default, with the punchline buried in row two of a table. A
  // learner who has never run has everything to lose, so it opens for them.
  m.getBudget.mockResolvedValue(budget());
  m.getCredentialChallenge.mockResolvedValue(challenge());
  render(<QpuSubmitPanel />);
  const guide = (await screen.findByText(/how the sponsored budget works/i)).closest("details")!;
  expect(guide).toHaveAttribute("open");
  expect(guide).toHaveTextContent(
    new RegExp(
      `Ten 100-shot runs cost \\${usd(10 * costMicros(100))} — more than your entire \\${usd(CAP)} lifetime budget`,
      "i",
    ),
  );
});

test("the guide collapses once the learner has completed a run", async () => {
  m.getBudget.mockResolvedValue(
    budget({ completedRuns: 1, completedShots: 100, remainingMicros: CAP - costMicros(100) }),
  );
  m.getCredentialChallenge.mockResolvedValue(challenge());
  render(<QpuSubmitPanel />);
  const guide = (await screen.findByText(/how the sponsored budget works/i)).closest("details")!;
  expect(guide).not.toHaveAttribute("open");
});

test("a GRANDFATHERED learner is never told $4.45 is 'more than your budget' — it isn't", async () => {
  // The comparative is derived, not asserted: ten 100-shot runs fit inside a $5.00 cap.
  const OLD_CAP = 5_000_000;
  m.getBudget.mockResolvedValue(
    budget({ capMicros: OLD_CAP, spentMicros: 0, remainingMicros: OLD_CAP }),
  );
  m.getCredentialChallenge.mockResolvedValue(challenge());
  render(<QpuSubmitPanel />);
  const guide = (await screen.findByText(/how the sponsored budget works/i)).closest("details")!;
  expect(10 * costMicros(100)).toBeLessThan(OLD_CAP); // the premise
  expect(guide).toHaveTextContent(
    new RegExp(`Ten 100-shot runs cost \\${usd(10 * costMicros(100))} of your \\$5\\.00 lifetime budget`, "i"),
  );
  expect(guide).not.toHaveTextContent(/more than your entire/i);
});

test("the guide's plan is the DERIVED ladder plan, from where the learner stands", async () => {
  // Expected values come from the FIXTURE; the panel renders from HARDWARE_TIERS. A
  // tier change moves one and not the other — RED.
  m.getBudget.mockResolvedValue(budget());
  m.getCredentialChallenge.mockResolvedValue(challenge());
  render(<QpuSubmitPanel />);
  const guide = (await screen.findByText(/how the sponsored budget works/i)).closest("details")!;
  expect(guide).toHaveTextContent(
    new RegExp(
      `A plan that fits: ${LADDER_RUNS} runs totalling ${DEEP_SHOTS.toLocaleString("en-US")} shots — \\${usd(LADDER_MICROS)}`,
      "i",
    ),
  );
  expect(LADDER_MICROS).toBe(LADDER.cheapestPath.costMicros); // and it IS the advertised plan
});

test("the guide STOPS advertising a plan the learner can no longer afford", async () => {
  // It used to assert "A plan that fits: 3 runs totalling 1,000 shots — $2.35" to a
  // learner holding $1.16 — the same defect class as the unearnable medal: a promise
  // the money contradicts.
  const remaining = CAP - 3 * costMicros(100);
  m.getBudget.mockResolvedValue(
    budget({
      completedRuns: 3,
      completedShots: 300,
      spentMicros: CAP - remaining,
      remainingMicros: remaining,
    }),
  );
  m.getCredentialChallenge.mockResolvedValue(challenge());
  render(<QpuSubmitPanel />);
  const guide = (await screen.findByText(/how the sponsored budget works/i)).closest("details")!;
  expect(guide).toHaveTextContent(/All three medals no longer fit your remaining budget/i);
  expect(guide).toHaveTextContent(usd(remaining)); // and names what IS left
  expect(guide).not.toHaveTextContent(/A plan that fits/i);
});

test("the guide's table has column headers and a caption describing ALL THREE rows", async () => {
  m.getBudget.mockResolvedValue(budget());
  m.getCredentialChallenge.mockResolvedValue(challenge());
  render(<QpuSubmitPanel />);
  await screen.findByText(/how the sponsored budget works/i);
  const headers = screen.getAllByRole("columnheader");
  expect(headers.map((h) => h.textContent)).toEqual(["How the shots are bought", "Cost"]);
  // The old caption ("Cost of 1,000 shots, bought two ways") described 2 of 3 rows —
  // and the third row is the punchline (your whole budget).
  expect(screen.getByRole("table")).toHaveAccessibleName(
    /against your whole lifetime sponsored budget/i,
  );
});

// ---- LIFETIME: said before the money is gone, not only in the error after -----
test("says LIFETIME where the number lives — the bar heading and the sponsor note", async () => {
  // Newcomers arrive assuming budgets refill (monthly credits, free tiers). The word
  // used to appear ONLY in the over-budget error, i.e. after the money was gone.
  m.getBudget.mockResolvedValue(budget());
  m.getCredentialChallenge.mockResolvedValue(challenge());
  render(<QpuSubmitPanel />);
  expect(await screen.findByText("Lifetime sponsored QPU budget")).toBeInTheDocument();
  expect(screen.getByText(/one lifetime allowance per learner, not a monthly credit/i)).toBeInTheDocument();
  expect(screen.getByText(/it does not refill/i)).toBeInTheDocument();
});

test("the budget track is a progressbar whose aria-valuetext IS the visible figure", async () => {
  // The old track was role="img", labelled in the OPPOSITE framing to the text beside
  // it ("$1.34 of $2.50 spent" vs "$1.16 of $2.50 left") — two numbers off one bar.
  const spent = costMicros(MAX_SHOTS);
  m.getBudget.mockResolvedValue(budget({ spentMicros: spent, remainingMicros: CAP - spent }));
  m.getCredentialChallenge.mockResolvedValue(challenge());
  render(<QpuSubmitPanel />);
  const bar = await screen.findByRole("progressbar");
  const visible = `${usd(CAP - spent)} of ${usd(CAP)} left`;
  expect(bar).toHaveAttribute("aria-valuetext", visible);
  expect(bar).toHaveAttribute("aria-valuenow", String(CAP - spent));
  expect(bar).toHaveAttribute("aria-valuemax", String(CAP));
  expect(bar.getAttribute("aria-valuetext")).not.toMatch(/spent/i); // never the inverted framing
});

// ---- the ladder, on the surface where the money is spent ---------------------
test("the budget bar carries the medal ladder, single-sourced and derived", async () => {
  // Without this the frontier caption is uninterpretable: "enough for 1,310 more
  // shots" means nothing unless you can see that 1,000 of them is a medal. Every
  // title and threshold is asserted from the FIXTURE while the panel renders from
  // HARDWARE_TIERS — so a tier edit reddens here instead of shipping a stale ladder.
  m.getBudget.mockResolvedValue(
    budget({
      completedRuns: 1,
      completedShots: 300,
      spentMicros: costMicros(300),
      remainingMicros: CAP - costMicros(300),
    }),
  );
  m.getCredentialChallenge.mockResolvedValue(challenge());
  render(<QpuSubmitPanel />);
  await screen.findByText("Lifetime sponsored QPU budget"); // wait out the fetch
  const panel = screen.getByLabelText("Run on real quantum hardware");
  for (const t of LADDER.tiers) {
    const value = t.metric === "shots" ? 300 : 1;
    const unit = t.metric === "shots" ? "shots" : `run${t.n === 1 ? "" : "s"}`;
    expect(panel).toHaveTextContent(
      new RegExp(
        `${t.title}:\\s*${Math.min(value, t.n).toLocaleString("en-US")} of ${t.n.toLocaleString("en-US")}\\s*${unit}`,
        "i",
      ),
    );
  }
});

// ---- the production defect: a budget with NO medal counters -------------------
// The deployed Lambda predated completedRuns/completedShots, so they arrived as null.
// The old panel walked that straight into the ladder arithmetic and printed "NaN of 1
// run — out of reach" on the founder's own screen: an unknown record rendered as a
// medal declared permanently lost. Unknown must read as unknown everywhere here.
describe("an unknown hardware record (older Lambda, null counters)", () => {
  const noCounters = { completedRuns: null, completedShots: null };

  it("says the record is unavailable — never 'NaN', never 'out of reach'", async () => {
    m.getBudget.mockResolvedValue(budget(noCounters));
    m.getCredentialChallenge.mockResolvedValue(challenge());
    render(<QpuSubmitPanel />);
    await screen.findByText("Lifetime sponsored QPU budget");
    const panel = screen.getByLabelText("Run on real quantum hardware");
    expect(panel).toHaveTextContent(/hardware record is unavailable/i);
    // ...and the ENGLISH reading is the dictionary's, not a module constant. The
    // sentence is unchanged for an English learner; what changed is where it comes
    // from, which is the only reason a Spanish learner can now read it too.
    expect(panel).toHaveTextContent(translate("en", "qpuUi.recordUnavailable"));
    expect(panel).not.toHaveTextContent(/NaN/);
    expect(panel).not.toHaveTextContent(/out of reach/i);
  });

  it("does not foreclose a medal it cannot measure — the confirm step stays silent", async () => {
    m.getBudget.mockResolvedValue(budget(noCounters));
    m.getCredentialChallenge.mockResolvedValue(challenge());
    render(<QpuSubmitPanel />);
    fireEvent.click(await screen.findByRole("button", { name: /review this run/i }));
    expect(screen.queryByText(/closes off/i)).not.toBeInTheDocument();
  });

  it("the SPENT card renders without inventing counts it does not have", async () => {
    m.getBudget.mockResolvedValue(
      budget({ ...noCounters, spentMicros: CAP - 1_000, remainingMicros: 1_000 }),
    );
    m.getCredentialChallenge.mockResolvedValue(challenge());
    render(<QpuSubmitPanel />);
    const spent = await screen.findByText(/sponsored budget spent/i);
    const card = spent.closest("div")!;
    expect(card).toHaveTextContent(/your completed runs stay on your record/i);
    expect(card).not.toHaveTextContent(/NaN/);
  });
});

// ---- H2/H5: the medal that can be silently foreclosed FOREVER -----------------
describe("foreclosure — the relocated bug", () => {
  // Three runs at the panel's own 100-shot default cost $1.335 of the $2.50 lifetime
  // allowance, leaving $1.165 — which buys at most 596 more shots. The learner tops
  // out at 896 of the 1,000 the top medal needs, and nothing ever told them.
  const twoRunsIn = () => {
    const remaining = CAP - 2 * costMicros(100);
    return budget({
      completedRuns: 2,
      completedShots: 200,
      spentMicros: CAP - remaining,
      remainingMicros: remaining,
    });
  };

  it("the arithmetic: reachable at two runs, foreclosed at three", () => {
    const b = twoRunsIn();
    expect(b.completedShots + maxShotsAffordable(b.remainingMicros)).toBeGreaterThanOrEqual(DEEP_SHOTS);
    const after = b.remainingMicros - costMicros(100);
    expect(b.completedShots + 100 + maxShotsAffordable(after)).toBeLessThan(DEEP_SHOTS);
  });

  it("says so AT THE DECISION POINT, before the money moves", async () => {
    const b = twoRunsIn();
    m.getBudget.mockResolvedValue(b);
    m.getCredentialChallenge.mockResolvedValue(challenge());
    render(<QpuSubmitPanel />);
    fireEvent.click(await screen.findByRole("button", { name: /review this run/i }));

    const confirm = screen.getByRole("status");
    expect(confirm).toHaveTextContent(new RegExp(`closes off the ${DEEP_TITLE} medal for good`, "i"));
    // The real ceiling, quoted: 896 of the 1,000 the medal needs. Both derived.
    const ceiling = b.completedShots + 100 + maxShotsAffordable(b.remainingMicros - costMicros(100));
    expect(confirm).toHaveTextContent(
      new RegExp(
        `tops out at\\s*${ceiling.toLocaleString("en-US")}\\s*shots — the medal needs\\s*${DEEP_SHOTS.toLocaleString("en-US")}`,
        "i",
      ),
    );
    // It states the consequence; it does NOT block the run. The allowance is theirs.
    expect(screen.getByRole("button", { name: /submit to real hardware/i })).toBeEnabled();
  });

  it("stays silent when the run does NOT foreclose it (a maxed run EARNS it)", async () => {
    m.getBudget.mockResolvedValue(budget());
    m.getCredentialChallenge.mockResolvedValue(challenge());
    render(<QpuSubmitPanel />);
    fireEvent.change(await screen.findByLabelText("Shots"), { target: { value: String(MAX_SHOTS) } });
    fireEvent.click(screen.getByRole("button", { name: /review this run/i }));
    expect(screen.queryByText(/closes off/i)).not.toBeInTheDocument();
  });

  it("stays silent when the medal is ALREADY out of reach — this run didn't do it", async () => {
    // Not this run's doing: the ladder line under the bar carries the standing verdict.
    const remaining = CAP - 3 * costMicros(100);
    m.getBudget.mockResolvedValue(
      budget({
        completedRuns: 3,
        completedShots: 300,
        spentMicros: CAP - remaining,
        remainingMicros: remaining,
      }),
    );
    m.getCredentialChallenge.mockResolvedValue(challenge());
    render(<QpuSubmitPanel />);
    await screen.findByText("Lifetime sponsored QPU budget");
    const panel = screen.getByLabelText("Run on real quantum hardware");
    expect(panel).toHaveTextContent(new RegExp(`${DEEP_TITLE}:.*out of reach`, "i"));
    fireEvent.click(screen.getByRole("button", { name: /review this run/i }));
    expect(screen.queryByText(/closes off/i)).not.toBeInTheDocument();
  });
});

test("the confirm step is announced and moves focus to the action it asks about", async () => {
  // It carries the branch's most consequential sentences (an irreversible spend, and
  // what it forecloses) and used to appear in silence, leaving focus on a button that
  // no longer existed.
  m.getBudget.mockResolvedValue(budget());
  m.getCredentialChallenge.mockResolvedValue(challenge());
  render(<QpuSubmitPanel />);
  fireEvent.click(await screen.findByRole("button", { name: /review this run/i }));
  const submit = screen.getByRole("button", { name: /submit to real hardware/i });
  expect(submit).toHaveFocus();
  expect(screen.getByRole("status")).toHaveTextContent(/real, irreversible run/i);
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
  expect(link).toHaveAttribute("href", `${REPO_URL}#${README_QUICKSTART_ANCHOR}`);
  // And the dead form is GONE.
  expect(screen.queryByRole("button", { name: /review this run/i })).not.toBeInTheDocument();
  expectNeverSaysTheLearnerPays();
});

test("the graduation path describes what the repo ACTUALLY supports — not a QASM handoff", async () => {
  // The claim "the repository runs the same circuits, unmodified" was FALSE: the repo
  // has no OpenQASM path at all (grep: zero hits in lib/). The real graduation path is
  // run_circuit() + the allowlisted iqm_garnet device in lib/hardware/devices.py — the
  // Braket PYTHON SDK. The path is real; the sentence describing it was not.
  const remaining = costMicros(1) - 1;
  m.getBudget.mockResolvedValue(
    budget({ spentMicros: CAP - remaining, remainingMicros: remaining, completedRuns: 3, completedShots: 1_000 }),
  );
  m.getCredentialChallenge.mockResolvedValue(challenge());
  render(<QpuSubmitPanel />);
  await screen.findByText(/sponsored budget spent/i);
  const panel = screen.getByLabelText("Run on real quantum hardware");
  expect(panel).not.toHaveTextContent(/same circuits, unmodified/i);
  expect(panel).toHaveTextContent(/Braket Python SDK, not the OpenQASM above/i);
  expect(panel).toHaveTextContent(/prints a cost estimate before it submits/i);

  // The snippet must be a call that RUNS. `run_circuit(circuit, device_name="iqm_garnet")`
  // — what this panel used to teach, and what this test used to pin — raises
  // `ValueError: s3_location required for AWS devices` from lib/hardware/devices.py, and
  // that check sits ABOVE the cost print, so neither half of the sentence around it was
  // true. s3_location and shots are what make the taught call real.
  expect(panel).toHaveTextContent(/run_circuit\(circuit, device_name="iqm_garnet"/i);
  expect(panel).toHaveTextContent(/shots=1000/i);
  expect(panel).toHaveTextContent(/s3_location=\("amazon-braket-<your-bucket>", "quantum"\)\)/i);
  // ...and the panel says out loud why it is required.
  expect(panel).toHaveTextContent(/fails fast without it/i);
});

// ---- the graduation link actually resolves ----------------------------------
describe("the README deep-link anchor", () => {
  const README = readFileSync(path.join(__dirname, "../../../../README.md"), "utf8");

  /** GitHub's heading slugger: lowercase, strip everything that is not a word char,
   *  hyphen or space (emoji, backticks, em dashes, parens, commas all vanish — leaving
   *  their spaces behind, which is why real slugs contain double hyphens), spaces → "-". */
  const slug = (heading: string) =>
    heading.trim().toLowerCase().replace(/[^\w\- ]+/gu, "").replace(/ /g, "-");

  const headings = README.split("\n")
    .filter((l) => /^#{1,6} /.test(l))
    .map((l) => l.replace(/^#{1,6} /, ""));
  const slugs = new Set(headings.map(slug));

  it("the slugger agrees with every anchor GitHub already resolves in this README", () => {
    // Self-check: the README's own table of contents renders and works on GitHub, so
    // each of its in-page links is a slug GitHub demonstrably produces. If this passes,
    // the algorithm above is GitHub's, not a guess.
    const internal = [...README.matchAll(/\]\((#[^)]+)\)/g)].map((mt) => mt[1].slice(1));
    expect(internal.length).toBeGreaterThan(5);
    for (const anchor of internal) expect(slugs).toContain(anchor);
  });

  it("the panel's graduation anchor is a REAL heading (it used to be #quickstart — nonexistent)", () => {
    expect(slugs).toContain(README_QUICKSTART_ANCHOR);
    // And it is the right heading: the one that installs the workspace against real
    // hardware. A rename that keeps the slug valid but changes the subject still fails.
    const target = headings.find((h) => slug(h) === README_QUICKSTART_ANCHOR)!;
    expect(target).toMatch(/AWS Braket, real hardware/i);
    expect(slugs).not.toContain("quickstart"); // the old, silently-broken anchor
  });
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

test("after braket-submit-failed (hold released) a retry mints a NEW key — a same-key retry would only fetch the cached RELEASED row and never reach the device", async () => {
  m.getBudget.mockResolvedValue(budget());
  m.getCredentialChallenge.mockResolvedValue(challenge());
  m.submitTask
    .mockResolvedValueOnce({ ok: false, status: 502, error: "braket-submit-failed" })
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
  expect(retryKey).not.toBe(firstKey); // definitively refunded → new intent → new key
  expect(typeof retryKey).toBe("string");
});

// ---- outcomes: every message is true of the code as written ------------------
// A THROWN submit is ambiguous only until the run history is consulted: the
// reserve transaction writes the task row atomically with the spend, so the
// key's presence there IS the truth. These tests pin the two-stage behavior a
// live wifi drop exposed (2026-07-15): name the connection as the culprit, then
// resolve what actually happened instead of telling the learner to go check.
test("a network throw names the connection, then the history check PROVES no budget was spent — same key kept", async () => {
  m.getBudget.mockResolvedValue(budget()); // reachable; run history has no such key
  m.getCredentialChallenge.mockResolvedValue(challenge());
  m.submitTask
    .mockRejectedValueOnce(new TypeError("Failed to fetch"))
    .mockResolvedValueOnce({ ok: true, taskArn: "arn:x/y", estMicros: costMicros(100) });
  render(<QpuSubmitPanel />);
  fireEvent.click(await screen.findByRole("button", { name: /review this run/i }));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /submit to real hardware/i }));
  });
  // The resolution effect ran against the (empty) run history, so the panel is
  // now ENTITLED to the "no budget was spent" claim the old message had to avoid.
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent(/never reached us/i);
  expect(alert).toHaveTextContent(/no budget was spent/i);
  expect(alert).toHaveTextContent(/will not double-spend/i);
  expectNeverSaysTheLearnerPays();
  // The retry still reuses the SAME key — dedupe-safe even if resolution raced.
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /submit to real hardware/i }));
  });
  expect((m.submitTask.mock.calls[1] as unknown[])[2]).toBe(
    (m.submitTask.mock.calls[0] as unknown[])[2],
  );
});

test("a network throw whose run actually COMMITTED resolves to success, not a retry prompt", async () => {
  // The resolution getBudget returns the submitted key in the run history —
  // the request reached the server before the connection died.
  m.getBudget.mockImplementation(() => {
    const calls = m.submitTask.mock.calls as unknown[][];
    const key = calls.length > 0 ? (calls[calls.length - 1][2] as string) : "none";
    return Promise.resolve(
      budget({
        tasks:
          key === "none"
            ? []
            : [
                {
                  idempotencyKey: key,
                  device: "iqm_garnet",
                  shots: 100,
                  estMicros: costMicros(100),
                  status: "COMPLETED",
                  taskArn: "arn:aws:braket:eu-north-1:1:quantum-task/abc123",
                  circuitHash: "h",
                  createdAt: 1,
                },
              ],
      }),
    );
  });
  m.getCredentialChallenge.mockResolvedValue(challenge());
  m.submitTask.mockRejectedValue(new TypeError("Failed to fetch"));
  render(<QpuSubmitPanel />);
  fireEvent.click(await screen.findByRole("button", { name: /review this run/i }));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /submit to real hardware/i }));
  });
  // Flipped to the done card: the run is real, no retry needed or offered.
  const status = await screen.findByRole("status");
  expect(status).toHaveTextContent(/already reached us/i);
  expect(status).toHaveTextContent(/abc123/i);
  expect(status).toHaveTextContent(/no retry needed/i);
  expect(
    screen.queryByRole("button", { name: /submit to real hardware/i }),
  ).not.toBeInTheDocument();
  expectNeverSaysTheLearnerPays();
});

test("offline: the message says OFFLINE (not software), and the 'online' event triggers the history check", async () => {
  const proto = Object.getPrototypeOf(window.navigator) as object;
  const onLine = Object.getOwnPropertyDescriptor(proto, "onLine");
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => false });
  try {
    m.getBudget.mockResolvedValueOnce(budget()); // the panel's initial load
    m.getBudget.mockRejectedValueOnce(new TypeError("Failed to fetch")); // resolution attempt while offline
    m.getCredentialChallenge.mockResolvedValue(challenge());
    m.submitTask.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<QpuSubmitPanel />);
    fireEvent.click(await screen.findByRole("button", { name: /review this run/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /submit to real hardware/i }));
    });
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/you appear to be offline/i);
    expect(alert).toHaveTextContent(/network problem, not a hardware failure/i);
    expectNeverSaysTheLearnerPays();

    // Wifi comes back: the browser fires "online", the panel checks the history
    // (now reachable, key absent) and upgrades the message to the proven truth.
    m.getBudget.mockResolvedValue(budget());
    await act(async () => {
      fireEvent(window, new Event("online"));
    });
    expect(await screen.findByText(/never reached us/i)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/no budget was spent/i);
  } finally {
    delete (window.navigator as unknown as Record<string, unknown>).onLine;
    if (onLine) Object.defineProperty(proto, "onLine", onLine);
  }
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

// ---- credit metering ------------------------------------------------------------

test("a 402 insufficient-credits names the shortfall and points at the wallet", async () => {
  m.getBudget.mockResolvedValue(budget({ walletCredits: 40 }));
  m.getCredentialChallenge.mockResolvedValue(challenge());
  m.submitTask.mockResolvedValue({
    ok: false,
    status: 402,
    error: "insufficient-credits",
    creditsNeeded: 175,
  });
  render(<QpuSubmitPanel />);
  fireEvent.click(await screen.findByRole("button", { name: /review this run/i }));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /submit to real hardware/i }));
  });
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent(/175 credits/i);
  expect(alert).toHaveTextContent(/nothing was submitted/i);
  // A metering 402 re-fetches too — the balance shown must not go stale.
  await waitFor(() => expect(m.getBudget).toHaveBeenCalledTimes(2));
});

test("the budget readout shows the wallet balance when the server reports one", async () => {
  m.getBudget.mockResolvedValue(budget({ walletCredits: 300 }));
  m.getCredentialChallenge.mockResolvedValue(challenge());
  render(<QpuSubmitPanel />);
  expect(await screen.findByText(/wallet: 300 credits/i)).toBeInTheDocument();
});

test("no wallet line when the server does not report a balance (pre-metering Lambda)", async () => {
  m.getBudget.mockResolvedValue(budget()); // no walletCredits field at all
  m.getCredentialChallenge.mockResolvedValue(challenge());
  render(<QpuSubmitPanel />);
  await screen.findByRole("button", { name: /review this run/i });
  expect(screen.queryByText(/wallet:/i)).not.toBeInTheDocument();
});

test("a spent allowance with wallet credits keeps the FORM — metering must be reachable", async () => {
  // The terminal "Sponsored budget spent" card replaced the form whenever the
  // allowance ran dry — which would make wallet-funded runs unreachable from
  // the UI, i.e. sellable but unusable credits.
  m.getBudget.mockResolvedValue(
    budget({ spentMicros: CAP, remainingMicros: 0, walletCredits: 300 }),
  );
  m.getCredentialChallenge.mockResolvedValue(challenge());
  render(<QpuSubmitPanel />);
  expect(await screen.findByRole("button", { name: /review this run/i })).toBeInTheDocument();
  expect(screen.queryByText(/sponsored budget spent/i)).not.toBeInTheDocument();
});

test("a spent allowance with ZERO credits shows the terminal card WITH a top-up pointer", async () => {
  m.getBudget.mockResolvedValue(budget({ spentMicros: CAP, remainingMicros: 0, walletCredits: 0 }));
  m.getCredentialChallenge.mockResolvedValue(challenge());
  render(<QpuSubmitPanel />);
  expect(await screen.findByText(/sponsored budget spent/i)).toBeInTheDocument();
  expect(screen.getByText(/top up/i)).toBeInTheDocument();
});

test("the confirm step discloses wallet funding BEFORE the money is committed", async () => {
  m.getBudget.mockResolvedValue(
    budget({ spentMicros: CAP, remainingMicros: 0, walletCredits: 300 }),
  );
  m.getCredentialChallenge.mockResolvedValue(challenge());
  render(<QpuSubmitPanel />);
  fireEvent.click(await screen.findByRole("button", { name: /review this run/i }));
  // default shots = 100 → costMicros(100) = 445,000 → ceil to 45 credits
  expect(await screen.findByText(/funded by your wallet/i)).toBeInTheDocument();
  expect(screen.getByText(/45 credits/i)).toBeInTheDocument();
});

// ---- the playground handoff ---------------------------------------------------
// The playground writes a one-shot circuit to sessionStorage (qpu-handoff.ts, key
// qcp:handoff:v1) and routes to /workspace#hardware; SubmitForm consumes it in its
// qasm state INITIALIZER — form mount, not panel mount, so it survives the
// CredentialGate detour. These tests use the REAL qpu-handoff lib against jsdom's
// sessionStorage: mocking it would only re-encode our assumptions about it.
describe("playground handoff", () => {
  const HANDOFF_KEY = "qcp:handoff:v1";
  const HANDOFF_QASM = "OPENQASM 3.0;\nqubit[1] q;\nh q[0];\nbit[1] c;\nc = measure q;";
  // PRESETS is module-private by design; the Bell preset text is pinned here so a
  // preset edit that breaks the no-handoff default reddens this suite.
  const BELL_QASM =
    "OPENQASM 3.0;\nqubit[2] q;\nh q[0];\ncnot q[0], q[1];\nbit[2] c;\nc = measure q;";

  beforeEach(() => {
    sessionStorage.clear();
    m.getBudget.mockResolvedValue(budget());
    m.getCredentialChallenge.mockResolvedValue(challenge());
  });
  afterEach(() => {
    sessionStorage.clear();
  });

  it("initializes the editor from a valid handoff, names the circuit, and clears the storage", async () => {
    sessionStorage.setItem(
      HANDOFF_KEY,
      JSON.stringify({ v: 1, qasm: HANDOFF_QASM, name: "Ramsey sweep", ts: Date.now() }),
    );
    render(<QpuSubmitPanel />);
    expect(await screen.findByLabelText(/circuit \(openqasm/i)).toHaveValue(HANDOFF_QASM);
    const note = screen.getByText(/loaded from the playground/i);
    expect(note).toHaveTextContent(/Ramsey sweep/);
    // One-shot: consumed at form mount, so a reload gets a clean panel.
    expect(sessionStorage.getItem(HANDOFF_KEY)).toBeNull();
    expectNeverSaysTheLearnerPays();
  });

  it("shows the note without a name when the handoff is anonymous", async () => {
    sessionStorage.setItem(HANDOFF_KEY, JSON.stringify({ v: 1, qasm: HANDOFF_QASM, ts: Date.now() }));
    render(<QpuSubmitPanel />);
    expect(await screen.findByText(/loaded from the playground/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/circuit \(openqasm/i)).toHaveValue(HANDOFF_QASM);
  });

  it("the note dismisses on click — the circuit stays in the editor", async () => {
    sessionStorage.setItem(HANDOFF_KEY, JSON.stringify({ v: 1, qasm: HANDOFF_QASM, ts: Date.now() }));
    render(<QpuSubmitPanel />);
    await screen.findByText(/loaded from the playground/i);
    fireEvent.click(screen.getByRole("button", { name: /dismiss the playground note/i }));
    expect(screen.queryByText(/loaded from the playground/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/circuit \(openqasm/i)).toHaveValue(HANDOFF_QASM);
  });

  it("without a handoff the editor is the Bell preset and no note renders", async () => {
    render(<QpuSubmitPanel />);
    expect(await screen.findByLabelText(/circuit \(openqasm/i)).toHaveValue(BELL_QASM);
    expect(screen.queryByText(/loaded from the playground/i)).not.toBeInTheDocument();
  });

  it("a corrupt handoff value falls back to the preset silently — and is cleared", async () => {
    sessionStorage.setItem(HANDOFF_KEY, "{not json");
    render(<QpuSubmitPanel />);
    expect(await screen.findByLabelText(/circuit \(openqasm/i)).toHaveValue(BELL_QASM);
    expect(screen.queryByText(/loaded from the playground/i)).not.toBeInTheDocument();
    // consumeHandoff clears even garbage, so it can never linger across visits.
    expect(sessionStorage.getItem(HANDOFF_KEY)).toBeNull();
  });
});

// ---- the ladder and the wall must speak ONE language --------------------------
/**
 * The panel's own doc comment promised that "the two surfaces cannot disagree about
 * what the ladder is". That became false the moment the credentials wall and Z7
 * "Within reach" were localized: LadderProgress still rendered `tier.title` (the
 * tier's STABLE ENGLISH IDENTITY, never a label) plus hardcoded "shots"/"run(s)" and
 * an en-US formatter. Both surfaces live on /workspace, so a Spanish learner read
 * "Serie de ejecuciones" in one and "Run series" in the other, about the same rung.
 *
 * Expected Spanish comes from the DICTIONARY, keyed off the FIXTURE's tiers — so this
 * asserts the wiring, not a copy of the wording, and a retranslation moves both sides.
 */
describe("the medal ladder speaks the learner's language", () => {
  const esTitle = (tier: { n: number; metric: string }) =>
    translate("es", `credentialsUi.tiers.hardware.${tier.metric}.${tier.n}`);

  /** The single <p> that carries the whole ladder — the one holding the first rung. */
  const ladderLine = (panel: HTMLElement) => {
    const first = esTitle(LADDER.tiers[0]);
    const line = Array.from(panel.querySelectorAll("p")).find((el) =>
      el.textContent?.includes(first),
    );
    if (!line) throw new Error(`no ladder paragraph containing "${first}"`);
    return line;
  };

  const drawSpanish = async (over: Record<string, unknown>) => {
    localStorage.setItem("qc:locale", "es");
    m.getBudget.mockResolvedValue(budget(over));
    m.getCredentialChallenge.mockResolvedValue(challenge());
    render(
      <LocaleProvider>
        <QpuSubmitPanel />
      </LocaleProvider>,
    );
    // The panel's surrounding prose is still English (see the report) — this heading
    // is a stable await point precisely because it is untranslated.
    await screen.findByText("Lifetime sponsored QPU budget");
    return screen.getByLabelText("Run on real quantum hardware");
  };

  it("names every rung with the wall's OWN Spanish title, never the English identity", async () => {
    const panel = await drawSpanish({ completedRuns: 2, completedShots: 200 });
    for (const tier of LADDER.tiers) {
      const title = esTitle(tier);
      expect(title).not.toBe(tier.title); // the fixture identity really is English
      expect(panel).toHaveTextContent(title);
      expect(panel).not.toHaveTextContent(new RegExp(`${tier.title}:`));
    }
  });

  it("agrees the unit noun in Spanish, and with the THRESHOLD it sits beside", async () => {
    const panel = await drawSpanish({ completedRuns: 2, completedShots: 200 });
    // Singular threshold → singular noun; plural threshold → plural noun. The hardcoded
    // `run${n === 1 ? "" : "s"}` could only ever get English right.
    expect(panel).toHaveTextContent("1 de 1 ejecución");
    expect(panel).toHaveTextContent("2 de 3 ejecuciones");
    expect(panel).toHaveTextContent(`200 de ${DEEP_SHOTS.toLocaleString("es-MX")} disparos`);
    // Scoped to the ladder paragraph on purpose: the REST of this panel is still
    // English prose (listed as out of scope), so a panel-wide /runs?/ assertion would
    // be measuring that gap instead of this fix.
    expect(ladderLine(panel)).not.toHaveTextContent(/\bruns?\b/);
    expect(ladderLine(panel)).not.toHaveTextContent(/\bshots?\b/);
  });

  it("renders the same unit nouns Within-reach uses — one key, not two", async () => {
    // The nouns come from workspaceUi.unitRun / .unitShot, the keys Z7 already read.
    // If the panel ever grows a parallel copy of these words this goes red.
    const panel = await drawSpanish({ completedRuns: 0, completedShots: 0 });
    expect(panel).toHaveTextContent(`0 de 1 ${translate("es", "workspaceUi.unitRun", {}, 1)}`);
    expect(panel).toHaveTextContent(
      `0 de ${DEEP_SHOTS.toLocaleString("es-MX")} ${translate("es", "workspaceUi.unitShot", {}, DEEP_SHOTS)}`,
    );
  });

  it("renders the foreclosure verdict with the wall's own word", async () => {
    // Three default runs leave too little for the 1,000-shot tier. The verdict must be
    // the wall's chip word (credentialsUi.outOfReach), lowercased for this inline slot
    // — not a second Spanish phrase invented here.
    const remaining = CAP - 3 * costMicros(100);
    const panel = await drawSpanish({
      completedRuns: 3,
      completedShots: 300,
      spentMicros: CAP - remaining,
      remainingMicros: remaining,
    });
    const verdict = translate("es", "credentialsUi.outOfReach").toLocaleLowerCase("es-MX");
    expect(verdict).toBe("fuera de alcance");
    expect(panel).toHaveTextContent(new RegExp(`${esTitle(SHOT_TIERS[0])}:.*${verdict}`, "i"));
    expect(panel).not.toHaveTextContent(/out of reach/i);
  });

  /**
   * The branch that fires when the ladder CANNOT be drawn at all was left behind by the
   * i18n pass: the titles and unit nouns above were localized while this sentence stayed
   * an English module constant (RECORD_UNAVAILABLE). Within-reach — the panel next to it
   * on /workspace — states the same fact from workspaceUi.hardwareUnavailable, so a
   * Spanish learner read ONE fact in TWO languages, side by side, on one page.
   */
  it("says the record is unavailable in SPANISH when the ladder cannot be drawn", async () => {
    const panel = await drawSpanish({ completedRuns: null, completedShots: null });
    const es = translate("es", "qpuUi.recordUnavailable");
    // The dictionary really does translate it — a Spanish leaf copied from English
    // would satisfy the assertion below while shipping the same defect.
    expect(es).not.toBe(translate("en", "qpuUi.recordUnavailable"));
    expect(panel).toHaveTextContent(es);
    expect(panel).not.toHaveTextContent(/hardware record is unavailable/i);
    // The guards the English branch already carries hold in Spanish too.
    expect(panel).not.toHaveTextContent(/NaN/);
    expect(panel).not.toHaveTextContent(/out of reach/i);
  });

  it("agrees with the sentence Within-reach states one panel away", async () => {
    // Not a byte-identity claim — this surface is where the money is spent, so it keeps
    // the two clauses Within-reach's shorter line drops (the completed runs are safe,
    // and the retry). What must agree is the LANGUAGE and the VERDICT: both say the
    // record is unavailable, and neither dresses an unknown as a foreclosure.
    const panel = await drawSpanish({ completedRuns: null, completedShots: null });
    const short = translate("es", "workspaceUi.hardwareUnavailable");
    expect(short).toBe("Registro de hardware no disponible.");
    expect(translate("es", "qpuUi.recordUnavailable")).toMatch(/registro de hardware/i);
    expect(panel).toHaveTextContent(/registro de hardware no está disponible/i);
  });

  it("still reads in English exactly as the fixture's own tier words", async () => {
    // The English dictionary titles are the same words HARDWARE_TIERS carries, so the
    // READING is unchanged for an English learner. (Not a byte-identity claim: the unit
    // noun moved inside the emphasis span, so the markup differs — this asserts the
    // text, which is what a learner sees.) Asserted against the FIXTURE, so a drift in
    // either the dictionary or the tier table lands here.
    m.getBudget.mockResolvedValue(budget({ completedRuns: 1, completedShots: 300 }));
    m.getCredentialChallenge.mockResolvedValue(challenge());
    render(<QpuSubmitPanel />);
    await screen.findByText("Lifetime sponsored QPU budget");
    const panel = screen.getByLabelText("Run on real quantum hardware");
    for (const tier of LADDER.tiers) {
      const value = tier.metric === "shots" ? 300 : 1;
      const unit = tier.metric === "shots" ? "shots" : `run${tier.n === 1 ? "" : "s"}`;
      expect(panel).toHaveTextContent(
        new RegExp(
          `${tier.title}:\\s*${Math.min(value, tier.n).toLocaleString("en-US")} of ${tier.n.toLocaleString("en-US")}\\s*${unit}`,
        ),
      );
    }
  });
});

// ---- the WAF's 429, all the way to the learner --------------------------------
/**
 * lambda/qpu/edge.yaml now answers a throttled request with 429 and
 * {"error":"rate_limited"} instead of a bare 403. Nothing client-side read it: the
 * submit path fell through to the generic 4xx sentence ("That run couldn't be
 * submitted. No budget was spent.") — TRUE, since WAF blocks before the Lambda
 * reserves anything, but silent about the one thing the learner can act on.
 */
describe("a rate-limited hardware surface says WAIT, not 'broken'", () => {
  const submitOnce = async () => {
    render(<QpuSubmitPanel />);
    fireEvent.click(await screen.findByRole("button", { name: /review this run/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /submit to real hardware/i }));
    });
    return screen.findByRole("alert");
  };

  it("tells the learner to wait a minute — and still that nothing was spent", async () => {
    m.getBudget.mockResolvedValue(budget());
    m.getCredentialChallenge.mockResolvedValue(challenge());
    m.submitTask.mockResolvedValue({ ok: false, status: 429, error: "rate_limited" });
    const alert = await submitOnce();
    expect(alert).toHaveTextContent(/wait a minute/i);
    expect(alert).toHaveTextContent(/no budget was spent/i);
    // NOT the generic 4xx sentence, which is the whole defect.
    expect(alert).not.toHaveTextContent(/that run couldn't be submitted/i);
    expectNeverSaysTheLearnerPays();
  });

  it("matches on the STATUS alone, for an edge that sent no JSON token", async () => {
    // The pre-deploy/partial shape: 429 with a body qpu-client could not parse, so
    // `error` is the synthesised "submit failed (429)". Keying only on the token would
    // miss this — and keying only on the token would in fact be dead code today.
    m.getBudget.mockResolvedValue(budget());
    m.getCredentialChallenge.mockResolvedValue(challenge());
    m.submitTask.mockResolvedValue({ ok: false, status: 429, error: "submit failed (429)" });
    expect(await submitOnce()).toHaveTextContent(/wait a minute/i);
  });

  it("does NOT hijack a 403 — that status is also an edge-secret mismatch here", async () => {
    // Unlike the tutor path, 403 on the QPU path is ambiguous (qpu-core.mjs returns it
    // for a secret mismatch), which is exactly why edge.yaml was changed to 429. Until
    // that distribution ships a throttle still reads as the generic rejection: this
    // under-claims rather than telling a learner to wait out a misconfiguration.
    m.getBudget.mockResolvedValue(budget());
    m.getCredentialChallenge.mockResolvedValue(challenge());
    m.submitTask.mockResolvedValue({ ok: false, status: 403, error: "submit failed (403)" });
    const alert = await submitOnce();
    expect(alert).toHaveTextContent(/that run couldn't be submitted/i);
    expect(alert).not.toHaveTextContent(/wait a minute/i);
  });

  it("says it in Spanish", async () => {
    localStorage.setItem("qc:locale", "es");
    m.getBudget.mockResolvedValue(budget());
    m.getCredentialChallenge.mockResolvedValue(challenge());
    m.submitTask.mockResolvedValue({ ok: false, status: 429, error: "rate_limited" });
    render(
      <LocaleProvider>
        <QpuSubmitPanel />
      </LocaleProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: /review this run/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /submit to real hardware/i }));
    });
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(translate("es", "qpuUi.rateLimitedSubmit"));
    expect(alert).toHaveTextContent(/espera un minuto/i);
  });

  it("a throttled BUDGET READ does not render as an outage", async () => {
    // getBudget/getCredentialChallenge threw `new Error("budget failed (429)")`, so a
    // throttled workspace showed "Couldn't reach the hardware service" — a dead-service
    // claim for a wait-a-minute condition.
    const throttled = new client.QpuHttpError("budget", 429);
    m.getBudget.mockRejectedValue(throttled);
    m.getCredentialChallenge.mockRejectedValue(throttled);
    render(<QpuSubmitPanel />);
    const note = await screen.findByRole("status");
    expect(note).toHaveTextContent(/rate limit, not an outage/i);
    expect(note).toHaveTextContent(/wait a minute/i);
    expect(screen.queryByText(/couldn't reach the hardware service/i)).not.toBeInTheDocument();
    // The who-pays banner is device fact, not user state — it must survive this branch.
    expect(screen.getByText(/the platform pays for these runs/i)).toBeInTheDocument();
    expectNeverSaysTheLearnerPays();
  });

  it("still reports a REAL outage as an outage", async () => {
    m.getBudget.mockRejectedValue(new client.QpuHttpError("budget", 500));
    m.getCredentialChallenge.mockRejectedValue(new client.QpuHttpError("credential status", 500));
    render(<QpuSubmitPanel />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /couldn't reach the hardware service/i,
    );
    expect(screen.queryByText(/rate limit, not an outage/i)).not.toBeInTheDocument();
  });

  it("a throttled credential CLAIM is not reported as a dead service", async () => {
    m.getBudget.mockResolvedValue(budget({ credentialed: false }));
    m.getCredentialChallenge.mockResolvedValue(challenge({ credentialed: false }));
    m.claimCredential.mockRejectedValue(new client.QpuHttpError("credential claim", 429));
    render(<QpuSubmitPanel />);
    fireEvent.change(await screen.findByLabelText(/estimated cost in dollars/i), {
      target: { value: "0.74" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /unlock hardware access/i }));
    });
    const note = await screen.findByRole("status");
    expect(note).toHaveTextContent(/rate limit, not an outage/i);
    expect(screen.queryByText(/couldn't reach the hardware service/i)).not.toBeInTheDocument();
    // And it is NOT scored as a wrong answer — the recompute hint must stay away.
    expect(screen.queryByText(/not quite\. recompute/i)).not.toBeInTheDocument();
  });
});
