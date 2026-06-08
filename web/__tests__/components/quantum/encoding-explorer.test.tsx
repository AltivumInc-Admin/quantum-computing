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
    expect(screen.getByText(/1\.000/)).toBeInTheDocument();
  });
  it("switches encoding without crashing", () => {
    render(<EncodingExplorer source={""} />);
    fireEvent.change(screen.getByLabelText(/encoding/i), { target: { value: "iqp" } });
    expect(screen.getByText(/encoding/i)).toBeInTheDocument();
  });
});
