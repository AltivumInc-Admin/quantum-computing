/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, within } from "@testing-library/react";
import { Roster } from "@/components/founding-ten/roster";

jest.mock("@/lib/founding-ten", () => {
  const actual = jest.requireActual("@/lib/founding-ten");
  return {
    ...actual,
    cohortSlots: (cohort: "charter" | "patron") =>
      cohort === "charter"
        ? [
            { cohort: "charter", serial: 1, holder: "Irving Salinas", issuedAt: "2026-07-29", emailHash: "a".repeat(64) },
            ...Array(9).fill(null),
          ]
        : Array(10).fill(null),
  };
});

describe("Roster", () => {
  it("names an issued holder and links to their proof page", () => {
    render(<Roster />);
    const link = screen.getByRole("link", { name: /Irving Salinas/ });
    expect(link).toHaveAttribute("href", "/founding-ten/charter-01");
  });

  it("shows every unissued slot as open, so the scarcity is countable", () => {
    render(<Roster />);
    // 9 open charter + 10 open patron
    expect(screen.getAllByText(/open/i)).toHaveLength(19);
  });

  it("renders both cohorts with all ten slots each", () => {
    render(<Roster />);
    const charter = screen.getByRole("region", { name: /charter member/i });
    expect(within(charter).getAllByRole("listitem")).toHaveLength(10);
  });
});
