/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { SectionProgress } from "@/components/section-progress";

// The house toggle idiom (code-block's wrap button): ONE state channel — the
// accessible name stays "Mark as complete" in both states, and aria-pressed
// alone carries completion. A flipping name + aria-pressed together would
// double-encode state against the APG button pattern.
describe("SectionProgress", () => {
  beforeEach(() => localStorage.clear());

  it("offers a 'Mark as complete' toggle, unpressed while the section is unfinished", () => {
    render(<SectionProgress slug="01-foundations" />);
    expect(screen.getByRole("button", { name: /mark as complete/i })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("marks the section complete and persists it on click, keeping the name stable", () => {
    render(<SectionProgress slug="01-foundations" />);
    const button = screen.getByRole("button", { name: /mark as complete/i });
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button).toHaveAccessibleName(/mark as complete/i); // state never leaks into the name
    expect(localStorage.getItem("qc:section:01-foundations")).toBe("1");
  });

  it("reflects a section already completed in a previous visit", () => {
    localStorage.setItem("qc:section:02-hardware", "1");
    render(<SectionProgress slug="02-hardware" />);
    expect(screen.getByRole("button", { name: /mark as complete/i })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("lets the learner undo completion", () => {
    localStorage.setItem("qc:section:03-algorithms", "1");
    render(<SectionProgress slug="03-algorithms" />);
    const button = screen.getByRole("button", { name: /mark as complete/i });
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(localStorage.getItem("qc:section:03-algorithms")).toBeNull();
  });
});
