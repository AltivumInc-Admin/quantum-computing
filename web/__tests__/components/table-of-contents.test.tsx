/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, act } from "@testing-library/react";
import { TableOfContents } from "@/components/table-of-contents";
import type { Heading } from "@/lib/extract-headings";

type IOCallback = (entries: Array<Partial<IntersectionObserverEntry>>) => void;
let ioCallback: IOCallback = () => {};

beforeEach(() => {
  // jsdom has no IntersectionObserver; capture the callback so tests can drive it.
  class MockIO {
    constructor(cb: IOCallback) {
      ioCallback = cb;
    }
    observe = jest.fn();
    unobserve = jest.fn();
    disconnect = jest.fn();
    takeRecords = jest.fn();
    root = null;
    rootMargin = "";
    thresholds = [];
  }
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
    MockIO;
});

const headings: Heading[] = [
  { level: 2, text: "Alpha", slug: "alpha", line: 3 },
  { level: 3, text: "Beta", slug: "beta", line: 5 },
];

function enter(slug: string) {
  act(() => {
    ioCallback([
      { target: document.getElementById(slug) as Element, isIntersecting: true },
    ]);
  });
}

function leave(slug: string, top: number) {
  act(() => {
    ioCallback([
      {
        target: document.getElementById(slug) as Element,
        isIntersecting: false,
        boundingClientRect: { top } as DOMRectReadOnly,
      },
    ]);
  });
}

// Scrolled past the trigger band: the heading exits above the viewport top —
// the reader is now inside its section body.
const leaveUp = (slug: string) => leave(slug, -24);
// Scrolled back up: the heading drops below the band without being read.
const leaveDown = (slug: string) => leave(slug, 480);

describe("TableOfContents", () => {
  it("renders an anchor for each heading pointing at its slug", () => {
    render(<TableOfContents headings={headings} />);
    const alpha = screen.getByRole("link", { name: "Alpha" });
    const beta = screen.getByRole("link", { name: "Beta" });
    expect(alpha).toHaveAttribute("href", "#alpha");
    expect(beta).toHaveAttribute("href", "#beta");
  });

  it("renders nothing when there are no headings", () => {
    const { container } = render(<TableOfContents headings={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("marks the heading scrolled into view as the current location", () => {
    render(
      <>
        <h2 id="alpha">Alpha</h2>
        <h3 id="beta">Beta</h3>
        <TableOfContents headings={headings} />
      </>
    );
    enter("beta");
    expect(screen.getByRole("link", { name: "Beta" })).toHaveAttribute(
      "aria-current",
      "location"
    );
    expect(screen.getByRole("link", { name: "Alpha" })).not.toHaveAttribute(
      "aria-current"
    );
  });

  it("moves the active marker as a different heading enters view", () => {
    render(
      <>
        <h2 id="alpha">Alpha</h2>
        <h3 id="beta">Beta</h3>
        <TableOfContents headings={headings} />
      </>
    );
    enter("beta");
    expect(screen.getByRole("link", { name: "Beta" })).toHaveAttribute(
      "aria-current",
      "location"
    );
    enter("alpha");
    expect(screen.getByRole("link", { name: "Alpha" })).toHaveAttribute(
      "aria-current",
      "location"
    );
  });

  it("keeps a heading active after it scrolls past the trigger band (reading its body)", () => {
    // The lockstep promise: while the reader is inside a section taller than
    // the band, the heading that introduced it stays highlighted instead of
    // the rail going blank.
    render(
      <>
        <h2 id="alpha">Alpha</h2>
        <h3 id="beta">Beta</h3>
        <TableOfContents headings={headings} />
      </>
    );
    enter("alpha");
    leaveUp("alpha");
    expect(screen.getByRole("link", { name: "Alpha" })).toHaveAttribute(
      "aria-current",
      "location"
    );
  });

  it("hands the highlight to the next heading when it reaches the band", () => {
    render(
      <>
        <h2 id="alpha">Alpha</h2>
        <h3 id="beta">Beta</h3>
        <TableOfContents headings={headings} />
      </>
    );
    enter("alpha");
    leaveUp("alpha");
    enter("beta");
    expect(screen.getByRole("link", { name: "Beta" })).toHaveAttribute(
      "aria-current",
      "location"
    );
    expect(screen.getByRole("link", { name: "Alpha" })).not.toHaveAttribute(
      "aria-current"
    );
  });

  it("falls back to the previous passed heading when the reader scrolls back up", () => {
    render(
      <>
        <h2 id="alpha">Alpha</h2>
        <h3 id="beta">Beta</h3>
        <TableOfContents headings={headings} />
      </>
    );
    enter("alpha");
    leaveUp("alpha");
    enter("beta");
    leaveUp("beta");
    expect(screen.getByRole("link", { name: "Beta" })).toHaveAttribute(
      "aria-current",
      "location"
    );
    // Beta re-enters the band from above, then drops below it — the reader is
    // back inside Alpha's body.
    enter("beta");
    leaveDown("beta");
    expect(screen.getByRole("link", { name: "Alpha" })).toHaveAttribute(
      "aria-current",
      "location"
    );
    expect(screen.getByRole("link", { name: "Beta" })).not.toHaveAttribute(
      "aria-current"
    );
  });

  it("clears the active marker only above the first heading (the intro case)", () => {
    render(
      <>
        <h2 id="alpha">Alpha</h2>
        <h3 id="beta">Beta</h3>
        <TableOfContents headings={headings} />
      </>
    );
    enter("alpha");
    // Scrolled back into the intro: alpha drops below the band unread.
    leaveDown("alpha");
    expect(screen.getByRole("link", { name: "Alpha" })).not.toHaveAttribute(
      "aria-current"
    );
    expect(screen.getByRole("link", { name: "Beta" })).not.toHaveAttribute(
      "aria-current"
    );
  });
});
