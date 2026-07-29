/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { ClaimAnonProgress } from "@/components/workspace/claim-anon-progress";
import { setCurrentOwner } from "@/lib/progress-owner";

const SUB = "310b5550-a0f1-70b3-8b4d-9e2a21e1b855";

beforeEach(() => {
  localStorage.clear();
  setCurrentOwner(null);
});

describe("ClaimAnonProgress", () => {
  it("says nothing when the device has no unowned progress", () => {
    setCurrentOwner(SUB);
    render(<ClaimAnonProgress />);
    expect(screen.queryByRole("region", { name: /unclaimed progress/i })).toBeNull();
  });

  it("says nothing while signed out — the anon bucket is already what you see", () => {
    localStorage.setItem("qc:card:a", "1");
    render(<ClaimAnonProgress />);
    expect(screen.queryByRole("region", { name: /unclaimed progress/i })).toBeNull();
  });

  it("offers the choice when signed in with unowned progress present", () => {
    localStorage.setItem("qc:card:a", "1");
    localStorage.setItem("qc:card:b", "1");
    setCurrentOwner(SUB);
    render(<ClaimAnonProgress />);
    expect(screen.getByRole("region", { name: /unclaimed progress/i })).toHaveTextContent(/2\s*items unclaimed/i);
  });

  it("moves the work into the account only on an explicit click", () => {
    localStorage.setItem("qc:card:a", "1");
    setCurrentOwner(SUB);
    render(<ClaimAnonProgress />);
    // Nothing has moved just by rendering the prompt.
    expect(localStorage.getItem("qc:card:a")).toBe("1");
    fireEvent.click(screen.getByRole("button", { name: /add to my account/i }));
    expect(localStorage.getItem(`qc:o:${SUB}:card:a`)).toBe("1");
    expect(localStorage.getItem("qc:card:a")).toBeNull();
  });

  // The shared-browser case: the previous person's work must be refusable, and
  // refusing must not hand it to this account.
  it("discards without claiming when the user says it is not theirs", () => {
    localStorage.setItem("qc:card:a", "1");
    setCurrentOwner(SUB);
    render(<ClaimAnonProgress />);
    fireEvent.click(screen.getByRole("button", { name: /not mine/i }));
    expect(localStorage.getItem("qc:card:a")).toBeNull();
    expect(localStorage.getItem(`qc:o:${SUB}:card:a`)).toBeNull();
  });
});
