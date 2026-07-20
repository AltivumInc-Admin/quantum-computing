/**
 * @jest-environment jsdom
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { CopyButton } from "@/components/copy-button";

describe("CopyButton", () => {
  const writeText = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    writeText.mockClear();
    Object.assign(navigator, { clipboard: { writeText } });
  });

  it("copies the provided text on click", () => {
    render(<CopyButton getText={() => "H 0\nCNOT 0 1"} />);
    fireEvent.click(screen.getByRole("button", { name: /copy/i }));
    expect(writeText).toHaveBeenCalledWith("H 0\nCNOT 0 1");
  });

  it("computes the text lazily at click time (not render time)", () => {
    let value = "a";
    render(<CopyButton getText={() => value} />);
    value = "b";
    fireEvent.click(screen.getByRole("button"));
    expect(writeText).toHaveBeenCalledWith("b");
  });

  it("announces copied feedback after copying", async () => {
    render(<CopyButton getText={() => "x"} />);
    fireEvent.click(screen.getByRole("button"));
    expect(await screen.findByText(/copied/i)).toBeInTheDocument();
  });

  it("uses a custom accessible label", () => {
    render(<CopyButton getText={() => "x"} label="Copy state" />);
    expect(screen.getByRole("button", { name: /copy state/i })).toBeInTheDocument();
  });

  it("falls back without throwing when the clipboard API is unavailable", () => {
    // @ts-expect-error simulate an insecure / unsupported context
    delete navigator.clipboard;
    document.execCommand = jest.fn();
    render(<CopyButton getText={() => "x"} />);
    expect(() => fireEvent.click(screen.getByRole("button"))).not.toThrow();
    expect(document.execCommand).toHaveBeenCalledWith("copy");
  });

  it("does NOT announce Copied when both clipboard paths fail", async () => {
    // @ts-expect-error insecure / unsupported context
    delete navigator.clipboard;
    document.execCommand = jest.fn().mockReturnValue(false); // fallback reports failure
    render(<CopyButton getText={() => "x"} />);
    fireEvent.click(screen.getByRole("button"));
    expect(await screen.findByRole("button", { name: /copy failed/i })).toBeInTheDocument();
    expect(screen.queryByText("Copied")).toBeNull();
  });

  it("clears its reset timer on unmount", async () => {
    const clear = jest.spyOn(global, "clearTimeout");
    try {
      const { unmount } = render(<CopyButton getText={() => "x"} />);
      fireEvent.click(screen.getByRole("button"));
      // copy() is async, so the 1.5s timer is armed a microtask later; waiting
      // for the announcement guarantees it exists before we unmount.
      await screen.findByText(/copied/i);
      clear.mockClear();
      unmount();
      // Without this the reset outlives a lesson-to-lesson navigation, and this
      // is the platform's most-instantiated copy affordance (one per fence).
      expect(clear).toHaveBeenCalled();
    } finally {
      clear.mockRestore();
    }
  });

  describe("variants are props, never a className override", () => {
    it("selects the compact box AND glyph together", () => {
      const { container } = render(<CopyButton getText={() => "x"} size="sm" />);
      const cls = container.querySelector("button")!.className;
      expect(cls).toContain("h-6");
      expect(cls).not.toContain("h-8");
      expect(cls).toContain("[&_svg]:h-3");
    });

    it("selects the on-dark tone instead of emitting a competing text color", () => {
      const { container } = render(<CopyButton getText={() => "x"} tone="on-dark" />);
      const cls = container.querySelector("button")!.className;
      expect(cls).toContain("text-gray-300");
      expect(cls).not.toContain("text-caption");
    });

    it("no call site in src/ hands CopyButton a className", () => {
      // Tailwind resolves same-layer conflicts by STYLESHEET order, not by the
      // order of names in the attribute, and this component's base classes are
      // emitted after anything a caller would pass — so a trailing override is
      // silently discarded. Both former override sites lost that way (a 2.15:1
      // copy icon and a 32px pill around a 12px glyph). The prop signature no
      // longer accepts className, so tsc is the primary guard; this pins it
      // against a well-meaning re-introduction.
      const src = join(__dirname, "../../src");
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const e of readdirSync(dir, { withFileTypes: true })) {
          const full = join(dir, e.name);
          if (e.isDirectory()) walk(full);
          else if (/\.tsx$/.test(e.name)) files.push(full);
        }
      };
      walk(src);

      const offenders: string[] = [];
      for (const file of files) {
        const text = readFileSync(file, "utf8");
        for (const m of text.matchAll(/<CopyButton\b[\s\S]*?\/>/g)) {
          if (/\bclassName=/.test(m[0])) offenders.push(file.slice(src.length + 1));
        }
      }
      expect(offenders).toEqual([]);
    });
  });
});
