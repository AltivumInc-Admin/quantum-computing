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
    // can read the verdict instead of it vanishing mid-read.
    expect(screen.getByText(/added to your review/i)).toBeInTheDocument();
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
});
