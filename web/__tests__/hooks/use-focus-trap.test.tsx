/**
 * @jest-environment jsdom
 */
import { useRef } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { useFocusTrap } from "@/hooks/use-focus-trap";

/**
 * The Tab-cycle wrap logic had zero coverage while it lived (triplicated) in
 * section-gate-modal, sidebar, and ask-tutor — none of those suites dispatch a
 * Tab keydown. These tests pin the shared hook's contract directly.
 *
 * jsdom never moves focus on a Tab keydown by itself, so any focus change
 * observed here is the trap's own doing.
 */

function TrapDialog({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const trapFocus = useFocusTrap(ref);
  return (
    // Mirrors the real dialogs: the container itself is focused on open via
    // tabIndex={-1}, which also keeps it out of the FOCUSABLE list.
    <div ref={ref} tabIndex={-1} data-testid="dialog" onKeyDown={trapFocus}>
      {children}
    </div>
  );
}

describe("useFocusTrap", () => {
  it("Tab on the last focusable wraps to the first", () => {
    render(
      <TrapDialog>
        <button>first</button>
        <a href="/somewhere">middle</a>
        <button>last</button>
      </TrapDialog>
    );
    const last = screen.getByRole("button", { name: "last" });
    last.focus();

    fireEvent.keyDown(last, { key: "Tab" });

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "first" }));
  });

  it("Tab from the middle is left to the browser (no wrap)", () => {
    render(
      <TrapDialog>
        <button>first</button>
        <button>middle</button>
        <button>last</button>
      </TrapDialog>
    );
    const middle = screen.getByRole("button", { name: "middle" });
    middle.focus();

    fireEvent.keyDown(middle, { key: "Tab" });

    expect(document.activeElement).toBe(middle);
  });

  it("shift-Tab on the first focusable wraps to the last", () => {
    render(
      <TrapDialog>
        <button>first</button>
        <button>last</button>
      </TrapDialog>
    );
    const first = screen.getByRole("button", { name: "first" });
    first.focus();

    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "last" }));
  });

  it("shift-Tab when the container itself holds focus wraps to the last", () => {
    // Every adopting dialog focuses its container (tabIndex={-1}) on open; the
    // first backward Tab from that state must stay inside the trap.
    render(
      <TrapDialog>
        <button>first</button>
        <button>last</button>
      </TrapDialog>
    );
    const dialog = screen.getByTestId("dialog");
    dialog.focus();

    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "last" }));
  });

  it("excludes disabled controls when picking the wrap edges", () => {
    // DOM order: button, input, disabled button, disabled textarea. The
    // enabled input is the true last focusable — Tab from it must wrap
    // straight to the first button, proving both disabled controls are
    // outside the trap.
    render(
      <TrapDialog>
        <button>first</button>
        <input aria-label="field" />
        <button disabled>disabled action</button>
        <textarea disabled aria-label="disabled notes" />
      </TrapDialog>
    );
    const input = screen.getByLabelText("field");
    input.focus();

    fireEvent.keyDown(input, { key: "Tab" });

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "first" }));
  });

  it("does nothing when the container has no focusable elements", () => {
    render(
      <TrapDialog>
        <p>static text only</p>
      </TrapDialog>
    );
    const dialog = screen.getByTestId("dialog");
    dialog.focus();

    fireEvent.keyDown(dialog, { key: "Tab" });
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });

    expect(document.activeElement).toBe(dialog);
  });
});
