/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
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
