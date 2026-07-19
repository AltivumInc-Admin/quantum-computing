/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { TransitionLink } from "@/components/transition-link";

const pushMock = jest.fn();
let mockPathname = "/learn/01-foundations";
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => mockPathname,
}));

jest.mock("next/link", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: ({
      href,
      children,
      onClick,
      ...props
    }: {
      href: string;
      children: React.ReactNode;
      onClick?: (e: unknown) => void;
    }) => React.createElement("a", { href, onClick, ...props }, children),
  };
});

describe("TransitionLink", () => {
  // The update callback may return a promise (it does: the capture is held
  // until the route commits); chain it so tests can observe when it settles.
  const startViewTransition = jest.fn((cb: () => void | Promise<void>) => {
    const updateCallbackDone = Promise.resolve(cb()).then(() => undefined);
    return {
      finished: updateCallbackDone,
      ready: updateCallbackDone,
      updateCallbackDone,
    };
  });

  beforeEach(() => {
    pushMock.mockClear();
    startViewTransition.mockClear();
    mockPathname = "/learn/01-foundations";
    (document as unknown as { startViewTransition: typeof startViewTransition }).startViewTransition =
      startViewTransition;
    window.matchMedia = jest
      .fn()
      .mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
  });

  it("routes a plain click through startViewTransition and the router", () => {
    render(<TransitionLink href="/learn/03-algorithms">Next</TransitionLink>);
    fireEvent.click(screen.getByText("Next"));
    expect(startViewTransition).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledWith("/learn/03-algorithms");
  });

  it("lets the browser handle modified clicks (new tab / etc.)", () => {
    render(<TransitionLink href="/learn/03-algorithms">Next</TransitionLink>);
    fireEvent.click(screen.getByText("Next"), { metaKey: true });
    expect(startViewTransition).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("skips the transition when the reader prefers reduced motion", () => {
    window.matchMedia = jest
      .fn()
      .mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    render(<TransitionLink href="/learn/03-algorithms">Next</TransitionLink>);
    fireEvent.click(screen.getByText("Next"));
    // Returns before preventDefault → native <Link> navigation, no VT.
    expect(startViewTransition).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("forwards an incoming onClick handler", () => {
    const onClick = jest.fn();
    render(
      <TransitionLink href="/learn/03-algorithms" onClick={onClick}>
        Next
      </TransitionLink>
    );
    fireEvent.click(screen.getByText("Next"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("holds the view-transition capture until the route commits", async () => {
    // router.push resolves immediately while the route renders async; if the
    // update callback settled then, the API would snapshot the OLD frame as
    // "new" and slow navigations would degrade to a fade + hard cut.
    jest.useFakeTimers();
    try {
      let released = false;
      const { rerender } = render(
        <TransitionLink href="/learn/03-algorithms">Next</TransitionLink>
      );
      fireEvent.click(screen.getByText("Next"));
      startViewTransition.mock.results[0].value.updateCallbackDone.then(() => {
        released = true;
      });

      await act(async () => {});
      expect(pushMock).toHaveBeenCalledWith("/learn/03-algorithms");
      expect(released).toBe(false);

      // The route commits: pathname flips, and the capture is released.
      mockPathname = "/learn/03-algorithms";
      rerender(<TransitionLink href="/learn/03-algorithms">Next</TransitionLink>);
      await act(async () => {});
      expect(released).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it("releases the capture via the fallback timeout when the navigation never commits", async () => {
    // An aborted navigation must not freeze rendering behind a pending
    // view-transition capture.
    jest.useFakeTimers();
    try {
      let released = false;
      render(<TransitionLink href="/learn/03-algorithms">Next</TransitionLink>);
      fireEvent.click(screen.getByText("Next"));
      startViewTransition.mock.results[0].value.updateCallbackDone.then(() => {
        released = true;
      });

      await act(async () => {});
      expect(released).toBe(false);

      act(() => {
        jest.advanceTimersByTime(1000);
      });
      await act(async () => {});
      expect(released).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });
});
