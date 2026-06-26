/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { EncodingExplorer } from "@/components/quantum/encoding-explorer";

describe("EncodingExplorer", () => {
  it("renders the Encoding header and a unit-norm readout", () => {
    render(<EncodingExplorer source={JSON.stringify({ x: [0.6, 0.9], encoding: "angle" })} />);
    expect(screen.getByText(/encoding/i)).toBeInTheDocument();
    // "1.000" appears in both the visible norm readout and the sr-only status.
    expect(screen.getAllByText(/1\.000/).length).toBeGreaterThan(0);
  });
  it("switches encoding without crashing", () => {
    render(<EncodingExplorer source={""} />);
    fireEvent.change(screen.getByLabelText(/encoding/i), { target: { value: "iqp" } });
    expect(screen.getByText(/encoding/i)).toBeInTheDocument();
  });
  it("announces the feature map and norm, and embeds norm in the slider value text", () => {
    render(<EncodingExplorer source={JSON.stringify({ x: [0.6, 0.9], encoding: "angle" })} />);
    expect(screen.getByRole("status")).toHaveTextContent(/feature map/i);
    const sliders = screen.getAllByRole("slider");
    expect(sliders[0]).toHaveAttribute("aria-valuetext", expect.stringMatching(/norm/i));
  });
  it("renders the qencode error card for malformed source", () => {
    expect(() => render(<EncodingExplorer source="{not json" />)).not.toThrow();
    expect(screen.getByText(/qencode error/i)).toBeInTheDocument();
  });
});
