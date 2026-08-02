/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { act, render, screen } from "@testing-library/react";
import { PlaygroundMock } from "@/components/welcome/playground-mock";
import { parseProgram, opsFor } from "@/components/quantum/qsim-dsl";
import { probabilities, simulate } from "@/components/quantum/math";
import { formatPercent } from "@/components/quantum/format";
import { LocaleProvider } from "@/i18n";

function mockMatchMedia(reduceMatches: boolean) {
  window.matchMedia = jest.fn().mockReturnValue({
    matches: reduceMatches,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  }) as unknown as typeof window.matchMedia;
}

function renderMock() {
  return render(
    <LocaleProvider>
      <PlaygroundMock />
    </LocaleProvider>,
  );
}

describe("PlaygroundMock", () => {
  afterEach(() => {
    jest.useRealTimers();
    // @ts-expect-error -- restore jsdom's absence of the API between tests
    delete window.IntersectionObserver;
  });

  it("shows the finished frame with simulate()'s real probabilities under reduced motion", () => {
    mockMatchMedia(true);
    renderMock();

    // Recompute the expected values through the SAME kernel the component
    // uses — the test asserts agreement, not hand-copied numbers.
    const program = parseProgram("H 0\nCNOT 0 1\nRY 1 0.79");
    const probs = probabilities(simulate(opsFor(program, 0), program.n));
    expect(probs).toHaveLength(4);
    for (const p of probs) {
      const matches = screen.getAllByText(formatPercent(p * 100));
      expect(matches.length).toBeGreaterThanOrEqual(1);
    }

    // All three source lines are on screen (gate token spans).
    for (const gate of ["H", "CNOT", "RY"]) {
      expect(screen.getAllByText(gate).length).toBeGreaterThanOrEqual(1);
    }
  });

  it("is decoration: aria-hidden and inert so the embedded focusable diagram is unreachable", () => {
    mockMatchMedia(true);
    const { container } = renderMock();
    const card = container.querySelector("[aria-hidden='true']");
    expect(card).not.toBeNull();
    expect(card).toHaveAttribute("inert");
    // The inert subtree really does contain what would otherwise be a focus
    // stop — that is why the attribute must exist.
    expect(card!.querySelector("[tabindex]")).not.toBeNull();
  });

  it("types the program line by line and grows the circuit when motion is allowed", async () => {
    mockMatchMedia(false);
    // No IntersectionObserver in jsdom → the component treats the card as
    // visible and the loop free-runs.
    jest.useFakeTimers();
    renderMock();

    // The loop starts by fading and resetting to an empty editor.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(400);
    });
    expect(screen.queryByText("CNOT")).not.toBeInTheDocument();

    // First line ("H 0") types out and commits -> a one-qubit circuit with
    // real 50/50 probabilities appears.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(3 * 55 + 900);
    });
    expect(screen.getAllByText("50.0%").length).toBeGreaterThanOrEqual(2);

    // Two more lines commit -> the final Bell-then-tilt frame, again from the
    // real kernel.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(8 * 55 + 900 + 9 * 55 + 900 + 500);
    });
    expect(screen.getByText("CNOT")).toBeInTheDocument();
    const program = parseProgram("H 0\nCNOT 0 1\nRY 1 0.79");
    const probs = probabilities(simulate(opsFor(program, 0), program.n));
    for (const p of probs) {
      expect(screen.getAllByText(formatPercent(p * 100)).length).toBeGreaterThanOrEqual(1);
    }
  });
});
