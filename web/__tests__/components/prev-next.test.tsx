/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { PrevNext } from "@/components/prev-next";

jest.mock("next/link", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
      React.createElement("a", { href, ...props }, children),
  };
});

// PrevNext now navigates via TransitionLink (View Transitions). Mock it to a
// plain anchor so the test doesn't need a mounted app router.
jest.mock("@/components/transition-link", () => {
  const React = require("react");
  return {
    __esModule: true,
    TransitionLink: ({ href, children, onClick, ...props }: { href: string; children: React.ReactNode; onClick?: () => void }) =>
      React.createElement("a", { href, onClick, ...props }, children),
  };
});

describe("PrevNext", () => {
  it("should render both previous and next links for a middle section", () => {
    render(<PrevNext currentSlug="02-algorithms" />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
  });

  it("should render the previous section title as a link", () => {
    render(<PrevNext currentSlug="02-algorithms" />);
    expect(screen.getByText("Quantum Hardware on Amazon Braket")).toBeInTheDocument();
  });

  it("should render the next section title as a link", () => {
    render(<PrevNext currentSlug="02-algorithms" />);
    expect(screen.getByText("Quantum Machine Learning")).toBeInTheDocument();
  });

  it("should link the previous section to the correct path", () => {
    render(<PrevNext currentSlug="02-algorithms" />);
    const prevLink = screen.getByText("Quantum Hardware on Amazon Braket").closest("a");
    expect(prevLink).toHaveAttribute("href", "/learn/01-hardware");
  });

  it("should link the next section to the correct path", () => {
    render(<PrevNext currentSlug="02-algorithms" />);
    const nextLink = screen.getByText("Quantum Machine Learning").closest("a");
    expect(nextLink).toHaveAttribute("href", "/learn/03-quantum-ml");
  });

  it("should not render a previous link for the first section", () => {
    render(<PrevNext currentSlug="00-prereqs" />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(screen.getByText("Quantum Computing Foundations")).toBeInTheDocument();
  });

  it("should not render a next link for the last section", () => {
    render(<PrevNext currentSlug="05-hybrid-jobs" />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(screen.getByText("Quantum Chemistry & Biochemistry")).toBeInTheDocument();
  });

  it("should render a next link to the first section when the slug does not match any section", () => {
    // When findIndex returns -1, currentIndex is -1.
    // prev = sections[-2] = undefined, next = sections[0] = first section
    render(<PrevNext currentSlug="non-existent" />);
    const links = screen.queryAllByRole("link");
    expect(links).toHaveLength(1);
    expect(screen.getByText("Prerequisites: From Zero to Ready-for-Quantum")).toBeInTheDocument();
  });

  it("should render the correct prev/next for the second section", () => {
    render(<PrevNext currentSlug="01-hardware" />);
    expect(screen.getByText("Quantum Computing Foundations")).toBeInTheDocument();
    expect(screen.getByText("Quantum Algorithms")).toBeInTheDocument();
  });
});
