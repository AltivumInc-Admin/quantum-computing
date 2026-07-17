/**
 * @jest-environment jsdom
 */
// web/__tests__/components/curriculum-grid.test.tsx
//
// The welcome page's sign-up gate: browsing the curriculum grid is free for
// everyone, but opening a section while signed out swaps navigation for a
// per-section preview dialog with account CTAs. Signed-in learners (and the
// no-auth-configured static build) click straight through.
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { CurriculumGrid, type CurriculumSection } from "@/components/curriculum-grid";
import type { AuthStatus } from "@/components/auth/auth-provider";

let mockStatus: AuthStatus = "unconfigured";

jest.mock("@/components/auth/auth-provider", () => ({
  __esModule: true,
  useAuth: () => ({ status: mockStatus, email: null, signOut: async () => {} }),
}));

jest.mock("next/link", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
      React.createElement("a", { href, ...props }, children),
  };
});

jest.mock("@/components/transition-link", () => {
  const React = require("react");
  return {
    __esModule: true,
    TransitionLink: ({
      href,
      children,
      onClick,
      ...props
    }: {
      href: string;
      children: React.ReactNode;
      onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
    }) => React.createElement("a", { href, onClick, ...props }, children),
  };
});

const SECTIONS: CurriculumSection[] = [
  {
    slug: "00-prereqs",
    index: 0,
    title: "Prerequisites",
    notebookCount: 6,
    runnableCount: 6,
    summary: "Math and Python groundwork.",
    pitch: "Every piece of math the curriculum uses, built from zero.",
  },
  {
    slug: "01-foundations",
    index: 1,
    title: "Quantum Foundations",
    notebookCount: 5,
    runnableCount: 5,
    summary: "Qubits and entanglement.",
    pitch: "Qubits, superposition, and your first Bell state.",
  },
  // Partial and zero browser coverage — the dialog's notebook note must state
  // each section's own truth instead of a blanket "most run in your browser".
  {
    slug: "02-hardware",
    index: 2,
    title: "Quantum Hardware",
    notebookCount: 6,
    runnableCount: 4,
    summary: "Real devices and their trade-offs.",
    pitch: "Real hardware families, noise, and costs.",
  },
  {
    slug: "06-hybrid-jobs",
    index: 6,
    title: "Hybrid Jobs",
    notebookCount: 7,
    runnableCount: 0,
    summary: "Production quantum-classical workloads.",
    pitch: "From notebook to production.",
  },
];

function cardFor(title: string) {
  return screen.getByRole("link", { name: new RegExp(title, "i") });
}

describe("CurriculumGrid", () => {
  afterEach(() => {
    mockStatus = "unconfigured";
    document.body.style.overflow = "";
  });

  it("renders every section card plus the glossary card", () => {
    render(<CurriculumGrid sections={SECTIONS} />);
    expect(cardFor("Prerequisites")).toHaveAttribute("href", "/learn/00-prereqs");
    expect(cardFor("Quantum Foundations")).toHaveAttribute("href", "/learn/01-foundations");
    expect(
      screen.getByRole("link", { name: /glossary, an a to z reference/i })
    ).toHaveAttribute("href", "/glossary");
  });

  it("leaves cards as plain links when auth is not configured (static build)", () => {
    mockStatus = "unconfigured";
    render(<CurriculumGrid sections={SECTIONS} />);
    const card = cardFor("Prerequisites");
    expect(card).not.toHaveAttribute("aria-haspopup");
    fireEvent.click(card);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("lets signed-in learners click straight through", () => {
    mockStatus = "authenticated";
    render(<CurriculumGrid sections={SECTIONS} />);
    const card = cardFor("Prerequisites");
    expect(card).not.toHaveAttribute("aria-haspopup");
    fireEvent.click(card);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  describe("signed out", () => {
    beforeEach(() => {
      mockStatus = "unauthenticated";
    });

    it("marks gated cards as dialog openers and intercepts navigation", () => {
      render(<CurriculumGrid sections={SECTIONS} />);
      const card = cardFor("Prerequisites");
      expect(card).toHaveAttribute("aria-haspopup", "dialog");
      // fireEvent returns false when preventDefault was called — the click
      // must not fall through to navigation.
      expect(fireEvent.click(card)).toBe(false);
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("shows the clicked section's own pitch and account CTAs", () => {
      render(<CurriculumGrid sections={SECTIONS} />);
      fireEvent.click(cardFor("Quantum Foundations"));
      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveTextContent("Quantum Foundations");
      expect(dialog).toHaveTextContent(SECTIONS[1].pitch);
      expect(dialog).toHaveTextContent(/5 hands-on notebooks — all run right in your browser/i);
      expect(screen.getByRole("link", { name: /create a free account/i })).toHaveAttribute(
        "href",
        "/login?mode=signup"
      );
      expect(screen.getByRole("link", { name: /^sign in$/i })).toHaveAttribute(
        "href",
        "/login"
      );
      expect(screen.queryByRole("link", { name: /continue to section/i })).not.toBeInTheDocument();
    });

    it("tells each section's own truth about browser-runnable notebooks", () => {
      render(<CurriculumGrid sections={SECTIONS} />);

      // Partial coverage: the exact count, not "most".
      fireEvent.click(cardFor("Quantum Hardware"));
      expect(screen.getByRole("dialog")).toHaveTextContent(
        /6 hands-on notebooks — 4 run right in your browser/i
      );
      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

      // Zero coverage (06-hybrid-jobs): no browser promise at all.
      fireEvent.click(cardFor("Hybrid Jobs"));
      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveTextContent(
        /7 hands-on notebooks — built to run in your own Braket environment/i
      );
      expect(dialog).not.toHaveTextContent(/in your browser/i);
    });

    it.each(["metaKey", "ctrlKey", "shiftKey", "altKey"] as const)(
      "lets %s-modified clicks keep their native browser behavior instead of gating",
      (modifier) => {
        render(<CurriculumGrid sections={SECTIONS} />);
        const card = cardFor("Prerequisites");
        // fireEvent.click returns true when preventDefault was NOT called —
        // the click must fall through so the browser can open a new tab.
        expect(fireEvent.click(card, { [modifier]: true })).toBe(true);
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      }
    );

    it("closes via the close button", () => {
      render(<CurriculumGrid sections={SECTIONS} />);
      fireEvent.click(cardFor("Prerequisites"));
      fireEvent.click(screen.getByRole("button", { name: /close dialog/i }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("closes on Escape", () => {
      render(<CurriculumGrid sections={SECTIONS} />);
      fireEvent.click(cardFor("Prerequisites"));
      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("closes on backdrop click but not on clicks inside the dialog", () => {
      render(<CurriculumGrid sections={SECTIONS} />);
      fireEvent.click(cardFor("Prerequisites"));
      const dialog = screen.getByRole("dialog");
      fireEvent.mouseDown(dialog);
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      const backdrop = document.querySelector(".animate-backdrop-fade")!;
      fireEvent.mouseDown(backdrop);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("moves focus into the dialog on open, locks scroll, and restores both on close", () => {
      render(<CurriculumGrid sections={SECTIONS} />);
      const card = cardFor("Prerequisites");
      card.focus();
      fireEvent.click(card);
      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveFocus();
      expect(document.body.style.overflow).toBe("hidden");
      fireEvent.keyDown(dialog, { key: "Escape" });
      expect(card).toHaveFocus();
      expect(document.body.style.overflow).toBe("");
    });

    it("labels the dialog accessibly", () => {
      render(<CurriculumGrid sections={SECTIONS} />);
      fireEvent.click(cardFor("Prerequisites"));
      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveAttribute("aria-modal", "true");
      expect(dialog).toHaveAccessibleName(/prerequisites/i);
      expect(dialog).toHaveAccessibleDescription(SECTIONS[0].pitch);
    });
  });

  it("gates during the brief configuring window, then offers continue once signed in", () => {
    mockStatus = "configuring";
    const { rerender } = render(<CurriculumGrid sections={SECTIONS} />);
    fireEvent.click(cardFor("Prerequisites"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // The session resolves to signed-in while the dialog is open: the gate
    // steps aside and offers the section instead of a sign-up form.
    mockStatus = "authenticated";
    rerender(<CurriculumGrid sections={SECTIONS} />);
    const continueLink = screen.getByRole("link", { name: /continue to section/i });
    expect(continueLink).toHaveAttribute("href", "/learn/00-prereqs");
    expect(
      screen.queryByRole("link", { name: /create a free account/i })
    ).not.toBeInTheDocument();
    fireEvent.click(continueLink);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
