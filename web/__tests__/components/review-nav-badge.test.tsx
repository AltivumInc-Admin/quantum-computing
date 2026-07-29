/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, act } from "@testing-library/react";

const dueCount = jest.fn();
jest.mock("@/lib/review-store", () => ({
  dueCount: () => dueCount(),
  subscribe: () => () => {},
}));

import { ReviewNavBadge } from "@/components/review-nav-badge";
import { setSyncHealth } from "@/lib/sync-health";

describe("ReviewNavBadge", () => {
  beforeEach(() => {
    dueCount.mockReset();
    act(() => setSyncHealth("ok"));
  });
  afterEach(() => act(() => setSyncHealth("ok")));

  it("shows the due count for this account's own progress", () => {
    dueCount.mockReturnValue(2);
    render(<ReviewNavBadge />);
    expect(screen.getByRole("link")).toHaveAccessibleName(/2/);
  });

  // THE 2026-07-28 REPORT, pinned. qc:card:* is device-global with no account
  // dimension, so a brand-new account signing in on a browser that already held
  // someone else's cards was greeted by their due count in the nav. Verified live
  // at the time: DynamoDB held no row at all for the new sub, so none of it was
  // ever this account's data — it was the browser's leftovers.
  it("shows no count when the device's progress belongs to another account", () => {
    dueCount.mockReturnValue(2);
    act(() => setSyncHealth("mismatch"));
    render(<ReviewNavBadge />);
    expect(screen.getByRole("link")).not.toHaveAccessibleName(/2/);
    expect(screen.queryByText("2")).toBeNull();
  });

  it("restores the count once the ownership question is resolved", () => {
    dueCount.mockReturnValue(2);
    act(() => setSyncHealth("mismatch"));
    render(<ReviewNavBadge />);
    expect(screen.queryByText("2")).toBeNull();
    act(() => setSyncHealth("ok"));
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});
