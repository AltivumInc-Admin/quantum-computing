/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { PasswordField } from "@/components/auth/password-field";

describe("PasswordField", () => {
  it("renders a labeled password input, masked by default", () => {
    render(<PasswordField id="pw" label="Password" value="" onChange={() => {}} />);
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "Show password" })).toHaveAttribute("aria-pressed", "false");
  });

  it("toggles visibility and updates the button label/state", () => {
    render(<PasswordField id="pw" label="Password" value="secret" onChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "text");
    const hide = screen.getByRole("button", { name: "Hide password" });
    expect(hide).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(hide);
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
  });

  it("calls onChange when the user types", () => {
    const onChange = jest.fn();
    render(<PasswordField id="pw" label="Password" value="" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "abc" } });
    expect(onChange).toHaveBeenCalledWith("abc");
  });

  it("derives the eyeball label from the field label, so multiple fields stay distinguishable", () => {
    render(<PasswordField id="confirm" label="Confirm password" value="" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Show confirm password" })).toBeInTheDocument();
  });
});
