/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReviewCard } from "@/components/quantum/review-card";

const CARD = JSON.stringify({
  id: "test-card-1",
  prompt: "What gate creates an equal superposition from |0>?",
  answer: "The Hadamard gate, `H`.",
});

describe("ReviewCard", () => {
  beforeEach(() => localStorage.clear());

  it("shows the prompt and hides the answer until revealed", () => {
    render(<ReviewCard source={CARD} />);
    expect(screen.getByText(/equal superposition/i)).toBeInTheDocument();
    expect(screen.queryByText(/Hadamard gate/i)).not.toBeInTheDocument();
  });

  it("reveals the answer and the four grade buttons on demand", () => {
    render(<ReviewCard source={CARD} />);
    fireEvent.click(screen.getByText("Show answer"));
    expect(screen.getByText(/Hadamard gate/i)).toBeInTheDocument();
    for (const label of ["Again", "Hard", "Good", "Easy"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("schedules the card and reports the next review after grading", () => {
    render(<ReviewCard source={CARD} />);
    fireEvent.click(screen.getByText("Show answer"));
    fireEvent.click(screen.getByText("Good"));
    expect(screen.getByText(/next review/i)).toBeInTheDocument();
    // Persisted under the documented key.
    expect(localStorage.getItem("qc:card:test-card-1")).not.toBeNull();
  });

  it("re-grading a card that is no longer due is a no-op (interval-inflation guard)", () => {
    render(<ReviewCard source={CARD} />);
    fireEvent.click(screen.getByText("Show answer"));
    fireEvent.click(screen.getByText("Good"));
    const first = JSON.parse(localStorage.getItem("qc:card:test-card-1")!);
    expect(first.reps).toBe(1);

    // The card can still be revealed for practice, but a second rating in the
    // same due window must not advance the schedule.
    fireEvent.click(screen.getByText("Show answer"));
    fireEvent.click(screen.getByText("Good"));
    const second = JSON.parse(localStorage.getItem("qc:card:test-card-1")!);
    expect(second.reps).toBe(1);
    expect(second.dueEpochDay).toBe(first.dueEpochDay);
    expect(screen.getByText(/schedule unchanged/i)).toBeInTheDocument();
  });

  it("renders an error card for malformed JSON", () => {
    render(<ReviewCard source={"{ not json"} />);
    expect(screen.getByText(/card error:/i)).toBeInTheDocument();
  });

  it("requires a non-empty id", () => {
    render(<ReviewCard source={JSON.stringify({ id: "", prompt: "p", answer: "a" })} />);
    expect(screen.getByText(/non-empty string "id"/i)).toBeInTheDocument();
  });
});
