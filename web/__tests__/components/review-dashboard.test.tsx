/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReviewDashboard } from "@/components/review-dashboard";
import { epochDay } from "@/lib/review-schedule";
import { getCardState } from "@/lib/review-store";

// The bloch widget (and its display-caps hooks) probe matchMedia on mount.
function mockMatchMedia() {
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }));
}

/** Seed a card that is due today (graded once, due day already passed). */
function seedDueCard(id: string, content: Record<string, unknown>) {
  const today = epochDay(Date.now());
  localStorage.setItem(
    `qc:card:${id}`,
    JSON.stringify({
      reps: 1,
      lapses: 0,
      stability: 1,
      difficulty: 5,
      dueEpochDay: today - 1,
      lastEpochDay: today - 2,
    })
  );
  localStorage.setItem(`qc:card-content:${id}`, JSON.stringify(content));
}

const challengeSource = JSON.stringify({
  id: "d1-live",
  prompt: "Prepare |+> on one qubit.",
  qubits: 1,
  target: { program: "H 0" },
  starter: "",
});

describe("ReviewDashboard live re-attempt dispatch", () => {
  beforeEach(() => {
    localStorage.clear();
    mockMatchMedia();
  });

  it("renders a plain qcard as the text recall ReviewCard", async () => {
    seedDueCard("basic-1", { prompt: "What is a qubit?", answer: "A two-level system." });
    render(<ReviewDashboard />);
    expect(await screen.findByText("What is a qubit?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /show answer/i })).toBeInTheDocument();
  });

  it("re-mounts a challenge card as the LIVE Challenge widget", async () => {
    seedDueCard("challenge:d1-live", {
      prompt: "Prepare |+> on one qubit.",
      answer: "One correct circuit: `H 0`",
      kind: "challenge",
      source: challengeSource,
    });
    render(<ReviewDashboard />);
    // The live widget has an editor + Check — a recall card has neither.
    expect(await screen.findByRole("textbox")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /check/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /show answer/i })).not.toBeInTheDocument();
  });

  it("solving the live widget advances the due card's schedule and keeps it mounted", async () => {
    seedDueCard("challenge:d1-live", {
      prompt: "Prepare |+> on one qubit.",
      answer: "One correct circuit: `H 0`",
      kind: "challenge",
      source: challengeSource,
    });
    render(<ReviewDashboard />);
    fireEvent.change(await screen.findByRole("textbox"), { target: { value: "H 0" } });
    fireEvent.click(screen.getByRole("button", { name: /check/i }));

    // The card was due, so gradeCardIfDue advanced it (reps 1 -> 2)...
    const card = getCardState("challenge:d1-live")!;
    expect(card.reps).toBe(2);
    // ...and the session roster keeps the solved widget mounted so the learner
    // can read the verdict instead of it vanishing mid-read (review-voiced copy).
    expect(screen.getByText(/reviewed — next review/i)).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("re-mounts a bloch card as the LIVE Bloch-target widget", async () => {
    seedDueCard("bloch:d1-bloch", {
      prompt: "Place |+>.",
      answer: "Target state: |+>",
      kind: "bloch",
      source: JSON.stringify({
        id: "d1-bloch",
        prompt: "Place |+>.",
        target: { program: "H 0" },
      }),
    });
    render(<ReviewDashboard />);
    expect(await screen.findByRole("button", { name: /check position/i })).toBeInTheDocument();
  });

  it("falls back to the recall card for Rep content cached before kind/source existed", async () => {
    seedDueCard("challenge:old-style", {
      prompt: "Old challenge prompt.",
      answer: "One correct circuit: `H 0`",
    });
    render(<ReviewDashboard />);
    expect(await screen.findByText("Old challenge prompt.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /show answer/i })).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("falls back to the recall card for a corrupt stored kind", async () => {
    seedDueCard("challenge:corrupt", {
      prompt: "Corrupt kind prompt.",
      answer: "A.",
      kind: "not-a-kind",
      source: challengeSource,
    });
    render(<ReviewDashboard />);
    expect(await screen.findByText("Corrupt kind prompt.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /show answer/i })).toBeInTheDocument();
  });

  it("renders the roster with list semantics and per-item status chips", async () => {
    seedDueCard("basic-1", { prompt: "P?", answer: "A." });
    seedDueCard("challenge:d1-live", {
      prompt: "Prepare |+> on one qubit.",
      answer: "One correct circuit: `H 0`",
      kind: "challenge",
      source: challengeSource,
    });
    render(<ReviewDashboard />);
    await screen.findByRole("textbox");
    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getAllByText("Due")).toHaveLength(2);
    expect(screen.queryByText("Reviewed")).not.toBeInTheDocument();
  });

  it("marks a solved card Reviewed, keeps it dimmed-but-mounted, and completes the session", async () => {
    seedDueCard("challenge:d1-live", {
      prompt: "Prepare |+> on one qubit.",
      answer: "One correct circuit: `H 0`",
      kind: "challenge",
      source: challengeSource,
    });
    render(<ReviewDashboard />);
    fireEvent.change(await screen.findByRole("textbox"), { target: { value: "H 0" } });
    fireEvent.click(screen.getByRole("button", { name: "Check" }));

    expect(screen.getByText("Reviewed")).toBeInTheDocument();
    expect(screen.queryByText("Due")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeInTheDocument(); // still mounted
    expect(screen.getByText(/session complete/i)).toBeInTheDocument();
    // Review-surface copy, not lesson copy.
    expect(screen.getByText(/reviewed — next review/i)).toBeInTheDocument();
    expect(screen.queryByText(/added to your review/i)).not.toBeInTheDocument();
  });

  it("does not show the challenge's persistent Solved badge before the re-attempt", async () => {
    localStorage.setItem("qc:challenge:d1-live", "1"); // solved once, in the lesson
    seedDueCard("challenge:d1-live", {
      prompt: "Prepare |+> on one qubit.",
      answer: "One correct circuit: `H 0`",
      kind: "challenge",
      source: challengeSource,
    });
    render(<ReviewDashboard />);
    await screen.findByRole("textbox");
    expect(screen.queryByText("Solved")).not.toBeInTheDocument();
  });

  it("offers a remediation answer for live re-attempts", async () => {
    seedDueCard("challenge:d1-live", {
      prompt: "Prepare |+> on one qubit.",
      answer: "One correct circuit: `H 0`",
      kind: "challenge",
      source: challengeSource,
    });
    render(<ReviewDashboard />);
    await screen.findByRole("textbox");
    expect(screen.getByText(/stuck\? show a correct answer/i)).toBeInTheDocument();
    expect(screen.getByText(/one correct circuit/i)).toBeInTheDocument();
  });

  it("the recall-card fallback cannot re-grade the same due window (interval inflation guard)", async () => {
    seedDueCard("basic-1", { prompt: "P?", answer: "A." });
    render(<ReviewDashboard />);
    fireEvent.click(await screen.findByRole("button", { name: /show answer/i }));
    fireEvent.click(screen.getByRole("button", { name: "Good" }));
    const afterFirst = getCardState("basic-1")!;
    expect(afterFirst.reps).toBe(2);

    // The sticky roster keeps the card mounted — re-grading must be a no-op.
    fireEvent.click(screen.getByRole("button", { name: /show answer/i }));
    fireEvent.click(screen.getByRole("button", { name: "Good" }));
    expect(getCardState("basic-1")!.reps).toBe(2); // unchanged
    expect(getCardState("basic-1")!.dueEpochDay).toBe(afterFirst.dueEpochDay);
    expect(screen.getByText(/schedule unchanged/i)).toBeInTheDocument();
  });

  it("remounts a rostered card fresh when it comes due again (tab open past midnight)", async () => {
    const t0 = 1_800_000_000_000; // fixed base time
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(t0);
    try {
      seedDueCard("challenge:d1-live", {
        prompt: "Prepare |+> on one qubit.",
        answer: "One correct circuit: `H 0`",
        kind: "challenge",
        source: challengeSource,
      });
      render(<ReviewDashboard />);
      fireEvent.change(await screen.findByRole("textbox"), { target: { value: "H 0" } });
      fireEvent.click(screen.getByRole("button", { name: "Check" }));
      expect(screen.getByText(/reviewed — next review/i)).toBeInTheDocument();

      // Days pass while the tab stays open; the card comes due again.
      nowSpy.mockReturnValue(t0 + 40 * 86_400_000);
      fireEvent(window, new Event("qc-progress"));

      // The generation bump remounted a FRESH widget: verdict gone, editor
      // reset to the starter, and the item is Due again.
      expect(await screen.findByText("Due")).toBeInTheDocument();
      expect(screen.queryByText(/reviewed — next review/i)).not.toBeInTheDocument();
      expect(screen.getByRole("textbox")).toHaveValue("");
    } finally {
      nowSpy.mockRestore();
    }
  });
});
