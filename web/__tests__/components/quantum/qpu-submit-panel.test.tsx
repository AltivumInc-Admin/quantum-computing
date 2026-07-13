/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
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
  usd,
} from "@/components/quantum/qpu-submit-panel";

// Every expected dollar figure below is DERIVED from the locked pricing table
// (cost.ts, parity-locked against lib/utils/cost.py), never hardcoded: a
// hardcoded "$0.74" would stay green while the panel drifted from a reprice and
// go red on the correct fix — an inverted tripwire.
const centsOf = (v: number) => Math.round(v * 100 + 1e-7);
/** The server's component-wise cent settlement for the credential challenge
 *  (qpu-core.mjs correctCents / cost-estimate-grade.ts). */
const challengeCents = (shots: number) =>
  centsOf(PRICING.IQM.perTask) + centsOf(PRICING.IQM.perShot * shots);

const LIFETIME_CAP_MICROS = 5_000_000;

const budget = (over: Partial<Record<string, unknown>> = {}) => ({
  capMicros: LIFETIME_CAP_MICROS,
  spentMicros: 0,
  remainingMicros: LIFETIME_CAP_MICROS,
  credentialed: true,
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
  // The panel re-declares nothing: its integer micros come from the locked
  // floats, and every displayed cent equals the shared kernel's settlement.
  expect(IQM_TASK_MICROS).toBe(Math.round(PRICING.IQM.perTask * 1_000_000));
  expect(IQM_SHOT_MICROS).toBe(Math.round(PRICING.IQM.perShot * 1_000_000));
  for (let shots = 1; shots <= 1000; shots++) {
    expect(Math.round(costMicros(shots) / 10_000)).toBe(centsOf(estimateCost("IQM", shots, 0)));
  }
});

test("always states the real-hardware, no-markup cost transparency at the LIVE rates", async () => {
  m.getBudget.mockResolvedValue(budget());
  m.getCredentialChallenge.mockResolvedValue(challenge());
  render(<QpuSubmitPanel />);
  expect(await screen.findByText(/no platform markup/i)).toBeInTheDocument();
  expect(screen.getByText(/every cent runs your circuit on the physical device/i)).toBeInTheDocument();
  expect(screen.getByText(/exact amazon braket price/i)).toBeInTheDocument();
  // The quoted rate line derives from PRICING, so a reprice updates the prose.
  expect(
    screen.getByText(`${usd(IQM_TASK_MICROS)} per task + $${PRICING.IQM.perShot} per shot`),
  ).toBeInTheDocument();
});

test("shows the remaining sponsored budget", async () => {
  const spent = costMicros(1000);
  m.getBudget.mockResolvedValue(
    budget({ spentMicros: spent, remainingMicros: LIFETIME_CAP_MICROS - spent }),
  );
  m.getCredentialChallenge.mockResolvedValue(challenge());
  render(<QpuSubmitPanel />);
  expect(await screen.findByText(usd(LIFETIME_CAP_MICROS - spent))).toBeInTheDocument();
  expect(screen.getByText(/of \$5\.00 left/i)).toBeInTheDocument();
});

test("an uncredentialed user must price a run; a correct answer unlocks the form", async () => {
  m.getBudget.mockResolvedValueOnce(budget({ credentialed: false }));
  m.getCredentialChallenge.mockResolvedValueOnce(challenge({ credentialed: false, requiredShots: 300 }));
  m.claimCredential.mockResolvedValue({ credentialed: true });
  // After earning, refresh() reloads with credentialed = true.
  m.getBudget.mockResolvedValue(budget());
  m.getCredentialChallenge.mockResolvedValue(challenge());

  render(<QpuSubmitPanel />);
  expect(await screen.findByText(/one step before your first run/i)).toBeInTheDocument();
  // The prompt states the rounding convention so a truncating learner isn't
  // silently failed.
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
  // A throw can't be a wrong answer: the server answers a genuinely wrong
  // price with 200 {credentialed:false}, so a rejection here is transport/auth.
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

test("credentialed: itemized cost + a two-step confirm that submits to real hardware", async () => {
  m.getBudget.mockResolvedValue(budget());
  m.getCredentialChallenge.mockResolvedValue(challenge());
  m.submitTask.mockResolvedValue({
    ok: true,
    taskArn: "arn:aws:braket:eu-north-1:1:quantum-task/xyz",
    estMicros: costMicros(100),
  });
  render(<QpuSubmitPanel />);
  // Default 100 shots. The itemized total and the button both say ONE price.
  expect(await screen.findByText("Total to the device")).toBeInTheDocument();
  // Step 1: review.
  fireEvent.click(screen.getByRole("button", { name: /review this run/i }));
  expect(screen.getByText(/real, irreversible run on the physical device/i)).toBeInTheDocument();
  // Step 2: the literal "Submit to real hardware — $X" button.
  const submit = screen.getByRole("button", {
    name: `Submit to real hardware — ${usd(costMicros(100))}`,
  });
  await act(async () => {
    fireEvent.click(submit);
  });
  expect(m.submitTask).toHaveBeenCalledWith(100, expect.stringContaining("OPENQASM"), expect.any(String));
  expect(await screen.findByText(/submitted to iqm garnet — task xyz/i)).toBeInTheDocument();
});

test("a 300-shot run shows ONE price across preview, button, and history", async () => {
  // The reviewer's exact case: 300 shots settles to a rounded cent that must
  // never appear as two different figures (rounded in one place, truncated in
  // another). Everything derives from one micros source.
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
  // Preview button and the run-history row both read the SAME rounded price.
  expect(
    screen.getByRole("button", { name: `Submit to real hardware — ${rounded}` }),
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
  // First attempt failed; retry from the still-open confirm panel.
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /submit to real hardware/i }));
  });
  const firstKey = (m.submitTask.mock.calls[0] as unknown[])[2];
  const retryKey = (m.submitTask.mock.calls[1] as unknown[])[2];
  expect(firstKey).toBe(retryKey); // same intent → same key → server dedupes
});

test("a network throw does NOT claim 'not charged' and keeps the key for a safe retry", async () => {
  // The request may have committed the reservation server-side before the
  // connection died — the honest message says only what we know, and the
  // retained idempotency key is what makes "retrying is safe" true.
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
  expect(alert).toHaveTextContent(/retrying is safe and will not double-charge/i);
  expect(screen.queryByText(/not charged/i)).not.toBeInTheDocument();
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /submit to real hardware/i }));
  });
  expect((m.submitTask.mock.calls[1] as unknown[])[2]).toBe(
    (m.submitTask.mock.calls[0] as unknown[])[2],
  );
});

test("an unexplained 5xx does NOT claim 'not charged' — the server may hold the money", async () => {
  m.getBudget.mockResolvedValue(budget());
  m.getCredentialChallenge.mockResolvedValue(challenge());
  m.submitTask.mockResolvedValue({ ok: false, status: 500, error: "internal" });
  render(<QpuSubmitPanel />);
  fireEvent.click(await screen.findByRole("button", { name: /review this run/i }));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /submit to real hardware/i }));
  });
  expect(await screen.findByText(/couldn't confirm this run/i)).toBeInTheDocument();
  expect(screen.queryByText(/not charged/i)).not.toBeInTheDocument();
});

test("a 4xx rejection truthfully says the budget was not charged", async () => {
  // Every 4xx is a rejection before (or an all-or-none cancellation of) the
  // reservation, so the "not charged" claim is provable there.
  m.getBudget.mockResolvedValue(budget());
  m.getCredentialChallenge.mockResolvedValue(challenge());
  m.submitTask.mockResolvedValue({ ok: false, status: 400, error: "qasm exceeds 7000 bytes" });
  render(<QpuSubmitPanel />);
  fireEvent.click(await screen.findByRole("button", { name: /review this run/i }));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /submit to real hardware/i }));
  });
  expect(await screen.findByText(/your budget was not charged/i)).toBeInTheDocument();
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
  expect(alert).toHaveTextContent(/your budget was not charged/i);
});

test("a 402 over-lifetime-budget response shows specific copy and does not claim success", async () => {
  m.getBudget.mockResolvedValue(budget());
  m.getCredentialChallenge.mockResolvedValue(challenge());
  m.submitTask.mockResolvedValue({ ok: false, status: 402, error: "over-lifetime-budget" });
  render(<QpuSubmitPanel />);
  fireEvent.click(await screen.findByRole("button", { name: /review this run/i }));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /submit to real hardware/i }));
  });
  expect(await screen.findByText(/used your full sponsored qpu budget/i)).toBeInTheDocument();
});

test("a run that costs more than the remaining budget can't be reviewed", async () => {
  const remaining = costMicros(100) - 10_000; // one cent short of the default run
  m.getBudget.mockResolvedValue(
    budget({ spentMicros: LIFETIME_CAP_MICROS - remaining, remainingMicros: remaining }),
  );
  m.getCredentialChallenge.mockResolvedValue(challenge());
  render(<QpuSubmitPanel />);
  await waitFor(() => expect(screen.getByRole("button", { name: /review this run/i })).toBeDisabled());
  expect(screen.getByText(/more than your remaining budget/i)).toBeInTheDocument();
});
