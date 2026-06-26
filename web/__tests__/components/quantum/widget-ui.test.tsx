/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { LiveStatus } from "@/components/quantum/widget-ui";

describe("LiveStatus", () => {
  it("renders a polite, visually-hidden status region carrying its children", () => {
    render(<LiveStatus>hello world</LiveStatus>);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("hello world");
    expect(status).toHaveClass("sr-only");
    expect(status).toHaveAttribute("aria-live", "polite");
  });

  it("renders an empty region (nothing to announce) without error", () => {
    render(<LiveStatus>{""}</LiveStatus>);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });
});
