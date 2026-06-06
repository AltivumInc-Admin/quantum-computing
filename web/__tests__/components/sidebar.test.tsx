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

// SidebarItem now navigates via TransitionLink (View Transitions). Mock it to a
// plain anchor so the test doesn't need a mounted app router.
jest.mock("@/components/transition-link", () => {
  const React = require("react");
  return {
    __esModule: true,
    TransitionLink: ({ href, children, onClick, ...props }: { href: string; children: React.ReactNode; onClick?: () => void }) =>
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
    localStorage.clear();
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

  it("should expose the drawer open state via aria-expanded on the toggle", async () => {
    render(<Sidebar />);
    const toggle = screen.getByRole("button", { name: "Toggle navigation" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await act(async () => {
      toggle.click();
    });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("should close the mobile drawer when Escape is pressed", async () => {
    const { container } = render(<Sidebar />);
    const toggle = screen.getByRole("button", { name: "Toggle navigation" });
    await act(async () => {
      toggle.click();
    });
    const aside = container.querySelector("aside");
    expect(aside!.className).toContain("translate-x-0");
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(aside!.className).toContain("-translate-x-full");
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
    // The active item takes the section's identity hue (see .hue-* in globals.css).
    expect(activeLink!.className).toContain("hue-text");
    expect(activeLink!.className).toContain("hue-soft-bg");
  });

  it("should not highlight non-active sections", () => {
    mockPathname = "/learn/02-algorithms";
    render(<Sidebar />);
    const inactiveLink = screen.getByText("Quantum Computing Foundations").closest("a");
    expect(inactiveLink!.className).not.toContain("hue-soft-bg");
  });

  it("should expose an overall progress bar reflecting completed sections", () => {
    localStorage.setItem("qc:section:00-foundations", "1");
    localStorage.setItem("qc:section:01-hardware", "1");
    render(<Sidebar />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "2");
    expect(bar).toHaveAttribute("aria-valuemax", "7");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
  });

  it("should report zero completed sections by default", () => {
    render(<Sidebar />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  });

  it("should mark a completed section in the nav for screen readers", () => {
    localStorage.setItem("qc:section:02-algorithms", "1");
    render(<Sidebar />);
    const completedLink = screen.getByText("Quantum Algorithms").closest("a");
    expect(completedLink).toHaveTextContent(/completed/i);
  });

  it("should not mark an unfinished section as completed", () => {
    localStorage.setItem("qc:section:02-algorithms", "1");
    render(<Sidebar />);
    const otherLink = screen.getByText("Quantum Machine Learning").closest("a");
    expect(otherLink).not.toHaveTextContent(/completed/i);
  });
});
