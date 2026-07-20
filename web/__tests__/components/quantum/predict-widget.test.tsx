/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { PredictWidget } from "@/components/quantum/predict-widget";
import { getCardState } from "@/lib/review-store";
import { cardIdFor } from "@/lib/challenge-review";

const bellNonzero = JSON.stringify({
  id: "t-bell",
  prompt: "Which basis states can this Bell circuit produce?",
  program: "H 0\nCNOT 0 1",
  mode: "nonzero-states",
  hint: "Entanglement correlates the two qubits.",
});

describe("PredictWidget", () => {
  beforeEach(() => localStorage.clear());

  it("hides the simulated outcome until the learner commits", () => {
    render(<PredictWidget source={bellNonzero} />);
    expect(screen.queryByLabelText(/simulated outcome/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /lock in prediction/i })).toBeInTheDocument();
  });

  it("a correct nonzero-states prediction schedules the card as 'good'", () => {
    render(<PredictWidget source={bellNonzero} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "|00⟩" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "|11⟩" }));
    fireEvent.click(screen.getByRole("button", { name: /lock in prediction/i }));

    expect(screen.getByLabelText(/simulated outcome/i)).toBeInTheDocument();
    expect(screen.getByText("Correct")).toBeInTheDocument(); // the header chip
    const card = getCardState(cardIdFor("predict", "t-bell"));
    expect(card).not.toBeNull();
    expect(card!.reps).toBe(1);
    expect(card!.lapses).toBe(0);
  });

  it("a wrong prediction is graded as an 'again' lapse", () => {
    render(<PredictWidget source={bellNonzero} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "|00⟩" })); // incomplete set
    fireEvent.click(screen.getByRole("button", { name: /lock in prediction/i }));

    const card = getCardState(cardIdFor("predict", "t-bell"))!;
    expect(card.reps).toBe(0);
    expect(card.lapses).toBe(1);
    expect(screen.getByText("Not quite")).toBeInTheDocument(); // the header chip
  });

  // The uniform solved-once-ever flag: qc:predict:<id> uses the same set-once
  // "1" shape as qc:challenge:/qc:debug:, so solved-counting surfaces and the
  // sync snapshot see one shape across every Rep kind.
  it("a correct commit persists the qc:predict solved flag", () => {
    render(<PredictWidget source={bellNonzero} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "|00⟩" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "|11⟩" }));
    fireEvent.click(screen.getByRole("button", { name: /lock in prediction/i }));
    expect(localStorage.getItem("qc:predict:t-bell")).toBe("1");
  });

  it("a wrong commit never writes the solved flag", () => {
    render(<PredictWidget source={bellNonzero} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "|00⟩" })); // incomplete set
    fireEvent.click(screen.getByRole("button", { name: /lock in prediction/i }));
    expect(localStorage.getItem("qc:predict:t-bell")).toBeNull();
  });

  it("locks the selection after commit", () => {
    render(<PredictWidget source={bellNonzero} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "|00⟩" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "|11⟩" }));
    fireEvent.click(screen.getByRole("button", { name: /lock in prediction/i }));
    expect(screen.getByRole("checkbox", { name: "|01⟩" })).toBeDisabled();
  });

  it("writes no card for a theta-bound (non-concrete) circuit", () => {
    const bad = JSON.stringify({ id: "t-bad", prompt: "p", program: "RY 0 theta", mode: "top-outcome" });
    render(<PredictWidget source={bad} />);
    expect(screen.getByText(/predict error/i)).toBeInTheDocument();
    expect(Object.keys(localStorage).some((k) => k.startsWith("qc:card:predict:"))).toBe(false);
  });

  it("caches its kind + raw fence source so /review can re-mount the live widget", () => {
    render(<PredictWidget source={bellNonzero} />);
    const content = JSON.parse(localStorage.getItem("qc:card-content:predict:t-bell")!);
    expect(content.kind).toBe("predict");
    expect(content.source).toBe(bellNonzero);
  });

  it("announces the verdict in a persistent status region and moves focus to it", () => {
    render(<PredictWidget source={bellNonzero} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "|00⟩" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "|11⟩" }));
    screen.getByRole("button", { name: /lock in prediction/i }).focus();
    fireEvent.click(screen.getByRole("button", { name: /lock in prediction/i }));

    expect(document.activeElement).toHaveAttribute("role", "status");
    expect(document.activeElement!.textContent).toMatch(/correct prediction/i);
  });
});
