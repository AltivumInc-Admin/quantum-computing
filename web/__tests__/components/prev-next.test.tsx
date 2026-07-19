/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { PrevNext } from "@/components/prev-next";

// PrevNext navigates exclusively via TransitionLink (View Transitions). Mock it
// to a plain anchor so the test doesn't need a mounted app router. (No
// next/link mock: PrevNext renders no raw Link — if one ever creeps back in,
// the resulting failure IS the signal.)
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
    render(<PrevNext currentSlug="03-algorithms" />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
  });

  it("should render the previous section title as a link", () => {
    render(<PrevNext currentSlug="03-algorithms" />);
    expect(screen.getByText("Quantum Hardware on Amazon Braket")).toBeInTheDocument();
  });

  it("should render the next section title as a link", () => {
    render(<PrevNext currentSlug="03-algorithms" />);
    expect(screen.getByText("Quantum Machine Learning")).toBeInTheDocument();
  });

  it("should link the previous section to the correct path", () => {
    render(<PrevNext currentSlug="03-algorithms" />);
    const prevLink = screen.getByText("Quantum Hardware on Amazon Braket").closest("a");
    expect(prevLink).toHaveAttribute("href", "/learn/02-hardware");
  });

  it("should link the next section to the correct path", () => {
    render(<PrevNext currentSlug="03-algorithms" />);
    const nextLink = screen.getByText("Quantum Machine Learning").closest("a");
    expect(nextLink).toHaveAttribute("href", "/learn/04-quantum-ml");
  });

  it("should not render a previous link for the first section", () => {
    render(<PrevNext currentSlug="00-prereqs" />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(screen.getByText("Quantum Computing Foundations")).toBeInTheDocument();
  });

  it("should not render a next link for the last section", () => {
    render(<PrevNext currentSlug="06-hybrid-jobs" />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(screen.getByText("Quantum Chemistry & Biochemistry")).toBeInTheDocument();
  });

  it("should render nothing for an unrecognized slug", () => {
    // findIndex's -1 must not fabricate a "Next: Prerequisites" card — the
    // reader is not before section 00, they are nowhere in the path.
    const { container } = render(<PrevNext currentSlug="non-existent" />);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(container).toBeEmptyDOMElement();
  });

  it("should render the correct prev/next for the second section", () => {
    render(<PrevNext currentSlug="02-hardware" />);
    expect(screen.getByText("Quantum Computing Foundations")).toBeInTheDocument();
    expect(screen.getByText("Quantum Algorithms")).toBeInTheDocument();
  });
});
