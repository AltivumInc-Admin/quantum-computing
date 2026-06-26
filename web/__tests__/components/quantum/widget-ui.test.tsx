/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { Bar, LiveStatus, ProbBars } from "@/components/quantum/widget-ui";

describe("LiveStatus", () => {
  it("renders a polite, visually-hidden status region carrying its children", () => {
    render(<LiveStatus>hello world</LiveStatus>);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("hello world");
    expect(status).toHaveClass("sr-only");
    expect(status).toHaveAttribute("aria-live", "polite");
  });

  it("renders an empty region (nothing to announce) without error", () => {
    render(<LiveStatus>{""}</LiveStatus>);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });
});

describe("Bar", () => {
  it("renders the ket label, fill, and value text", () => {
    const { container } = render(
      <Bar label="01" fraction={0.75} valueText="75.0%" />
    );
    expect(screen.getByText(/\|01⟩/)).toBeInTheDocument();
    expect(screen.getByText("75.0%")).toBeInTheDocument();
    const fill = container.querySelector("span[style]");
    expect(fill).toHaveStyle({ width: "75.00%" });
  });

  it("clamps fraction > 1 to 100%", () => {
    const { container } = render(
      <Bar label="x" fraction={1.5} valueText="x" />
    );
    const fill = container.querySelector("span[style]");
    expect(fill).toHaveStyle({ width: "100.00%" });
  });

  it("clamps negative fraction to 0%", () => {
    const { container } = render(
      <Bar label="x" fraction={-0.3} valueText="x" />
    );
    const fill = container.querySelector("span[style]");
    expect(fill).toHaveStyle({ width: "0.00%" });
  });

  it("includes motion-reduce:transition-none on the fill", () => {
    const { container } = render(
      <Bar label="a" fraction={0.5} valueText="50%" />
    );
    const fill = container.querySelector("span[style]");
    expect(fill?.className).toContain("motion-reduce:transition-none");
  });
});

describe("ProbBars", () => {
  it("renders default basisLabel ket labels and percentage values", () => {
    render(<ProbBars probs={[0.25, 0.75]} n={1} />);
    expect(screen.getByText(/\|0⟩/)).toBeInTheDocument();
    expect(screen.getByText(/\|1⟩/)).toBeInTheDocument();
    expect(screen.getByText("25.0%")).toBeInTheDocument();
    expect(screen.getByText("75.0%")).toBeInTheDocument();
  });

  it("accepts a custom labelFor override", () => {
    render(
      <ProbBars
        probs={[1, 0, 0, 0]}
        n={2}
        labelFor={(i) => `v${i}`}
      />
    );
    expect(screen.getByText(/\|v0⟩/)).toBeInTheDocument();
    expect(screen.queryByText(/\|00⟩/)).not.toBeInTheDocument();
  });
});
