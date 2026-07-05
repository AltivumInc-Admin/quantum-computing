/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { PredictWidget } from "@/components/quantum/predict-widget";
import { getCardState } from "@/lib/review-store";
import { predictCardId } from "@/lib/challenge-review";

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
    expect(screen.getByText(/correct/i)).toBeInTheDocument();
    const card = getCardState(predictCardId("t-bell"));
    expect(card).not.toBeNull();
    expect(card!.reps).toBe(1);
    expect(card!.lapses).toBe(0);
  });

  it("a wrong prediction is graded as an 'again' lapse", () => {
    render(<PredictWidget source={bellNonzero} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "|00⟩" })); // incomplete set
    fireEvent.click(screen.getByRole("button", { name: /lock in prediction/i }));

    const card = getCardState(predictCardId("t-bell"))!;
    expect(card.reps).toBe(0);
    expect(card.lapses).toBe(1);
    expect(screen.getByText(/not quite/i)).toBeInTheDocument();
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
});
