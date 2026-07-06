/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { CostEstimateWidget } from "@/components/quantum/cost-estimate-widget";
import { getCardState } from "@/lib/review-store";
import { costCardId } from "@/lib/challenge-review";

const ionq2000 = JSON.stringify({
  id: "t-cost",
  prompt: "One task of 2,000 shots on IonQ — what does it cost?",
  provider: "IonQ",
  shots: 2000,
  hint: "The flat {perTask} task fee runs alongside the {perShot} for each shot meter.",
});

describe("CostEstimateWidget", () => {
  beforeEach(() => localStorage.clear());

  it("hides the itemized breakdown until the learner commits", () => {
    render(<CostEstimateWidget source={ionq2000} />);
    expect(screen.queryByLabelText(/itemized cost/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /lock in estimate/i })).toBeDisabled();
  });

  it("a correct estimate reveals the breakdown and schedules the card as good", () => {
    render(<CostEstimateWidget source={ionq2000} />);
    fireEvent.click(screen.getByRole("button", { name: "$160.30" }));
    fireEvent.click(screen.getByRole("button", { name: /lock in estimate/i }));

    expect(screen.getByText("Correct")).toBeInTheDocument();
    expect(screen.getByLabelText(/itemized cost/i)).toBeInTheDocument();
    expect(screen.getByText(/statistical precision, not hardware fidelity/i)).toBeInTheDocument();
    const card = getCardState(costCardId("t-cost"))!;
    expect(card.reps).toBe(1);
    expect(card.lapses).toBe(0);
  });

  it("announces the verdict in a persistent status region and moves focus to it", () => {
    render(<CostEstimateWidget source={ionq2000} />);
    fireEvent.click(screen.getByRole("button", { name: "$160.30" }));
    screen.getByRole("button", { name: /lock in estimate/i }).focus();
    fireEvent.click(screen.getByRole("button", { name: /lock in estimate/i }));

    expect(document.activeElement).toHaveAttribute("role", "status");
    expect(document.activeElement!.textContent).toMatch(/correct — this run costs \$160\.30/i);
  });

  it("a miss is an again lapse, reveals the truth, and shows the rate-substituted hint", () => {
    render(<CostEstimateWidget source={ionq2000} />);
    fireEvent.click(screen.getByRole("button", { name: "$160.00" })); // forgot the task fee
    fireEvent.click(screen.getByRole("button", { name: /lock in estimate/i }));

    expect(screen.getByText("Not quite")).toBeInTheDocument();
    // The {perTask}/{perShot} placeholders resolve from the live PRICING table.
    expect(screen.getByText(/flat \$0\.30 task fee/i)).toBeInTheDocument();
    expect(screen.getByText(/\$0\.08 for each/i)).toBeInTheDocument();
    const card = getCardState(costCardId("t-cost"))!;
    expect(card.reps).toBe(0);
    expect(card.lapses).toBe(1);
  });

  it("locks the options after commit", () => {
    render(<CostEstimateWidget source={ionq2000} />);
    fireEvent.click(screen.getByRole("button", { name: "$160.30" }));
    fireEvent.click(screen.getByRole("button", { name: /lock in estimate/i }));
    expect(screen.getByRole("button", { name: "$0.30" })).toBeDisabled();
  });

  it("caches its kind + raw fence source so /review can re-mount the live widget", () => {
    render(<CostEstimateWidget source={ionq2000} />);
    const content = JSON.parse(localStorage.getItem("qc:card-content:cost:t-cost")!);
    expect(content.kind).toBe("cost");
    expect(content.source).toBe(ionq2000);
    expect(content.answer).toContain("$160.30");
  });

  it("shows an error card and writes nothing for a colliding spec", () => {
    const bad = JSON.stringify({ id: "t-bad", prompt: "p", provider: "QuEra", shots: 30 });
    render(<CostEstimateWidget source={bad} />);
    expect(screen.getByText(/cost-estimate error/i)).toBeInTheDocument();
    expect(Object.keys(localStorage).some((k) => k.startsWith("qc:card:cost:"))).toBe(false);
  });

  it("uses review-voiced copy on the review surface", () => {
    render(<CostEstimateWidget source={ionq2000} surface="review" />);
    fireEvent.click(screen.getByRole("button", { name: "$160.30" }));
    fireEvent.click(screen.getByRole("button", { name: /lock in estimate/i }));
    expect(screen.getByText(/reviewed — next review/i)).toBeInTheDocument();
    expect(screen.queryByText(/added to your review/i)).not.toBeInTheDocument();
  });
});
