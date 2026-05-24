/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { SectionCard } from "@/components/section-card";

jest.mock("next/link", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
      React.createElement("a", { href, ...props }, children),
  };
});

const defaultProps = {
  slug: "00-foundations",
  index: 0,
  title: "Quantum Computing Foundations",
  summary: "Learn the basics of quantum computing with Amazon Braket.",
  notebookCount: 5,
};

describe("SectionCard", () => {
  it("should render a link to the section page", () => {
    render(<SectionCard {...defaultProps} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/learn/00-foundations");
  });

  it("should display the section title", () => {
    render(<SectionCard {...defaultProps} />);
    expect(screen.getByText("Quantum Computing Foundations")).toBeInTheDocument();
  });

  it("should display the summary text", () => {
    render(<SectionCard {...defaultProps} />);
    expect(screen.getByText("Learn the basics of quantum computing with Amazon Braket.")).toBeInTheDocument();
  });

  it("should display the zero-padded index", () => {
    render(<SectionCard {...defaultProps} />);
    expect(screen.getByText("00")).toBeInTheDocument();
  });

  it("should pad single-digit indices with a leading zero", () => {
    render(<SectionCard {...defaultProps} index={3} />);
    expect(screen.getByText("03")).toBeInTheDocument();
  });

  it("should display plural 'notebooks' when notebookCount is greater than 1", () => {
    render(<SectionCard {...defaultProps} notebookCount={5} />);
    expect(screen.getByText("5 notebooks")).toBeInTheDocument();
  });

  it("should display singular 'notebook' when notebookCount is 1", () => {
    render(<SectionCard {...defaultProps} notebookCount={1} />);
    expect(screen.getByText("1 notebook")).toBeInTheDocument();
  });

  it("should construct the correct href from the slug prop", () => {
    render(<SectionCard {...defaultProps} slug="03-quantum-ml" />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/learn/03-quantum-ml");
  });
});
