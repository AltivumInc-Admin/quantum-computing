/**
 * @jest-environment jsdom
 */
// web/__tests__/components/pricing-cost-estimator.test.tsx
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { CostEstimator } from "@/components/pricing/cost-estimator";

describe("CostEstimator", () => {
  it("defaults to IQM Garnet at 1,000 shots and prices the run correctly", () => {
    render(<CostEstimator />);
    // 0.163 x 1000 + 34 = 197 credits = $1.97
    expect(screen.getByText("197 credits")).toBeInTheDocument();
    expect(screen.getByText(/\$1\.97/)).toBeInTheDocument();
  });

  it("recomputes when the shot count changes", () => {
    render(<CostEstimator />);
    fireEvent.change(screen.getByLabelText("Shots"), { target: { value: "100" } });
    // 0.163 x 100 + 34 = 50.3 credits
    expect(screen.getByText("50.3 credits")).toBeInTheDocument();
  });

  it("recomputes when the backend changes", () => {
    render(<CostEstimator />);
    const select = screen.getByLabelText("Backend") as HTMLSelectElement;
    const forteIdx = Array.from(select.options).findIndex((o) =>
      o.text.startsWith("IonQ Forte-1")
    );
    fireEvent.change(select, { target: { value: String(forteIdx) } });
    // 9.0 x 1000 + 34 = 9,034 credits = $90.34
    expect(screen.getByText("9,034 credits")).toBeInTheDocument();
    expect(screen.getByText(/\$90\.34/)).toBeInTheDocument();
  });

  it("prices a month of tutoring by model and question count", () => {
    render(<CostEstimator />);
    // Default Haiku x 100 questions = 100 credits.
    expect(screen.getByText("100 credits")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Fable" }));
    // Fable: 7 x 100 = 700 credits = $7.00 / mo
    expect(screen.getByText("700 credits")).toBeInTheDocument();
    expect(screen.getByText(/\$7\.00/)).toBeInTheDocument();
  });

  it("selects shot presets via chips", () => {
    render(<CostEstimator />);
    // "10,000" appears only among the shot presets (question presets top out at 300).
    fireEvent.click(screen.getByRole("button", { name: "10,000" }));
    expect(screen.getByText("1,664 credits")).toBeInTheDocument();
  });

  it("exposes chip selection to assistive tech, not by colour alone", () => {
    // chip-selected is a pure background swap (globals.css), so without
    // aria-pressed a screen reader hears three unrelated buttons and nothing says
    // which is active. Every other chip group in the repo carries this.
    render(<CostEstimator />);
    const chip = (name: string) => screen.getByRole("button", { name });

    expect(chip("1,000")).toHaveAttribute("aria-pressed", "true"); // default shots
    expect(chip("10,000")).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(chip("10,000"));
    expect(chip("10,000")).toHaveAttribute("aria-pressed", "true");
    expect(chip("1,000")).toHaveAttribute("aria-pressed", "false");

    expect(chip("Haiku")).toHaveAttribute("aria-pressed", "true"); // default model
    fireEvent.click(chip("Fable"));
    expect(chip("Fable")).toHaveAttribute("aria-pressed", "true");
    expect(chip("Haiku")).toHaveAttribute("aria-pressed", "false");
  });

  it("speaks the page's own surface/ink vocabulary, not a gray dialect", () => {
    // Both panes were an opaque --surface-1 card with a hand-rolled
    // gray-200/60 hairline, with body copy, labels, readouts, dividers and
    // unselected chips on raw gray-* + dark:white/N utilities — inside a page
    // whose every other card is rounded-card glass with --mut/--bd ink. The gray
    // ladder is chroma-zero oklch while --mut is warm carbon in the light theme,
    // so the shift was visible in both themes, and nothing pinned the vocabulary.
    const { container } = render(<CostEstimator />);
    const panes = container.querySelectorAll(":scope > div > .rounded-card");
    expect(panes).toHaveLength(2);
    for (const pane of panes) expect(pane.className).toContain("glass");
    for (const el of container.querySelectorAll<HTMLElement>("[class]")) {
      expect(el.className).not.toMatch(/\bgray-\d/);
      expect(el.className).not.toMatch(/dark:(?:border|text|bg)-white\//);
    }
  });

  it("names its two preset groups distinctly", () => {
    // Both groups were labelled "Presets", so the two entries in a screen
    // reader's landmark/group list were indistinguishable.
    render(<CostEstimator />);
    expect(screen.getByRole("group", { name: "Shot presets" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Question presets" })).toBeInTheDocument();
  });
});
