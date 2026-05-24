/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render } from "@testing-library/react";
import { OrbitalDecoration } from "@/components/orbital-decoration";

describe("OrbitalDecoration", () => {
  it("should render with aria-hidden for accessibility", () => {
    const { container } = render(<OrbitalDecoration />);
    const wrapper = container.firstElementChild;
    expect(wrapper).toHaveAttribute("aria-hidden", "true");
  });

  it("should render an SVG element with orbital circles", () => {
    const { container } = render(<OrbitalDecoration />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    const circles = container.querySelectorAll("circle");
    expect(circles.length).toBe(6);
  });

  it("should be pointer-events-none to avoid blocking interactions", () => {
    const { container } = render(<OrbitalDecoration />);
    const wrapper = container.firstElementChild;
    expect(wrapper).toHaveClass("pointer-events-none");
  });
});
