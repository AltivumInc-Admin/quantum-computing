/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { SectionProgress } from "@/components/section-progress";

describe("SectionProgress", () => {
  beforeEach(() => localStorage.clear());

  it("offers a 'Mark as complete' action when the section is unfinished", () => {
    render(<SectionProgress slug="01-foundations" />);
    expect(
      screen.getByRole("button", { name: /mark as complete/i })
    ).toBeInTheDocument();
  });

  it("marks the section complete and persists it on click", () => {
    render(<SectionProgress slug="01-foundations" />);
    fireEvent.click(screen.getByRole("button", { name: /mark as complete/i }));
    expect(screen.getByRole("button", { name: /completed/i })).toBeInTheDocument();
    expect(localStorage.getItem("qc:section:01-foundations")).toBe("1");
  });

  it("reflects a section already completed in a previous visit", () => {
    localStorage.setItem("qc:section:02-hardware", "1");
    render(<SectionProgress slug="02-hardware" />);
    expect(screen.getByRole("button", { name: /completed/i })).toBeInTheDocument();
  });

  it("lets the learner undo completion", () => {
    localStorage.setItem("qc:section:03-algorithms", "1");
    render(<SectionProgress slug="03-algorithms" />);
    fireEvent.click(screen.getByRole("button", { name: /completed/i }));
    expect(
      screen.getByRole("button", { name: /mark as complete/i })
    ).toBeInTheDocument();
    expect(localStorage.getItem("qc:section:03-algorithms")).toBeNull();
  });
});
