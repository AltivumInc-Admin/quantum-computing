/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { MyFoundingBadges } from "@/components/founding-ten/my-badges";

const HASH = "b".repeat(64);
// A fixture address, never a real one: the repo is public, and pairing a real
// email with the real holder name it hashes to is exactly the binding
// lib/founding-ten's header comment exists to keep out of this file.
let mockAuth: { status: string; email: string | null; emailHash: string | null } = {
  status: "authenticated", email: "charter-01@example.invalid", emailHash: HASH,
};
jest.mock("@/components/auth/auth-provider", () => ({ useAuth: () => mockAuth }));

jest.mock("@/lib/founding-ten", () => {
  const actual = jest.requireActual("@/lib/founding-ten");
  return {
    ...actual,
    badgeForEmailHash: (h: string) =>
      h === "b".repeat(64)
        ? [{ cohort: "charter", serial: 1, holder: "Irving Salinas", issuedAt: "2026-07-29", emailHash: h }]
        : [],
  };
});

describe("MyFoundingBadges", () => {
  it("shows the holder's badge with a link to its public record", () => {
    render(<MyFoundingBadges />);
    expect(screen.getByText(/Charter Member/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /public record/i })).toHaveAttribute(
      "href",
      "/founding-ten/charter-01",
    );
  });

  it("renders nothing for someone who holds no badge", () => {
    mockAuth = { status: "authenticated", email: "nobody@example.com", emailHash: "c".repeat(64) };
    const { container } = render(<MyFoundingBadges />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing before the hash resolves", () => {
    mockAuth = { status: "authenticated", email: "x@y.com", emailHash: null };
    const { container } = render(<MyFoundingBadges />);
    expect(container).toBeEmptyDOMElement();
  });
});
