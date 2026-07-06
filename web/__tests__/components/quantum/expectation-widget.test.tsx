/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExpectationWidget } from "@/components/quantum/expectation-widget";
import { getCardState } from "@/lib/review-store";
import { expectCardId } from "@/lib/challenge-review";

// ⟨Z⟩ on |+⟩ = 0 — the canonical basis-matters case; options are 0.00 (truth),
// 0.50 (P(+1) confusion), −1.00 and 1.00 (determinism).
const zOnPlus = JSON.stringify({
  id: "t-expect",
  prompt: "The circuit prepares |+⟩. What is the expectation of Z?",
  program: "H 0",
  observable: "Z 0",
  hint: "|+⟩ is the equal superposition — Z readings of +1 and −1 are equally likely.",
});

describe("ExpectationWidget", () => {
  beforeEach(() => localStorage.clear());

  it("hides the single-shot reveal until the learner commits", () => {
    render(<ExpectationWidget source={zOnPlus} />);
    expect(screen.queryByLabelText(/what a measurement returns/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /lock in prediction/i })).toBeDisabled();
  });

  it("shows the circuit and the subscripted observable label", () => {
    render(<ExpectationWidget source={zOnPlus} />);
    expect(screen.getByText("H 0")).toBeInTheDocument();
    expect(screen.getByText(/observable ⟨Z₀⟩/)).toBeInTheDocument();
  });

  it("a correct prediction reveals the single-shot story and schedules the card as good", () => {
    render(<ExpectationWidget source={zOnPlus} />);
    fireEvent.click(screen.getByRole("button", { name: "0.00" }));
    fireEvent.click(screen.getByRole("button", { name: /lock in prediction/i }));

    expect(screen.getByText("Correct")).toBeInTheDocument();
    expect(screen.getByLabelText(/what a measurement returns/i)).toBeInTheDocument();
    expect(screen.getByText(/returns an eigenvalue, \+1 or −1/i)).toBeInTheDocument();
    const card = getCardState(expectCardId("t-expect"))!;
    expect(card.reps).toBe(1);
    expect(card.lapses).toBe(0);
  });

  it("announces the verdict in a persistent status region and moves focus to it", () => {
    render(<ExpectationWidget source={zOnPlus} />);
    fireEvent.click(screen.getByRole("button", { name: "0.00" }));
    screen.getByRole("button", { name: /lock in prediction/i }).focus();
    fireEvent.click(screen.getByRole("button", { name: /lock in prediction/i }));

    expect(document.activeElement).toHaveAttribute("role", "status");
    expect(document.activeElement!.textContent).toMatch(/correct — ⟨Z₀⟩ = 0\.00/i);
  });

  it("a miss is an again lapse and surfaces the hint", () => {
    render(<ExpectationWidget source={zOnPlus} />);
    fireEvent.click(screen.getByRole("button", { name: "0.50" })); // P(+1) confusion
    fireEvent.click(screen.getByRole("button", { name: /lock in prediction/i }));

    expect(screen.getByText("Not quite")).toBeInTheDocument();
    expect(screen.getByText(/equally likely/i)).toBeInTheDocument();
    const card = getCardState(expectCardId("t-expect"))!;
    expect(card.reps).toBe(0);
    expect(card.lapses).toBe(1);
  });

  it("locks the options after commit", () => {
    render(<ExpectationWidget source={zOnPlus} />);
    fireEvent.click(screen.getByRole("button", { name: "0.00" }));
    fireEvent.click(screen.getByRole("button", { name: /lock in prediction/i }));
    expect(screen.getByRole("button", { name: "1.00" })).toBeDisabled();
  });

  it("caches its kind + raw fence source so /review can re-mount the live widget", () => {
    render(<ExpectationWidget source={zOnPlus} />);
    const content = JSON.parse(localStorage.getItem("qc:card-content:expect:t-expect")!);
    expect(content.kind).toBe("expect");
    expect(content.source).toBe(zOnPlus);
    expect(content.answer).toBe("⟨Z₀⟩ = 0.00 for `H 0`");
  });

  it("shows an error card and writes nothing for an invalid spec", () => {
    const bad = JSON.stringify({ id: "t-bad", prompt: "p", program: "H 0", observable: "Q 0" });
    render(<ExpectationWidget source={bad} />);
    expect(screen.getByText(/expectation error/i)).toBeInTheDocument();
    expect(Object.keys(localStorage)).toHaveLength(0);
  });

  it("uses review-voiced copy on the review surface", () => {
    render(<ExpectationWidget source={zOnPlus} surface="review" />);
    fireEvent.click(screen.getByRole("button", { name: "0.00" }));
    fireEvent.click(screen.getByRole("button", { name: /lock in prediction/i }));
    expect(screen.getByText(/reviewed — next review/i)).toBeInTheDocument();
    expect(screen.queryByText(/added to your review/i)).not.toBeInTheDocument();
  });
});
