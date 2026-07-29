/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { FoundingTenLink } from "@/components/founding-ten/founding-ten-link";

const badge = (serial: number) => ({
  cohort: "charter" as const,
  serial,
  holder: `Holder ${serial}`,
  issuedAt: "2026-07-29",
  emailHash: "a".repeat(64),
});

let issued: ReturnType<typeof badge>[] = [];
jest.mock("@/lib/founding-ten", () => {
  const actual = jest.requireActual("@/lib/founding-ten");
  return { ...actual, allBadges: () => issued };
});

describe("FoundingTenLink", () => {
  beforeEach(() => {
    issued = [];
  });

  it("points at the roster", () => {
    render(<FoundingTenLink locale="en" />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/founding-ten");
  });

  // The count IS the feature — a link labelled only "Founding Ten" would tell a
  // reader nothing about how few places remain, which is the whole claim.
  it("shows how many of the twenty places are claimed", () => {
    issued = [badge(1)];
    render(<FoundingTenLink locale="en" />);
    expect(screen.getByRole("link")).toHaveTextContent("01 / 20");
  });

  it("zero-pads the claimed count, matching the badge artwork's own NN / NN form", () => {
    render(<FoundingTenLink locale="en" />);
    expect(screen.getByRole("link")).toHaveTextContent("00 / 20");
  });

  it("tracks the registry rather than hardcoding a number", () => {
    issued = [badge(1), badge(2), badge(3)];
    render(<FoundingTenLink locale="en" />);
    expect(screen.getByRole("link")).toHaveTextContent("03 / 20");
  });

  // The visible text is a bare numeric pair; without a name a screen reader
  // announces "one slash twenty" with no subject.
  it("gives assistive tech a named accessible label", () => {
    issued = [badge(1)];
    render(<FoundingTenLink locale="en" />);
    expect(screen.getByRole("link")).toHaveAccessibleName(/founding ten/i);
  });

  it("translates its label", () => {
    render(<FoundingTenLink locale="es" />);
    expect(screen.getByRole("link")).toHaveTextContent(/Diez Fundadores/i);
  });
});
