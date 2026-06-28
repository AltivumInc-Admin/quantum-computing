/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { PasswordChecklist } from "@/components/auth/password-checklist";

describe("PasswordChecklist", () => {
  it("reflects each criterion for the given password", () => {
    render(<PasswordChecklist password="abcdefgh" />); // length + lower met; upper + number not
    expect(screen.getByLabelText("At least 8 characters: met")).toHaveAttribute("data-met", "true");
    expect(screen.getByLabelText("A lowercase letter: met")).toHaveAttribute("data-met", "true");
    expect(screen.getByLabelText("An uppercase letter: not met")).toHaveAttribute("data-met", "false");
    expect(screen.getByLabelText("A number: not met")).toHaveAttribute("data-met", "false");
  });

  it("marks every row met for a compliant password", () => {
    render(<PasswordChecklist password="Password1" />);
    for (const label of ["At least 8 characters", "An uppercase letter", "A lowercase letter", "A number"]) {
      expect(screen.getByLabelText(`${label}: met`)).toBeInTheDocument();
    }
  });

  it("omits the Passwords match row when confirm is undefined", () => {
    render(<PasswordChecklist password="Password1" />);
    expect(screen.queryByLabelText(/passwords match/i)).toBeNull();
  });

  it("adds a Passwords match row that flips when confirm equals password", () => {
    const { rerender } = render(<PasswordChecklist password="Password1" confirm="" />);
    expect(screen.getByLabelText("Passwords match: not met")).toHaveAttribute("data-met", "false");
    rerender(<PasswordChecklist password="Password1" confirm="Password1" />);
    expect(screen.getByLabelText("Passwords match: met")).toHaveAttribute("data-met", "true");
  });

  it("never announces on the informational (no-confirm) sign-in checklist", () => {
    const { rerender } = render(<PasswordChecklist password="abc" />);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    rerender(<PasswordChecklist password="Password1" />); // all criteria met, but no confirm field
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("withholds the all-met announcement until confirm also matches", () => {
    const { rerender } = render(<PasswordChecklist password="Password1" confirm="" />);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    rerender(<PasswordChecklist password="Password1" confirm="Password1" />);
    expect(screen.getByRole("status")).toHaveTextContent("Password meets all requirements.");
  });
});
