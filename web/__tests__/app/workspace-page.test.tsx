/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { getSections } from "@/lib/sections";

const signOut = jest.fn();
let mockAuth = {
  status: "authenticated" as string,
  email: "a@b.com" as string | null,
  signOut,
};
jest.mock("@/components/auth/auth-provider", () => ({ useAuth: () => mockAuth }));

const replace = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: jest.fn() }) }));

import WorkspacePage from "@/app/workspace/page";

describe("WorkspacePage", () => {
  beforeEach(() => {
    signOut.mockReset();
    replace.mockReset();
    mockAuth = { status: "authenticated", email: "a@b.com", signOut };
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
  });

  it("shows the signed-in identity and the local-progress teaser", () => {
    render(<WorkspacePage />);
    expect(screen.getByText(/signed in as/i)).toHaveTextContent("a@b.com");
    const total = getSections().length;
    expect(screen.getByText(new RegExp(`of ${total} sections`, "i"))).toBeInTheDocument();
    expect(screen.getByText(/not yet synced/i)).toBeInTheDocument();
  });

  it("redirects to /login when unauthenticated", () => {
    mockAuth = { status: "unauthenticated", email: null, signOut };
    render(<WorkspacePage />);
    expect(replace).toHaveBeenCalledWith("/login");
  });

  it("shows a coming-soon panel when unconfigured", () => {
    mockAuth = { status: "unconfigured", email: null, signOut };
    render(<WorkspacePage />);
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
  });

  it("signs out and routes home", async () => {
    signOut.mockResolvedValue(undefined);
    render(<WorkspacePage />);
    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });
});
