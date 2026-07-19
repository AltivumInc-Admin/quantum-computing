/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { AuthWall } from "@/components/auth/auth-wall";

let mockStatus: string;
let mockPathname: string;
const replace = jest.fn();

jest.mock("@/components/auth/auth-provider", () => ({
  __esModule: true,
  useAuth: () => ({ status: mockStatus, email: null, signOut: async () => {} }),
}));

jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ replace, push: jest.fn() }),
}));

const CHILD = "PROTECTED-CONTENT";
function renderWall() {
  return render(
    <AuthWall>
      <div>{CHILD}</div>
    </AuthWall>,
  );
}

describe("AuthWall", () => {
  beforeEach(() => {
    replace.mockReset();
    mockStatus = "unauthenticated";
    mockPathname = "/learn/01-foundations";
  });

  it("renders children on public routes even when signed out", () => {
    for (const p of ["/", "/pricing", "/login", "/auth/callback", "/privacy", "/e2e-fixtures/py-reps"]) {
      mockPathname = p;
      const { unmount } = renderWall();
      expect(screen.getByText(CHILD)).toBeInTheDocument();
      unmount();
    }
    expect(replace).not.toHaveBeenCalled();
  });

  it("renders children when auth is unconfigured (static export / tests / local dev)", () => {
    mockStatus = "unconfigured";
    renderWall();
    expect(screen.getByText(CHILD)).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("renders children on a protected route when the visitor is signed in", () => {
    mockStatus = "authenticated";
    renderWall();
    expect(screen.getByText(CHILD)).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("holds on the gate (no content, no redirect) while the session is still configuring", () => {
    mockStatus = "configuring";
    renderWall();
    expect(screen.queryByText(CHILD)).not.toBeInTheDocument();
    expect(screen.getByText(/checking your access/i)).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("redirects a signed-out visitor off a protected route, preserving the destination", () => {
    mockPathname = "/playground";
    renderWall();
    expect(screen.queryByText(CHILD)).not.toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith("/login?next=%2Fplayground");
  });
});
