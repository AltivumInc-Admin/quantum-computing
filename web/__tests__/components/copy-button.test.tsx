/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { CopyButton } from "@/components/copy-button";

describe("CopyButton", () => {
  const writeText = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    writeText.mockClear();
    Object.assign(navigator, { clipboard: { writeText } });
  });

  it("copies the provided text on click", () => {
    render(<CopyButton getText={() => "H 0\nCNOT 0 1"} />);
    fireEvent.click(screen.getByRole("button", { name: /copy/i }));
    expect(writeText).toHaveBeenCalledWith("H 0\nCNOT 0 1");
  });

  it("computes the text lazily at click time (not render time)", () => {
    let value = "a";
    render(<CopyButton getText={() => value} />);
    value = "b";
    fireEvent.click(screen.getByRole("button"));
    expect(writeText).toHaveBeenCalledWith("b");
  });

  it("announces copied feedback after copying", async () => {
    render(<CopyButton getText={() => "x"} />);
    fireEvent.click(screen.getByRole("button"));
    expect(await screen.findByText(/copied/i)).toBeInTheDocument();
  });

  it("uses a custom accessible label", () => {
    render(<CopyButton getText={() => "x"} label="Copy state" />);
    expect(screen.getByRole("button", { name: /copy state/i })).toBeInTheDocument();
  });

  it("falls back without throwing when the clipboard API is unavailable", () => {
    // @ts-expect-error simulate an insecure / unsupported context
    delete navigator.clipboard;
    document.execCommand = jest.fn();
    render(<CopyButton getText={() => "x"} />);
    expect(() => fireEvent.click(screen.getByRole("button"))).not.toThrow();
    expect(document.execCommand).toHaveBeenCalledWith("copy");
  });
});
