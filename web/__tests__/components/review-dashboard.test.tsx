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

  it("re-mounts a debug card as the LIVE Fix-the-circuit widget and grades a fix", async () => {
    const debugSource = JSON.stringify({
      id: "d1-debug",
      prompt: "The Bell prep below never entangles the qubits. Fix it.",
      qubits: 2,
      broken: { program: "H 0\nCNOT 1 0" },
      target: { program: "H 0\nCNOT 0 1" },
    });
    localStorage.setItem("qc:debug:d1-debug", "1"); // fixed once, in the lesson
    seedDueCard("debug:d1-debug", {
      prompt: "The Bell prep below never entangles the qubits. Fix it.",
      answer: "One correct circuit: `H 0; CNOT 0 1`",
      kind: "debug",
      source: debugSource,
    });
    render(<ReviewDashboard />);
    // The DEBUG widget specifically: editor seeded with the BROKEN circuit.
    expect(await screen.findByRole("textbox")).toHaveValue("H 0\nCNOT 1 0");
    // surface="review" reached the widget: persistent Fixed badge suppressed.
    expect(screen.queryByText("Fixed")).not.toBeInTheDocument();
    // Solving grades the due card (reps 1 -> 2) with review-voiced copy.
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "H 0\nCNOT 0 1" } });
    fireEvent.click(screen.getByRole("button", { name: /^check$/i }));
    expect(getCardState("debug:d1-debug")!.reps).toBe(2);
    expect(screen.getByText(/reviewed — next review/i)).toBeInTheDocument();
  });

  it("re-mounts an expect card as the LIVE Expectation widget and grades a commit", async () => {
    const expectSource = JSON.stringify({
      id: "d1-expect",
      prompt: "What is the expectation of Z on |+>?",
      program: "H 0",
      observable: "Z 0",
    });
    seedDueCard("expect:d1-expect", {
      prompt: "What is the expectation of Z on |+>?",
      answer: "⟨Z₀⟩ = 0.00 for `H 0`",
      kind: "expect",
      source: expectSource,
    });
    render(<ReviewDashboard />);
    // The EXPECT widget specifically: value options + the lock button.
    expect(await screen.findByRole("button", { name: /lock in prediction/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "0.00" }));
    fireEvent.click(screen.getByRole("button", { name: /lock in prediction/i }));
    expect(getCardState("expect:d1-expect")!.reps).toBe(2);
    expect(screen.getByText(/reviewed — next review/i)).toBeInTheDocument();
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

  // "not-a-kind" is an own-property MISS, the one class of corrupt value that
  // can never reach Object.prototype — so it passed even while a raw index read
  // resolved "constructor" to Object, which React then invoked as a component
  // and threw "Objects are not valid as a React child", taking out the whole
  // route (src/app carries no error.tsx).
  it.each(["not-a-kind", "constructor", "__proto__", "toString"])(
    "falls back to the recall card for the corrupt stored kind %p",
    async (kind) => {
      seedDueCard("challenge:corrupt", {
        prompt: "Corrupt kind prompt.",
        answer: "A.",
        kind,
        source: challengeSource,
      });
      render(<ReviewDashboard />);
      expect(await screen.findByText("Corrupt kind prompt.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /show answer/i })).toBeInTheDocument();
      // The sr-only roster line must not leak engine text either.
      expect(screen.queryByText(/native code/i)).not.toBeInTheDocument();
    }
  );

  it("drops a due card whose content cache is missing instead of drawing a blank slot", async () => {
    // The schedule write and the content write are independent setItem calls,
    // so a failed/evicted content write mints a due card the roster cannot draw.
    const today = epochDay(Date.now());
    localStorage.setItem(
      "qc:card:orphan-1",
      JSON.stringify({
        reps: 1, lapses: 0, stability: 1, difficulty: 5,
        dueEpochDay: today - 1, lastEpochDay: today - 2,
      })
    );
    seedDueCard("basic-1", { prompt: "P?", answer: "A." });
    render(<ReviewDashboard />);

    await screen.findByText("P?");
    // One renderable item, and the counter says so — it used to read "1 / 2"
    // (or skip a number entirely) by counting the undrawable card.
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText(/1 \/ 1 · Recall/)).toBeInTheDocument();
  });

  it("shows the honest empty state when every due card is undrawable", async () => {
    const today = epochDay(Date.now());
    localStorage.setItem(
      "qc:card:orphan-1",
      JSON.stringify({
        reps: 1, lapses: 0, stability: 1, difficulty: 5,
        dueEpochDay: today - 1, lastEpochDay: today - 2,
      })
    );
    render(<ReviewDashboard />);
    // Previously: a "1 due now" header above completely empty space, because the
    // empty state gated on the unfiltered roster length.
    expect(await screen.findByText(/nothing due/i)).toBeInTheDocument();
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
