/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { WidgetFence } from "@/components/quantum/widget-fence";

/**
 * Every widget is mounted through next/dynamic, so a rejected chunk import —
 * realistically a stale content-hashed chunk fetched after an Amplify deploy,
 * on a page the reader has held open — rethrows during render. Render-time
 * throws from the kernel (chart-utils' `extent()` on an empty array, math.ts'
 * unknown-gate guard) arrive the same way. Without a boundary at the registry
 * call site, any of those unmounts the whole lesson route and the reader loses
 * the prose too.
 */

jest.mock("@/components/quantum/metrics-explorer", () => ({
  MetricsExplorer: () => {
    throw new Error("boom: stale chunk");
  },
}));

describe("WidgetFence error boundary", () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    // React logs the caught error; silence it so the suite output stays clean.
    consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    // No IntersectionObserver => the fence mounts immediately (jsdom path).
    delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it("degrades a throwing widget to the shared failure card", async () => {
    render(<WidgetFence language="qmetrics" source="{}" />);
    expect(
      await screen.findByText("qmetrics error: boom: stale chunk"),
    ).toBeInTheDocument();
  });

  it("keeps the surrounding lesson content rendered", async () => {
    render(
      <div>
        <p>prose before the widget</p>
        <WidgetFence language="qmetrics" source="{}" />
        <p>prose after the widget</p>
      </div>,
    );
    await screen.findByText("qmetrics error: boom: stale chunk");
    expect(screen.getByText("prose before the widget")).toBeInTheDocument();
    expect(screen.getByText("prose after the widget")).toBeInTheDocument();
  });

  it("contains the failure to the one widget — a sibling fence still mounts", async () => {
    render(
      <div>
        <WidgetFence language="qmetrics" source="{}" />
        <WidgetFence language="qcost" source="{}" />
      </div>,
    );
    await screen.findByText("qmetrics error: boom: stale chunk");
    // The cost calculator renders its own eyebrow; it is unaffected.
    expect(await screen.findByText(/cost/i)).toBeInTheDocument();
  });
});
