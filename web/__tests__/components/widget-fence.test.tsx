/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { readFileSync } from "fs";
import { join } from "path";
import { render, screen, act } from "@testing-library/react";
import {
  WidgetFence,
  REGISTERED_WIDGET_LANGS,
} from "@/components/quantum/widget-fence";
import { WIDGET_LANGS } from "@/components/quantum/widget-langs";

describe("WidgetFence registry", () => {
  it("registry tokens exactly match WIDGET_LANGS (no drift between server gate and client map)", () => {
    expect([...REGISTERED_WIDGET_LANGS].sort()).toEqual([...WIDGET_LANGS].sort());
  });

  it("every WIDGET_LANGS token resolves to a registry entry", () => {
    const registered = new Set(REGISTERED_WIDGET_LANGS);
    for (const lang of WIDGET_LANGS) {
      expect(registered.has(lang)).toBe(true);
    }
  });

  it("falls back to showing the raw source for an unregistered token", () => {
    render(<WidgetFence language="not-a-widget" source="RAW-SOURCE-123" />);
    expect(screen.getByText("RAW-SOURCE-123")).toBeInTheDocument();
  });
});

describe("WidgetFence approach gating", () => {
  type IOCallback = (entries: Array<{ isIntersecting: boolean }>) => void;
  let instances: Array<{
    callback: IOCallback;
    options?: IntersectionObserverInit;
    observe: jest.Mock;
    disconnect: jest.Mock;
  }>;

  beforeEach(() => {
    instances = [];
    class MockIO {
      observe = jest.fn();
      disconnect = jest.fn();
      unobserve = jest.fn();
      constructor(cb: IOCallback, options?: IntersectionObserverInit) {
        instances.push({ callback: cb, options, observe: this.observe, disconnect: this.disconnect });
      }
    }
    (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver =
      MockIO as unknown as typeof IntersectionObserver;
  });

  afterEach(() => {
    delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
  });

  it("holds a height-matched skeleton and does not mount the widget until approach", () => {
    const { container } = render(<WidgetFence language="qcost" source="{}" />);
    const gate = container.querySelector('[data-widget-gate="qcost"]');
    expect(gate).not.toBeNull();
    // The pre-mount skeleton carries the same min-height as the loading state.
    expect(gate!.firstElementChild!.className).toContain("min-h-[240px]");
    expect(instances).toHaveLength(1);
    expect(instances[0].observe).toHaveBeenCalledWith(gate);
    // Widgets wake 400px before the viewport reaches them.
    expect(instances[0].options?.rootMargin).toBe("400px 0px");
  });

  it("mounts the widget once the observer reports approach", () => {
    const { container } = render(<WidgetFence language="qcost" source="{}" />);
    expect(container.querySelector("[data-widget-gate]")).not.toBeNull();
    act(() => instances[0].callback([{ isIntersecting: true }]));
    // The gate wrapper is gone: the (dynamic) widget subtree rendered instead.
    expect(container.querySelector("[data-widget-gate]")).toBeNull();
    expect(instances[0].disconnect).toHaveBeenCalled();
  });

  it("ignores non-intersecting reports (stays gated)", () => {
    const { container } = render(<WidgetFence language="qcost" source="{}" />);
    act(() => instances[0].callback([{ isIntersecting: false }]));
    expect(container.querySelector("[data-widget-gate]")).not.toBeNull();
  });

  it("mounts immediately when IntersectionObserver is unavailable", () => {
    delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
    const { container } = render(<WidgetFence language="qcost" source="{}" />);
    expect(container.querySelector("[data-widget-gate]")).toBeNull();
  });

  /**
   * The gate ↔ MOUNTED-widget comparison the height-matched-skeleton test above
   * cannot make: it only proves the gate skeleton equals the chunk-LOADING
   * skeleton, so both could reserve the wrong space together (they did — the
   * skeleton carried `my-6` while every Rep/activity card renders `my-8`, and
   * `runnable` sat in the 460px `tall` bucket for a widget whose height is fixed
   * at ~346px). The mounted widget is a lazy chunk that jsdom will not resolve,
   * so parity is asserted against each widget module's own root class string.
   */
  const ACTIVITY_WIDGETS: Array<[string, string]> = [
    ["qchallenge", "challenge.tsx"],
    ["qpredict", "predict-widget.tsx"],
    ["qdebug", "debug-circuit-widget.tsx"],
    ["quiz", "quiz.tsx"],
    ["runnable", "runnable-editor.tsx"],
    ["qcard", "review-card.tsx"],
  ];

  it.each(ACTIVITY_WIDGETS)(
    "reserves the same vertical margin for %s as the widget itself renders",
    (token, file) => {
      const src = readFileSync(
        join(__dirname, "..", "..", "src", "components", "quantum", file),
        "utf8",
      );
      // Every widget in this family renders `not-prose my-8 …` at its root.
      expect(src).toMatch(/not-prose my-8/);
      const { container } = render(<WidgetFence language={token} source="{}" />);
      const skeleton = container.querySelector(`[data-widget-gate="${token}"]`)!
        .firstElementChild!;
      expect(skeleton.className).toContain("my-8");
    },
  );

  it("buckets the runnable editor to a height its fixed composition can fill", () => {
    // RunnableEditor's idle height is fully determined: a 2px ribbon, the
    // header, CodeEditor's fixed `height` container and the keyboard-exit hint
    // (~346px). The output panel does not exist until a run, so a `tall`
    // (460px) skeleton collapsed the page on mount. Keep the CodeEditor default
    // and the bucket in agreement.
    const editorSrc = readFileSync(
      join(__dirname, "..", "..", "src", "components", "code-editor.tsx"),
      "utf8",
    );
    expect(editorSrc).toMatch(/height = 260/);
    const { container } = render(<WidgetFence language="runnable" source="print(1)" />);
    const skeleton = container.querySelector('[data-widget-gate="runnable"]')!
      .firstElementChild!;
    expect(skeleton.className).toContain("min-h-[360px]");
  });
});
