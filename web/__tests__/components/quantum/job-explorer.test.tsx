/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { JobExplorer } from "@/components/quantum/job-explorer";

// jsdom does not implement matchMedia; the widget's reduced-motion hook needs it.
function mockMatchMedia(reduced: boolean) {
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: reduced,
    media: query,
    onchange: null,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }));
}

describe("JobExplorer", () => {
  it("exposes named wall-clock and cost bars for both panels (SubBar extraction lock)", () => {
    render(<JobExplorer source="" />);
    expect(screen.getAllByRole("img", { name: /wall-clock bar/i })).toHaveLength(2);
    expect(screen.getAllByRole("img", { name: /cost bar/i })).toHaveLength(2);
  });
  beforeEach(() => mockMatchMedia(false));

  it("renders the header from an empty source (defaults)", () => {
    render(<JobExplorer source="" />);
    expect(screen.getByText("Standalone vs Hybrid Job")).toBeInTheDocument();
  });

  it("renders the header from a valid JSON source", () => {
    render(
      <JobExplorer
        source={JSON.stringify({
          iterations: 60,
          shots: 1000,
          provider: "IonQ",
          instance: "ml.m5.large",
          queueWaitSec: 45,
          iterSec: 6,
        })}
      />
    );
    expect(screen.getByText("Standalone vs Hybrid Job")).toBeInTheDocument();
  });

  it("renders the qjob error card for a malformed source without throwing", () => {
    expect(() => render(<JobExplorer source="{not json" />)).not.toThrow();
    expect(screen.getByText(/qjob error:/i)).toBeInTheDocument();
  });
  it("renders the qjob error card for a non-finite numeric field", () => {
    render(<JobExplorer source={'{"iterations": 1e999}'} />);
    expect(screen.getByText(/qjob error/i)).toBeInTheDocument();
  });
  it("renders the qjob error card for a non-numeric field", () => {
    render(<JobExplorer source={'{"shots":"many"}'} />);
    expect(screen.getByText(/qjob error/i)).toBeInTheDocument();
  });
});
