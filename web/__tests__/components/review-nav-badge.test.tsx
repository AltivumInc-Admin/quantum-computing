/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { ReviewNavBadge } from "@/components/review-nav-badge";
import { setCurrentOwner } from "@/lib/progress-owner";
import { gradeCard } from "@/lib/review-store";

const SUB = "310b5550-a0f1-70b3-8b4d-9e2a21e1b855";
const OTHER = "a14b65c0-90e1-70ee-a1cc-68d4d374ad95";

beforeEach(() => {
  localStorage.clear();
  setCurrentOwner(null);
});

describe("ReviewNavBadge", () => {
  it("shows nothing when this account has no due cards", () => {
    setCurrentOwner(SUB);
    render(<ReviewNavBadge />);
    expect(screen.getByRole("link")).toHaveAccessibleName(/^review$/i);
  });

  // THE 2026-07-28 REPORT, pinned — now at the storage layer rather than behind
  // a display gate. A card graded by one account must be invisible to the next
  // account on the same browser, because it is in a different bucket entirely.
  it("never counts another account's cards", () => {
    setCurrentOwner(OTHER);
    gradeCard("challenge:bell-pair", "again", Date.UTC(2026, 0, 1));

    setCurrentOwner(SUB);
    render(<ReviewNavBadge />);
    expect(screen.getByRole("link")).toHaveAccessibleName(/^review$/i);
    expect(screen.queryByText("1")).toBeNull();
  });

  it("counts this account's own due cards", () => {
    setCurrentOwner(SUB);
    gradeCard("challenge:bell-pair", "again", Date.UTC(2026, 0, 1));
    render(<ReviewNavBadge />);
    expect(screen.getByText("1")).toBeInTheDocument();
  });
});
