/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { VqcTrainer } from "@/components/quantum/vqc-trainer";
import { N_PARAMS } from "@/components/quantum/vqc";

describe("VqcTrainer", () => {
  it("renders the VQC header and a Train button", () => {
    render(<VqcTrainer source={JSON.stringify({ dataset: "blobs" })} />);
    expect(screen.getByText(/vqc/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /train/i })).toBeInTheDocument();
  });
  it("training advances the step readout past 0 (button runs a synchronous burst)", () => {
    render(<VqcTrainer source={""} />);
    expect(screen.getByRole("status")).toHaveTextContent(/step 0/);
    fireEvent.click(screen.getByRole("button", { name: /train/i }));
    expect(screen.getByRole("status")).toHaveTextContent(/step [1-9]/);
  });
  it("renders the error card for an unknown dataset", () => {
    render(<VqcTrainer source={JSON.stringify({ dataset: "moons" })} />);
    expect(screen.getByText(/unknown dataset "moons"/)).toBeInTheDocument();
  });
  it("announces the step/loss/accuracy readout as a polite live region", () => {
    render(<VqcTrainer source={""} />);
    const live = screen.getByRole("status");
    expect(live).toHaveTextContent(/step/i);
    expect(live).toHaveAttribute("aria-live", "polite");
  });
  it("seeds the loss curve from the model's own initial theta (one random draw, not two)", () => {
    const spy = jest.spyOn(Math, "random").mockReturnValue(0.5);
    render(<VqcTrainer source={""} />);
    expect(spy).toHaveBeenCalledTimes(N_PARAMS);
    spy.mockRestore();
  });

  it("names the widget with a real heading at the top of the card", () => {
    render(<VqcTrainer source={""} />);
    const heading = screen.getByRole("heading", { level: 3 });
    expect(heading).toHaveTextContent(/vqc/i);
    // It must precede both plots, so a screen-reader user meets the widget's
    // name before its two role="img" figures.
    const imgs = screen.getAllByRole("img");
    expect(
      heading.compareDocumentPosition(imgs[0]) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  /**
   * The loss plot's y-domain is anchored to the run's all-time maximum. When it
   * auto-fitted the visible 240-sample window instead, a converged run rendered
   * pinned at the TOP of the box from the 7th Train click — visually identical
   * to "nothing is being learned". Ten clicks pushes history past MAX_HISTORY
   * (1 + 10x40 = 401), so this exercises the truncated regime directly.
   */
  it("keeps a converged loss at the bottom of the plot after the history truncates", () => {
    const { container } = render(<VqcTrainer source={""} />);
    const train = screen.getByRole("button", { name: /train/i });
    for (let i = 0; i < 10; i++) fireEvent.click(train);

    const path = container.querySelector("path[stroke='currentColor']");
    expect(path).not.toBeNull();
    const d = path!.getAttribute("d")!;
    // Last vertex of the polyline: "... L <x> <y>" — a converged run must sit
    // near the 90px floor, not near 0 (the top).
    const lastY = parseFloat(d.trim().split(/[ ,]+/).slice(-1)[0]);
    expect(lastY).toBeGreaterThan(70);
  });

  it("reports the true step count once the loss history is truncated", () => {
    render(<VqcTrainer source={""} />);
    const train = screen.getByRole("button", { name: /train/i });
    for (let i = 0; i < 7; i++) fireEvent.click(train);
    // step = 280 but only the last 239 samples are drawn: the label must say so
    // rather than freezing at "239 training steps".
    expect(
      screen.getByRole("img", { name: /loss over the last 239 of 280 training steps/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/step 280/);
  });

  it("labels the loss plot's y-domain ceiling so the scale is falsifiable", () => {
    render(<VqcTrainer source={""} />);
    expect(screen.getByText(/y max \d+\.\d{2}/)).toBeInTheDocument();
  });

  it("draws every training point the accuracy readout counts", () => {
    const { container } = render(<VqcTrainer source={""} />);
    const boundary = screen.getByRole("img", { name: /decision boundary/i });
    const circles = Array.from(boundary.querySelectorAll("circle"));
    expect(circles).toHaveLength(30);
    // Marker radius included: nothing may spill past the 0..32 viewBox.
    for (const c of circles) {
      const cx = parseFloat(c.getAttribute("cx")!);
      const cy = parseFloat(c.getAttribute("cy")!);
      const r = parseFloat(c.getAttribute("r")!);
      expect(cx - r).toBeGreaterThanOrEqual(0);
      expect(cx + r).toBeLessThanOrEqual(32);
      expect(cy - r).toBeGreaterThanOrEqual(0);
      expect(cy + r).toBeLessThanOrEqual(32);
    }
    expect(container).toBeTruthy();
  });
});
