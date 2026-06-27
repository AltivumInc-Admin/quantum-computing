/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CopyLinkButton } from "@/components/glossary/copy-link-button";

describe("CopyLinkButton", () => {
  it("copies the current URL and shows feedback", async () => {
    // userEvent.setup() installs a clipboard stub via Object.defineProperty
    // (configurable: true). The mock must be set AFTER setup so that
    // Object.defineProperty can override the getter the stub installed.
    const user = userEvent.setup();
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
      writable: true,
    });
    render(<CopyLinkButton />);
    await user.click(screen.getByRole("button", { name: /copy link/i }));
    expect(writeText).toHaveBeenCalledWith(window.location.href);
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });
});
