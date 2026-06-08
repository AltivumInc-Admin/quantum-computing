/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
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
});
