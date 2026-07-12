/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, act, waitFor } from "@testing-library/react";

// The hardware group pulls COMPLETED runs from the QPU backend. Default: QPU off
// (isQpuConfigured false) → the effect no-ops, hardware badges stay locked, and
// the other tests are unaffected.
jest.mock("@/lib/qpu-client", () => ({
  __esModule: true,
  isQpuConfigured: jest.fn(() => false),
  getBudget: jest.fn(),
}));

// The hardware fetch is gated on auth resolving (status === "authenticated") —
// mutable so tests can drive the configuring → authenticated transition.
let mockAuthStatus = "authenticated";
jest.mock("@/components/auth/auth-provider", () => ({
  __esModule: true,
  useAuth: () => ({ status: mockAuthStatus, email: null, signOut: async () => {} }),
}));

import { CredentialsWall } from "@/components/credentials-wall";
import * as qpu from "@/lib/qpu-client";
import { epochDay } from "@/lib/review-schedule";
import { RETENTION_STABILITY } from "@/lib/runbook";

const today = epochDay(Date.now());

function seedRetained(id: string, n: number) {
  for (let i = 0; i < n; i++) {
    localStorage.setItem(
      `qc:card:${id}:${i}`,
      JSON.stringify({
        reps: 3, lapses: 0, stability: RETENTION_STABILITY + 5, difficulty: 5,
        dueEpochDay: today + 30, lastEpochDay: today - 1,
      }),
    );
  }
}

describe("CredentialsWall", () => {
  beforeEach(() => {
    localStorage.clear();
    mockAuthStatus = "authenticated";
    (qpu.getBudget as jest.Mock).mockClear();
  });

  it("renders all four medal groups and an earned/total summary", () => {
    render(<CredentialsWall />);
    expect(screen.getByRole("heading", { name: "Completion" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Mastery" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Consistency" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Hardware" })).toBeInTheDocument();
    expect(screen.getByText(/of \d+ earned/i)).toBeInTheDocument();
  });

  it("lights the hardware badge from COMPLETED real-hardware runs (QPU configured)", async () => {
    (qpu.isQpuConfigured as jest.Mock).mockReturnValue(true);
    (qpu.getBudget as jest.Mock).mockResolvedValue({
      capMicros: 5_000_000, spentMicros: 0, remainingMicros: 5_000_000, credentialed: true,
      tasks: [
        { idempotencyKey: "a", status: "COMPLETED", device: "iqm_garnet", shots: 100, estMicros: 445_000, taskArn: "arn:x", circuitHash: null, createdAt: 1 },
        { idempotencyKey: "b", status: "SUBMITTED", device: "iqm_garnet", shots: 100, estMicros: 445_000, taskArn: "arn:y", circuitHash: null, createdAt: 2 },
      ],
    });
    render(<CredentialsWall />);
    const hardware = screen.getByLabelText("Hardware");
    // One COMPLETED run → the "Ran on real hardware" tier earns (async fetch).
    await waitFor(() => expect(hardware).toHaveTextContent(/Earned/));
    expect(hardware).toHaveTextContent(/1 completed run on IQM Garnet/);
    (qpu.isQpuConfigured as jest.Mock).mockReturnValue(false); // reset for other tests
  });

  it("waits out the Amplify-bridge race: no fetch while configuring, fetch on authenticated", async () => {
    (qpu.isQpuConfigured as jest.Mock).mockReturnValue(true);
    (qpu.getBudget as jest.Mock).mockResolvedValue({
      capMicros: 5_000_000, spentMicros: 0, remainingMicros: 5_000_000, credentialed: true,
      tasks: [
        { idempotencyKey: "a", status: "COMPLETED", device: "iqm_garnet", shots: 100, estMicros: 445_000, taskArn: "arn:x", circuitHash: null, createdAt: 1 },
      ],
    });

    // Auth still resolving (Amplify.configure not yet run): fetching now is the
    // exact race this guards against — it must NOT happen.
    mockAuthStatus = "configuring";
    const { rerender } = render(<CredentialsWall />);
    expect(qpu.getBudget).not.toHaveBeenCalled();

    // Auth resolves → the status dep re-runs the effect and the fetch lands.
    mockAuthStatus = "authenticated";
    rerender(<CredentialsWall />);
    await waitFor(() => expect(qpu.getBudget).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByLabelText("Hardware")).toHaveTextContent(/Earned/)
    );
    (qpu.isQpuConfigured as jest.Mock).mockReturnValue(false);
  });

  it("treats signed-out as an honest zero: no fetch, locked medals, no error note", () => {
    (qpu.isQpuConfigured as jest.Mock).mockReturnValue(true);
    mockAuthStatus = "unauthenticated";
    render(<CredentialsWall />);
    expect(qpu.getBudget).not.toHaveBeenCalled();
    const hardware = screen.getByLabelText("Hardware");
    expect(hardware).toHaveTextContent(/Locked/);
    expect(hardware).not.toHaveTextContent(/couldn't verify/i);
    (qpu.isQpuConfigured as jest.Mock).mockReturnValue(false);
  });

  it("shows an explicit couldn't-verify state when the budget fetch fails", async () => {
    (qpu.isQpuConfigured as jest.Mock).mockReturnValue(true);
    (qpu.getBudget as jest.Mock).mockRejectedValue(new Error("budget failed (502)"));
    render(<CredentialsWall />);
    const hardware = screen.getByLabelText("Hardware");
    await waitFor(() =>
      expect(hardware).toHaveTextContent(/couldn't verify your hardware runs/i)
    );
    // Signed out is NOT an error: NotSignedIn keeps the honest locked zero.
    (qpu.getBudget as jest.Mock).mockRejectedValue(
      Object.assign(new Error("not signed in"), { name: "NotSignedIn" })
    );
    render(<CredentialsWall />);
    const walls = screen.getAllByLabelText("Hardware");
    await waitFor(() => expect(qpu.getBudget).toHaveBeenCalledTimes(2));
    expect(walls[walls.length - 1]).not.toHaveTextContent(/couldn't verify/i);
    (qpu.isQpuConfigured as jest.Mock).mockReturnValue(false);
  });

  it("earns a completion medal from a section flag", () => {
    localStorage.setItem("qc:section:00-prereqs", "1");
    render(<CredentialsWall />);
    const section = screen.getByLabelText("Completion");
    // The completed module's medal shows "Earned"; the rest show "Locked".
    expect(section).toHaveTextContent(/Earned/);
  });

  it("earns mastery medals from retained CardStates (state conveyed by text, not just color)", () => {
    seedRetained("challenge:m", 5); // 5 skills in proven retention
    render(<CredentialsWall />);
    const mastery = screen.getByLabelText("Mastery");
    // The 1- and 5-skill tiers are Earned; 15/30/50 are Locked.
    const earned = mastery.querySelectorAll("li");
    const earnedLabels = Array.from(earned).map((li) =>
      li.textContent?.includes("Earned"),
    );
    expect(earnedLabels.filter(Boolean).length).toBe(2);
  });

  it("earns a consistency medal from the longest weekly streak", () => {
    // Active this week + each of the last 3 weeks -> a 4-week streak.
    for (const w of [0, 1, 2, 3]) localStorage.setItem(`qc:log:day:${today - w * 7}`, "1");
    seedRetained("challenge:x", 1);
    render(<CredentialsWall />);
    const consistency = screen.getByLabelText("Consistency");
    expect(consistency).toHaveTextContent(/Earned/);
    expect(consistency).toHaveTextContent(/4-week streak/);
  });

  it("lights a consistency medal live when a logged active day extends the streak", () => {
    seedRetained("challenge:x", 1);
    // Three consecutive prior weeks (NOT this week) → longest streak 3, below the 4-week tier.
    for (const w of [1, 2, 3]) localStorage.setItem(`qc:log:day:${today - w * 7}`, "1");
    render(<CredentialsWall />);
    expect(screen.getByLabelText("Consistency")).not.toHaveTextContent("Earned");
    // Logging THIS week extends the run to 4 — but it writes no card state, so the
    // fingerprint must carry the active-day count or this update would be missed.
    act(() => {
      localStorage.setItem(`qc:log:day:${today}`, "1");
      window.dispatchEvent(new Event("qc-progress"));
    });
    expect(screen.getByLabelText("Consistency")).toHaveTextContent("Earned");
  });

  it("updates live on the qc-progress channel", () => {
    render(<CredentialsWall />);
    // The summary ("N of M earned") is split across nodes — read the paragraph.
    const summary = () =>
      screen
        .getByText((_c, el) => el?.tagName === "P" && /earned$/.test(el.textContent?.trim() ?? ""))
        .textContent!.replace(/\s+/g, " ")
        .trim();
    expect(summary()).toMatch(/^0 of/);
    act(() => {
      localStorage.setItem("qc:section:00-prereqs", "1");
      window.dispatchEvent(new Event("qc-progress"));
    });
    expect(summary()).toMatch(/^1 of/);
  });
});
