/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { TransitionLink } from "@/components/transition-link";

const pushMock = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
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
  const startViewTransition = jest.fn((cb: () => void) => {
    cb();
    return { finished: Promise.resolve(), ready: Promise.resolve(), updateCallbackDone: Promise.resolve() };
  });

  beforeEach(() => {
    pushMock.mockClear();
    startViewTransition.mockClear();
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
});
