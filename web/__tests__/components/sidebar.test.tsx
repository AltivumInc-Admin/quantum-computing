/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { Sidebar } from "@/components/sidebar";
import {
  DRAWER_INERT_REGION_IDS,
  SITE_HEADER_ID,
  LESSON_CONTENT_ID,
  SITE_FOOTER_ID,
  TUTOR_TRIGGER_ID,
} from "@/lib/layout-regions";

// SidebarItem navigates via TransitionLink (View Transitions). Mock it to a
// plain anchor so the test doesn't need a mounted app router — but keep the
// REAL isModifiedClick, so the drawer's "should this click close me?" guard is
// actually exercised. (No next/link mock: Sidebar renders no raw Link — if one
// ever creeps back in, the resulting failure IS the signal.)
jest.mock("@/components/transition-link", () => {
  const React = require("react");
  const actual = jest.requireActual("@/components/transition-link");
  return {
    __esModule: true,
    isModifiedClick: actual.isModifiedClick,
    TransitionLink: ({
      href,
      children,
      onClick,
      ...props
    }: {
      href: string;
      children: React.ReactNode;
      onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
    }) =>
      React.createElement(
        "a",
        {
          href,
          onClick: (e: React.MouseEvent<HTMLAnchorElement>) => {
            onClick?.(e);
            // jsdom cannot navigate; swallow the default after the consumer's
            // handler ran (its defaultPrevented check must see the raw click).
            e.preventDefault();
          },
          ...props,
        },
        children
      ),
  };
});

let mockPathname = "/learn/01-foundations";
jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

/** The drawer alongside stand-ins for every layout region it must inert. */
function renderWithChrome() {
  return render(
    <>
      <header id={SITE_HEADER_ID}>
        <a href="#brand">brand</a>
      </header>
      <div id={LESSON_CONTENT_ID}>
        <a href="#lesson">lesson link</a>
      </div>
      <footer id={SITE_FOOTER_ID}>
        <a href="#footer-link">footer link</a>
      </footer>
      <button id={TUTOR_TRIGGER_ID}>Ask</button>
      <Sidebar />
    </>
  );
}

function getToggle() {
  return screen.getByRole("button", { name: "Toggle navigation" });
}

async function openDrawer() {
  await act(async () => {
    getToggle().click();
  });
}

async function pressEscape() {
  await act(async () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  });
}

describe("Sidebar", () => {
  beforeEach(() => {
    mockPathname = "/learn/01-foundations";
    localStorage.clear();
    document.body.style.overflow = "";
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
    expect(links[1]).toHaveAttribute("href", "/learn/01-foundations");
    expect(links[6]).toHaveAttribute("href", "/learn/06-hybrid-jobs");
  });

  it("should render the mobile toggle button", () => {
    render(<Sidebar />);
    expect(getToggle()).toBeInTheDocument();
  });

  it("should expose the drawer open state via aria-expanded on the toggle", async () => {
    render(<Sidebar />);
    const toggle = getToggle();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await openDrawer();
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("should close the mobile drawer when Escape is pressed", async () => {
    const { container } = render(<Sidebar />);
    await openDrawer();
    const aside = container.querySelector("aside");
    expect(aside!.className).toContain("translate-x-0");
    await pressEscape();
    expect(aside!.className).toContain("-translate-x-full");
  });

  it("should show the sidebar with translated class when mobile toggle is clicked", async () => {
    const { container } = render(<Sidebar />);
    const aside = container.querySelector("aside");

    // Initially sidebar is off-screen on mobile
    expect(aside!.className).toContain("-translate-x-full");

    await openDrawer();

    // After toggle, sidebar slides in
    expect(aside!.className).toContain("translate-x-0");
    expect(aside!.className).not.toContain("-translate-x-full");
  });

  it("should remove the closed drawer from the tab order and a11y tree below lg", async () => {
    // A transform alone leaves the 7 off-screen links tabbable; the closed
    // state must also carry visibility:hidden (max-lg scoped, so the
    // always-visible desktop sidebar is untouched).
    const { container } = render(<Sidebar />);
    const aside = container.querySelector("aside");
    expect(aside!.className).toContain("max-lg:invisible");

    await openDrawer();
    expect(aside!.className).toContain("max-lg:visible");
    expect(aside!.className).not.toContain("max-lg:invisible");

    await pressEscape();
    expect(aside!.className).toContain("max-lg:invisible");
  });

  it("should show the overlay when sidebar is open", async () => {
    const { container } = render(<Sidebar />);

    // No overlay initially
    expect(container.querySelector("[class*='bg-black']")).not.toBeInTheDocument();

    await openDrawer();

    // Overlay appears
    expect(container.querySelector("[class*='bg-black']")).toBeInTheDocument();
  });

  it("should close the sidebar when the overlay is clicked", async () => {
    const { container } = render(<Sidebar />);
    await openDrawer();

    const overlay = container.querySelector("[class*='bg-black']");
    expect(overlay).toBeInTheDocument();

    await act(async () => {
      overlay!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const aside = container.querySelector("aside");
    expect(aside!.className).toContain("-translate-x-full");
  });

  it("should keep the drawer open when a link is opened in a new tab via a modified click", async () => {
    const { container } = render(<Sidebar />);
    await openDrawer();
    const aside = container.querySelector("aside")!;
    const link = aside.querySelector("a")!;

    // Cmd-click = background-tab navigation; nothing navigated HERE, so the
    // drawer must not slide shut under the reader.
    await act(async () => {
      fireEvent.click(link, { metaKey: true });
    });
    expect(aside.className).toContain("translate-x-0");

    // A plain click does navigate — the drawer closes.
    await act(async () => {
      fireEvent.click(link);
    });
    expect(aside.className).toContain("-translate-x-full");
  });

  it("should display the zero-padded index for each section", () => {
    render(<Sidebar />);
    expect(screen.getByText("00")).toBeInTheDocument();
    expect(screen.getByText("01")).toBeInTheDocument();
    expect(screen.getByText("05")).toBeInTheDocument();
  });

  it("should highlight the active section based on the current pathname", () => {
    mockPathname = "/learn/03-algorithms";
    render(<Sidebar />);
    const activeLink = screen.getByText("Quantum Algorithms").closest("a");
    // The active item takes the section's identity hue (see .hue-* in globals.css).
    expect(activeLink!.className).toContain("hue-text");
    expect(activeLink!.className).toContain("hue-soft-bg");
  });

  it("should not highlight non-active sections", () => {
    mockPathname = "/learn/03-algorithms";
    render(<Sidebar />);
    const inactiveLink = screen.getByText("Quantum Computing Foundations").closest("a");
    expect(inactiveLink!.className).not.toContain("hue-soft-bg");
  });

  it("should expose an overall progress bar reflecting completed sections", () => {
    localStorage.setItem("qc:section:01-foundations", "1");
    localStorage.setItem("qc:section:02-hardware", "1");
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
    localStorage.setItem("qc:section:03-algorithms", "1");
    render(<Sidebar />);
    const completedLink = screen.getByText("Quantum Algorithms").closest("a");
    expect(completedLink).toHaveTextContent(/completed/i);
  });

  it("should not mark an unfinished section as completed", () => {
    localStorage.setItem("qc:section:03-algorithms", "1");
    render(<Sidebar />);
    const otherLink = screen.getByText("Quantum Machine Learning").closest("a");
    expect(otherLink).not.toHaveTextContent(/completed/i);
  });

  // The open drawer claims role="dialog" + aria-modal. These tests pin the
  // behaviors that make that claim truthful — inert background (via the
  // shared layout-region id contract), body scroll lock, focus management,
  // and the Tab cycle — so a landmark rename or layout addition fails a test
  // instead of silently shipping a hollow modal.
  describe("modal contract while the drawer is open", () => {
    it("marks every background region inert on open and releases all of them on close", async () => {
      renderWithChrome();
      for (const id of DRAWER_INERT_REGION_IDS) {
        expect(document.getElementById(id)).not.toHaveAttribute("inert");
      }

      await openDrawer();
      for (const id of DRAWER_INERT_REGION_IDS) {
        expect(document.getElementById(id)).toHaveAttribute("inert");
      }

      await pressEscape();
      for (const id of DRAWER_INERT_REGION_IDS) {
        expect(document.getElementById(id)).not.toHaveAttribute("inert");
      }
    });

    it("covers the footer and the tutor pill, not just header and lesson body", () => {
      // Guard against the contract re-drifting to a subset: the region list
      // itself must include all four layout chrome pieces.
      expect(DRAWER_INERT_REGION_IDS).toEqual(
        expect.arrayContaining([
          SITE_HEADER_ID,
          LESSON_CONTENT_ID,
          SITE_FOOTER_ID,
          TUTOR_TRIGGER_ID,
        ])
      );
    });

    it("locks body scroll while open and restores it on close", async () => {
      renderWithChrome();
      expect(document.body.style.overflow).toBe("");

      await openDrawer();
      expect(document.body.style.overflow).toBe("hidden");

      await pressEscape();
      expect(document.body.style.overflow).toBe("");
    });

    it("moves focus into the drawer on open and returns it to the toggle on close", async () => {
      const { container } = renderWithChrome();
      await openDrawer();
      expect(document.activeElement).toBe(container.querySelector("aside"));

      await pressEscape();
      expect(document.activeElement).toBe(getToggle());
    });

    it("wraps Tab from the last drawer link back to the X close button", async () => {
      const { container } = renderWithChrome();
      await openDrawer();
      const links = container.querySelectorAll<HTMLElement>("aside a");
      const lastLink = links[links.length - 1];

      await act(async () => {
        lastLink.focus();
      });
      await act(async () => {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
      });

      // The visible X close affordance is INSIDE the Tab cycle.
      expect(document.activeElement).toBe(getToggle());
    });

    it("wraps Shift+Tab from the X close button to the last drawer link", async () => {
      const { container } = renderWithChrome();
      await openDrawer();
      const links = container.querySelectorAll<HTMLElement>("aside a");
      const lastLink = links[links.length - 1];

      await act(async () => {
        getToggle().focus();
      });
      await act(async () => {
        document.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Tab", shiftKey: true })
        );
      });

      expect(document.activeElement).toBe(lastLink);
    });
  });
});
