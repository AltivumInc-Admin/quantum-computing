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
import { QpuSubmitPanel } from "@/components/quantum/qpu-submit-panel";

const budget = (over: Partial<Record<string, unknown>> = {}) => ({
  capMicros: 5_000_000,
  spentMicros: 0,
  remainingMicros: 5_000_000,
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

test("always states the real-hardware, no-markup cost transparency", async () => {
  m.getBudget.mockResolvedValue(budget());
  m.getCredentialChallenge.mockResolvedValue(challenge());
  render(<QpuSubmitPanel />);
  expect(await screen.findByText(/no platform markup/i)).toBeInTheDocument();
  expect(screen.getByText(/every cent runs your circuit on the physical device/i)).toBeInTheDocument();
  expect(screen.getByText(/exact amazon braket price/i)).toBeInTheDocument();
});

test("shows the remaining sponsored budget", async () => {
  m.getBudget.mockResolvedValue(budget({ spentMicros: 1_750_000, remainingMicros: 3_250_000 }));
  m.getCredentialChallenge.mockResolvedValue(challenge());
  render(<QpuSubmitPanel />);
  expect(await screen.findByText(/\$3\.25/)).toBeInTheDocument();
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

  // 300 shots → $0.30 task + $0.00145×300 ($0.44) = $0.74.
  fireEvent.change(screen.getByLabelText(/estimated cost in dollars/i), { target: { value: "0.74" } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /unlock hardware access/i }));
  });
  expect(m.claimCredential).toHaveBeenCalledWith(74);
  expect(await screen.findByLabelText(/circuit \(openqasm/i)).toBeInTheDocument();
});

test("a wrong price is rejected with a recompute hint, without unlocking", async () => {
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
  expect(screen.queryByLabelText(/circuit \(openqasm/i)).not.toBeInTheDocument();
});

test("credentialed: itemized cost + a two-step confirm that submits to real hardware", async () => {
  m.getBudget.mockResolvedValue(budget());
  m.getCredentialChallenge.mockResolvedValue(challenge());
  m.submitTask.mockResolvedValue({ ok: true, taskArn: "arn:aws:braket:eu-north-1:1:quantum-task/xyz", estMicros: 445_000 });
  render(<QpuSubmitPanel />);
  // Default 100 shots → $0.45. The itemized total and the button both say it.
  expect(await screen.findByText("Total to the device")).toBeInTheDocument();
  // Step 1: review.
  fireEvent.click(screen.getByRole("button", { name: /review this run/i }));
  expect(screen.getByText(/real, irreversible run on the physical device/i)).toBeInTheDocument();
  // Step 2: the literal "Submit to real hardware — $X" button.
  const submit = screen.getByRole("button", { name: /submit to real hardware — \$0\.45/i });
  await act(async () => {
    fireEvent.click(submit);
  });
  expect(m.submitTask).toHaveBeenCalledWith(100, expect.stringContaining("OPENQASM"));
  expect(await screen.findByText(/submitted to iqm garnet — task xyz/i)).toBeInTheDocument();
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
  m.getBudget.mockResolvedValue(budget({ spentMicros: 4_800_000, remainingMicros: 200_000 })); // $0.20 left
  m.getCredentialChallenge.mockResolvedValue(challenge());
  render(<QpuSubmitPanel />);
  // Default 100 shots = $0.45 > $0.20 remaining.
  await waitFor(() => expect(screen.getByRole("button", { name: /review this run/i })).toBeDisabled());
  expect(screen.getByText(/more than your remaining budget/i)).toBeInTheDocument();
});
