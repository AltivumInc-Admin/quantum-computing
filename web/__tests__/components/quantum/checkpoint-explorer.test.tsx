/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

import { CheckpointExplorer } from "@/components/quantum/checkpoint-explorer";

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

describe("CheckpointExplorer", () => {
  beforeEach(() => mockMatchMedia(false));

  it("renders the Checkpointing header with an empty source (defaults)", () => {
    render(<CheckpointExplorer source="" />);
    expect(screen.getByText("Checkpointing")).toBeInTheDocument();
  });

  it("renders the Checkpointing header with a valid JSON source", () => {
    render(
      <CheckpointExplorer
        source={JSON.stringify({ iterations: 40, failAt: 27, every: 10 })}
      />
    );
    expect(screen.getByText("Checkpointing")).toBeInTheDocument();
  });

  it("renders the qcheckpoint error card on malformed source without throwing", () => {
    expect(() =>
      render(<CheckpointExplorer source="{not json" />)
    ).not.toThrow();
    expect(screen.getByText(/qcheckpoint error:/)).toBeInTheDocument();
  });

  it("renders stat labels with the shared .text-caption utility", () => {
    render(
      <CheckpointExplorer
        source={JSON.stringify({ iterations: 40, failAt: 27, every: 10 })}
      />
    );
    const label = screen.getByText("iterations saved");
    expect(label).toHaveClass("text-caption");
    expect(label).not.toHaveClass("text-gray-400");
  });

  it("preserves base-track rect count after slider interaction (memo integrity)", () => {
    render(
      <CheckpointExplorer
        source={JSON.stringify({ iterations: 40, failAt: 27, every: 10 })}
      />
    );
    fireEvent.change(screen.getByLabelText(/iteration at which/i), { target: { value: "15" } });
    const timelines = screen.getAllByRole("img");
    for (const svg of timelines) {
      const rects = svg.querySelectorAll("rect");
      const baseCells = Array.from(rects).filter((r) =>
        r.getAttribute("fill")?.includes("10%")
      );
      expect(baseCells).toHaveLength(40);
    }
  });
  it("announces the iterations saved", () => {
    render(
      <CheckpointExplorer
        source={JSON.stringify({ iterations: 40, failAt: 27, every: 10 })}
      />
    );
    expect(screen.getByRole("status")).toHaveTextContent(/iterations saved/i);
  });
});
