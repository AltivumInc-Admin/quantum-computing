/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { NotebookLink } from "@/components/notebook-link";

describe("NotebookLink", () => {
  const defaultProps = {
    filename: "01-first-circuit.ipynb",
    sectionDir: "01-foundations",
  };

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_GITHUB_REPO;
  });

  it("should render a link element", () => {
    render(<NotebookLink {...defaultProps} />);
    expect(screen.getByRole("link")).toBeInTheDocument();
  });

  it("should construct the GitHub URL using the canonical repo when env is not set", () => {
    render(<NotebookLink {...defaultProps} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/AltivumInc-Admin/quantum-computing/blob/main/01-foundations/notebooks/01-first-circuit.ipynb"
    );
  });

  it("should construct the GitHub URL using the NEXT_PUBLIC_GITHUB_REPO env var when set", () => {
    process.env.NEXT_PUBLIC_GITHUB_REPO = "https://github.com/custom-org/custom-repo";
    render(<NotebookLink {...defaultProps} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/custom-org/custom-repo/blob/main/01-foundations/notebooks/01-first-circuit.ipynb"
    );
  });

  it("should open links in a new tab", () => {
    render(<NotebookLink {...defaultProps} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("should have noopener noreferrer for security", () => {
    render(<NotebookLink {...defaultProps} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("should display a human-readable label from the filename", () => {
    render(<NotebookLink {...defaultProps} />);
    // "01-first-circuit.ipynb" -> strips .ipynb, strips leading digits and dash, replaces dashes with spaces
    expect(screen.getByText("first circuit")).toBeInTheDocument();
  });

  it("should display the raw filename below the label", () => {
    render(<NotebookLink {...defaultProps} />);
    expect(screen.getByText("01-first-circuit.ipynb")).toBeInTheDocument();
  });

  it("should handle filenames with multiple dashes in the name", () => {
    render(<NotebookLink filename="03-multi-qubit-gates.ipynb" sectionDir="01-foundations" />);
    expect(screen.getByText("multi qubit gates")).toBeInTheDocument();
  });

  it("should construct the path using the sectionDir prop", () => {
    render(<NotebookLink filename="01-data-encoding.ipynb" sectionDir="04-quantum-ml" />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/AltivumInc-Admin/quantum-computing/blob/main/04-quantum-ml/notebooks/01-data-encoding.ipynb"
    );
  });
});
