/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { CodeBlock } from "@/components/code-block";

describe("CodeBlock", () => {
  const writeText = jest.fn().mockResolvedValue(undefined);
  beforeEach(() => {
    writeText.mockClear();
    Object.assign(navigator, { clipboard: { writeText } });
  });

  it("renders the highlighted code children (preserves syntax tokens)", () => {
    render(
      <CodeBlock rawText="print('hi')" language="python">
        <code className="hljs">print(&apos;hi&apos;)</code>
      </CodeBlock>
    );
    expect(screen.getByText("print('hi')")).toBeInTheDocument();
  });

  it("shows an uppercased language chip", () => {
    render(
      <CodeBlock rawText="x" language="python">
        <code>x</code>
      </CodeBlock>
    );
    expect(screen.getByText("PYTHON")).toBeInTheDocument();
  });

  it("omits the chip for plain text / no language", () => {
    render(
      <CodeBlock rawText="x" language="text">
        <code>x</code>
      </CodeBlock>
    );
    expect(screen.queryByText("TEXT")).not.toBeInTheDocument();
  });

  it("copies the exact raw source (not the chip or token markup)", () => {
    render(
      <CodeBlock rawText={"a\nb"} language="python">
        <code>a b</code>
      </CodeBlock>
    );
    fireEvent.click(screen.getByRole("button", { name: /copy/i }));
    expect(writeText).toHaveBeenCalledWith("a\nb");
  });

  it("qualifies the copy button's accessible name with the language", () => {
    // A lesson carries many fences; four of the five CopyButton call sites in
    // the tree pass a specific label, and an unqualified run of identical "Copy"
    // entries in a screen reader's button list is useless for telling them apart.
    render(
      <CodeBlock rawText="x" language="python">
        <code>x</code>
      </CodeBlock>
    );
    expect(screen.getByRole("button", { name: "Copy python snippet" })).toBeInTheDocument();
  });

  it("falls back to a generic snippet name when the fence has no language", () => {
    render(
      <CodeBlock rawText="x">
        <code>x</code>
      </CodeBlock>
    );
    expect(screen.getByRole("button", { name: "Copy code snippet" })).toBeInTheDocument();
  });

  it("gives the copy button the on-dark tone, not a losing className override", () => {
    // The chrome sits on a pinned gray-800/80 chip over gray-900 in BOTH themes.
    // Passing `text-gray-300` as a trailing className silently lost to
    // CopyButton's own `.text-caption` base (Tailwind resolves same-layer
    // conflicts by stylesheet order), painting var(--mut) at 2.15:1 in the light
    // theme. The tone must come from the prop that SELECTS the base classes.
    render(
      <CodeBlock rawText="x" language="python">
        <code>x</code>
      </CodeBlock>
    );
    const copy = screen.getByRole("button", { name: /copy/i });
    expect(copy.className).toContain("text-gray-300");
    expect(copy.className).not.toContain("text-caption");
  });

  it("toggles word wrap on the code block", () => {
    const { container } = render(
      <CodeBlock rawText="x" language="python">
        <code>x</code>
      </CodeBlock>
    );
    const pre = container.querySelector("pre")!;
    expect(pre.className).toContain("whitespace-pre");
    expect(pre.className).not.toContain("whitespace-pre-wrap");
    fireEvent.click(screen.getByRole("button", { name: /wrap/i }));
    expect(pre.className).toContain("whitespace-pre-wrap");
  });

  it("reserves headroom for the always-visible chrome on touch devices", () => {
    // Touch devices (no hover) show the chip/wrap/copy chrome permanently, so
    // the pre must reserve top padding under it; hover-capable devices get the
    // compact padding back via the can-hover variant.
    const { container } = render(
      <CodeBlock rawText="x" language="python">
        <code>x</code>
      </CodeBlock>
    );
    const pre = container.querySelector("pre")!;
    expect(pre.className).toContain("pt-12");
    expect(pre.className).toContain("can-hover:pt-3.5");
  });

  it("is not a keyboard scroll region when the code fits (no overflow)", () => {
    const { container } = render(
      <CodeBlock rawText="x" language="python">
        <code>x</code>
      </CodeBlock>
    );
    const pre = container.querySelector("pre")!;
    // jsdom reports scrollWidth === clientWidth === 0, so it does not overflow.
    expect(pre).not.toHaveAttribute("tabindex");
    expect(pre).not.toHaveAttribute("role");
  });

  it("becomes a labelled keyboard scroll region when the PRE itself overflows", () => {
    // Deliberately NOT a jest.spyOn(HTMLElement.prototype, ...) fake: faking
    // overflow onto every element in the tree cannot tell which element the
    // component actually measured, and that is precisely the bug this case
    // exists to catch (the measurement used to read an element that a vendor
    // stylesheet had quietly relieved of the overflow). Overflow is defined on
    // the ONE <pre> instance, then a wrap round-trip re-runs the measure effect.
    const { container } = render(
      <CodeBlock rawText="x" language="python">
        <code>x</code>
      </CodeBlock>
    );
    const pre = container.querySelector("pre")!;
    Object.defineProperty(pre, "scrollWidth", { value: 400, configurable: true });
    Object.defineProperty(pre, "clientWidth", { value: 120, configurable: true });

    const wrapToggle = screen.getByRole("button", { name: /wrap/i });
    fireEvent.click(wrapToggle);
    fireEvent.click(wrapToggle);

    expect(pre).toHaveAttribute("tabindex", "0");
    expect(pre).toHaveAttribute("role", "region");
    expect(pre).toHaveAttribute("aria-label", "python snippet");
    // The focus indicator must live on the focusable element, and the wrapper
    // must not clip it: .focus-ring is an OUTSET box-shadow in Tailwind v4 and
    // .focus-ring's own outline-none has removed the UA fallback, so an
    // overflow-hidden ancestor leaves a keyboard user with no indicator at all.
    expect(pre.className).toContain("focus-ring");
    expect(container.firstElementChild!.className).not.toContain("overflow-hidden");
  });
});
