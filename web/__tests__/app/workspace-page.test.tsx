/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { gradeCard, setCardContent } from "@/lib/review-store";

const signOut = jest.fn();
let mockAuth = {
  status: "authenticated" as string,
  email: "ai-dev@altivum.ai" as string | null,
  signOut,
};
jest.mock("@/components/auth/auth-provider", () => ({ useAuth: () => mockAuth }));

const replace = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: jest.fn() }) }));

import WorkspacePage from "@/app/workspace/page";

describe("WorkspacePage — THE BENCH", () => {
  beforeEach(() => {
    signOut.mockReset();
    replace.mockReset();
    mockAuth = { status: "authenticated", email: "ai-dev@altivum.ai", signOut };
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
  });

  it("renders the bench: an h1 Workspace, the email, and the cockpit zones", () => {
    render(<WorkspacePage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Workspace");
    // The email appears in the masthead AND the Console account row.
    expect(screen.getAllByText("ai-dev@altivum.ai").length).toBeGreaterThanOrEqual(1);
    // The zone regions are labelled by their own h2 eyebrows.
    expect(screen.getByRole("region", { name: /skills in proven retention/i })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /due now/i })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /the lab/i })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /curriculum/i })).toBeInTheDocument();
  });

  it("with no graded Reps, the Valve steers to Start Prerequisites", () => {
    render(<WorkspacePage />);
    const cta = screen.getByRole("link", { name: /start prerequisites/i });
    expect(cta).toHaveAttribute("href", "/learn/00-prereqs");
    expect(cta).toHaveClass("surface-accent");
  });

  it("with due cards, the Valve steers to Review — the count and breakdown are honest", () => {
    gradeCard("challenge:bell", "again", 0); // due since day 1
    setCardContent("challenge:bell", { prompt: "Build a Bell pair", answer: "", kind: "challenge" });
    render(<WorkspacePage />);
    expect(screen.getByRole("link", { name: /review 1 card/i })).toHaveAttribute("href", "/review");
    const valve = screen.getByRole("region", { name: /due now/i });
    expect(valve).toHaveTextContent(/Circuit challenge/);
  });

  it("has EXACTLY ONE filled CTA (.surface-accent) on the page", () => {
    const { container } = render(<WorkspacePage />);
    expect(container.querySelectorAll(".surface-accent")).toHaveLength(1);
  });

  it("redirects to /login when unauthenticated — but still renders an h1", () => {
    mockAuth = { status: "unauthenticated", email: null, signOut };
    render(<WorkspacePage />);
    expect(replace).toHaveBeenCalledWith("/login");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Workspace");
  });

  it("renders THE BENCH (not a coming-soon page) when unconfigured, with the device-local note", () => {
    mockAuth = { status: "unconfigured", email: null, signOut };
    render(<WorkspacePage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Workspace");
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
    // The cockpit is fully truthful without an account.
    expect(screen.getByRole("region", { name: /skills in proven retention/i })).toBeInTheDocument();
    expect(screen.getByText(/accounts are not enabled on this build/i)).toBeInTheDocument();
    // Still exactly one filled CTA even signed out.
    expect(document.querySelectorAll(".surface-accent")).toHaveLength(1);
  });

  it("every load state carries an h1 (the pre-existing zero-headings bug)", () => {
    for (const status of ["authenticated", "unconfigured", "configuring", "unauthenticated"]) {
      mockAuth = { status, email: status === "authenticated" ? "a@b.com" : null, signOut };
      const { unmount } = render(<WorkspacePage />);
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Workspace");
      unmount();
    }
  });

  it("signs out and routes home from the Console", async () => {
    signOut.mockResolvedValue(undefined);
    render(<WorkspacePage />);
    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });
});
