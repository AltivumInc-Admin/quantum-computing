/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { BadgeProof } from "@/components/founding-ten/badge-proof";

const badge = {
  cohort: "charter" as const,
  serial: 1,
  holder: "Irving Salinas",
  issuedAt: "2026-07-29",
  emailHash: "a".repeat(64),
};

describe("BadgeProof", () => {
  it("names the holder and the serial, which is what makes it verifiable", () => {
    render(<BadgeProof badge={badge} />);
    expect(screen.getByText("Irving Salinas")).toBeInTheDocument();
    // "Charter Member" legitimately appears twice — the label line and the
    // certifying paragraph both name the cohort.
    expect(screen.getAllByText(/Charter Member/)).toHaveLength(2);
    expect(screen.getByText(/01\s*\/\s*10/)).toBeInTheDocument();
  });

  it("shows the issue date as a machine-readable time element", () => {
    render(<BadgeProof badge={badge} />);
    expect(screen.getByText("29 July 2026").closest("time")).toHaveAttribute(
      "dateTime",
      "2026-07-29",
    );
  });

  // These are awarded for position in time. Claiming otherwise would devalue
  // the earned medals on /credentials, which are derived from real work.
  it("never claims the badge was earned through study", () => {
    const { container } = render(<BadgeProof badge={badge} />);
    expect(container.textContent).not.toMatch(/earned|mastery|achievement/i);
  });

  it("renders the artwork with a descriptive alt text", () => {
    render(<BadgeProof badge={badge} />);
    expect(screen.getByRole("img")).toHaveAttribute(
      "alt",
      "Charter Member badge, serial 01 of 10",
    );
  });
});
