/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, act } from "@testing-library/react";
import { Sidebar } from "@/components/sidebar";

jest.mock("next/link", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: ({ href, children, onClick, ...props }: { href: string; children: React.ReactNode; onClick?: () => void }) =>
      React.createElement("a", { href, onClick, ...props }, children),
  };
});

let mockPathname = "/learn/00-foundations";
jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

describe("Sidebar", () => {
  beforeEach(() => {
    mockPathname = "/learn/00-foundations";
  });

  it("should render the 'Learning Path' heading", () => {
    render(<Sidebar />);
    expect(screen.getByText("Learning Path")).toBeInTheDocument();
  });

  it("should render all 7 section links", () => {
    render(<Sidebar />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(7);
  });

  it("should render each section title", () => {
    render(<Sidebar />);
    expect(screen.getByText("Quantum Computing Foundations")).toBeInTheDocument();
    expect(screen.getByText("Quantum Hardware on Amazon Braket")).toBeInTheDocument();
    expect(screen.getByText("Quantum Algorithms")).toBeInTheDocument();
    expect(screen.getByText("Quantum Machine Learning")).toBeInTheDocument();
    expect(screen.getByText("Quantum Chemistry & Biochemistry")).toBeInTheDocument();
    expect(screen.getByText("Production Hybrid Quantum-Classical Jobs")).toBeInTheDocument();
  });

  it("should link each section to /learn/{slug}", () => {
    render(<Sidebar />);
    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveAttribute("href", "/learn/00-prereqs");
    expect(links[1]).toHaveAttribute("href", "/learn/00-foundations");
    expect(links[6]).toHaveAttribute("href", "/learn/05-hybrid-jobs");
  });

  it("should render the mobile toggle button", () => {
    render(<Sidebar />);
    expect(screen.getByRole("button", { name: "Toggle navigation" })).toBeInTheDocument();
  });

  it("should show the sidebar with translated class when mobile toggle is clicked", async () => {
    const { container } = render(<Sidebar />);
    const toggleButton = screen.getByRole("button", { name: "Toggle navigation" });
    const aside = container.querySelector("aside");

    // Initially sidebar is off-screen on mobile
    expect(aside!.className).toContain("-translate-x-full");

    await act(async () => {
      toggleButton.click();
    });

    // After toggle, sidebar slides in
    expect(aside!.className).toContain("translate-x-0");
    expect(aside!.className).not.toContain("-translate-x-full");
  });

  it("should show the overlay when sidebar is open", async () => {
    const { container } = render(<Sidebar />);
    const toggleButton = screen.getByRole("button", { name: "Toggle navigation" });

    // No overlay initially
    expect(container.querySelector(".bg-black\\/50")).not.toBeInTheDocument();

    await act(async () => {
      toggleButton.click();
    });

    // Overlay appears
    expect(container.querySelector("[class*='bg-black']")).toBeInTheDocument();
  });

  it("should close the sidebar when the overlay is clicked", async () => {
    const { container } = render(<Sidebar />);
    const toggleButton = screen.getByRole("button", { name: "Toggle navigation" });

    await act(async () => {
      toggleButton.click();
    });

    const overlay = container.querySelector("[class*='bg-black']");
    expect(overlay).toBeInTheDocument();

    await act(async () => {
      overlay!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const aside = container.querySelector("aside");
    expect(aside!.className).toContain("-translate-x-full");
  });

  it("should display the zero-padded index for each section", () => {
    render(<Sidebar />);
    expect(screen.getByText("00")).toBeInTheDocument();
    expect(screen.getByText("01")).toBeInTheDocument();
    expect(screen.getByText("05")).toBeInTheDocument();
  });

  it("should highlight the active section based on the current pathname", () => {
    mockPathname = "/learn/02-algorithms";
    render(<Sidebar />);
    const activeLink = screen.getByText("Quantum Algorithms").closest("a");
    expect(activeLink!.className).toContain("text-accent");
    expect(activeLink!.className).toContain("bg-accent/10");
  });

  it("should not highlight non-active sections", () => {
    mockPathname = "/learn/02-algorithms";
    render(<Sidebar />);
    const inactiveLink = screen.getByText("Quantum Computing Foundations").closest("a");
    expect(inactiveLink!.className).not.toContain("bg-accent/10");
  });
});
