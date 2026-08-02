/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { act, render, screen } from "@testing-library/react";
import { CountUp } from "@/components/welcome/count-up";

function mockMatchMedia(reduceMatches: boolean) {
  window.matchMedia = jest.fn().mockReturnValue({
    matches: reduceMatches,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  }) as unknown as typeof window.matchMedia;
}

/** IntersectionObserver stub that reports intersection immediately. */
class ImmediateIO {
  constructor(private cb: IntersectionObserverCallback) {}
  observe() {
    this.cb(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
  disconnect() {}
  unobserve() {}
}

describe("CountUp", () => {
  afterEach(() => {
    jest.useRealTimers();
    // @ts-expect-error -- restore jsdom's absence of the API between tests
    delete window.IntersectionObserver;
  });

  it("renders the true value for screen readers and keeps it static under reduced motion", () => {
    mockMatchMedia(true);
    render(<CountUp value={45} />);
    // sr-only truth + aria-hidden twin, both showing the final value —
    // reduced motion must never rewind the visible number to 0.
    const values = screen.getAllByText("45");
    expect(values).toHaveLength(2);
    const hidden = values.find((el) => el.getAttribute("aria-hidden") === "true");
    const srOnly = values.find((el) => el.classList.contains("sr-only"));
    expect(hidden).toBeDefined();
    expect(srOnly).toBeDefined();
  });

  it("counts up to exactly the final value once visible when motion is allowed", () => {
    mockMatchMedia(false);
    window.IntersectionObserver = ImmediateIO as unknown as typeof IntersectionObserver;
    jest.useFakeTimers();
    let now = 0;
    jest.spyOn(performance, "now").mockImplementation(() => now);
    const frames: FrameRequestCallback[] = [];
    jest
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((cb: FrameRequestCallback) => {
        frames.push(cb);
        return frames.length;
      });

    render(<CountUp value={45} durationMs={100} startDelayMs={0} />);
    // The observer fired at mount → rewound to 0 and queued the first frame.
    act(() => jest.advanceTimersByTime(0));
    const visible = () =>
      screen
        .getAllByText(/^\d+$/)
        .find((el) => el.getAttribute("aria-hidden") === "true")!.textContent;
    expect(visible()).toBe("0");

    // Drive frames past the duration; the count must land on exactly 45.
    act(() => {
      for (let i = 0; i < 20 && frames.length > 0; i++) {
        now += 20;
        frames.shift()!(now);
      }
    });
    expect(visible()).toBe("45");
  });
});
