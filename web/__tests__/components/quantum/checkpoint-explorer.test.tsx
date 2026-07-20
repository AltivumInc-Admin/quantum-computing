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

  /**
   * Previously titled "(memo integrity)", which it could not enforce: the base
   * cells are `Array.from({ length: iterations })` memoized on
   * [iterations, cellW], and the slider it drives (failAt) is in neither dep —
   * so the asserted count of 40 held with the useMemo deleted outright. React
   * element identity, the one property the memo actually controls, is not
   * observable from the DOM (reconciliation reuses the nodes either way). So
   * this is re-scoped to what it genuinely locks — the render shape, plus the
   * failAt-dependent state that the interaction is supposed to move.
   */
  it("re-renders one base cell per iteration and moves the failure point on interaction", () => {
    render(
      <CheckpointExplorer
        source={JSON.stringify({ iterations: 40, failAt: 27, every: 10 })}
      />
    );
    expect(
      screen.getByRole("img", { name: /No-checkpoint timeline .* Failure at iteration 27\./ })
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/iteration at which/i), { target: { value: "15" } });

    const timelines = screen.getAllByRole("img");
    for (const svg of timelines) {
      const rects = svg.querySelectorAll("rect");
      const baseCells = Array.from(rects).filter((r) =>
        r.getAttribute("fill")?.includes("10%")
      );
      expect(baseCells).toHaveLength(40);
    }
    // The interaction actually changed the model, not just the slider value:
    // 15 redone without a checkpoint, 5 with one (last checkpoint at 10).
    expect(
      screen.getByRole("img", { name: /No-checkpoint timeline .* redoes all 15 completed/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /last checkpoint is at 10, so a restart redoes only 5/ })
    ).toBeInTheDocument();
  });

  it("does not assert an arithmetic tie between the H2 fixture and the iteration count", () => {
    // The fixture is a fixed 49 points while `iterations` is fence-configurable
    // (2..120) and never enters the checkpointing model, so a "49 bond lengths"
    // chip beside "40 iters" invited a relationship that does not exist.
    render(
      <CheckpointExplorer
        source={JSON.stringify({ iterations: 40, failAt: 27, every: 10 })}
      />
    );
    expect(screen.queryByText(/bond lengths/)).not.toBeInTheDocument();
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
