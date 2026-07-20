/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { DjDemo } from "@/components/quantum/dj-demo";
import { ORACLES } from "@/components/quantum/deutsch-jozsa";

describe("DjDemo", () => {
  it("defaults to a constant oracle and reads Constant", () => {
    render(<DjDemo source={JSON.stringify({ qubits: 3 })} />);
    // "Constant" appears in both the visible verdict badge and the sr-only status.
    expect(screen.getAllByText(/constant/i).length).toBeGreaterThan(0);
  });
  it("switching to a balanced oracle reads Balanced and announces the verdict", () => {
    render(<DjDemo source={JSON.stringify({ qubits: 3 })} />);
    fireEvent.change(screen.getByLabelText(/oracle/i), { target: { value: "parity" } });
    expect(screen.getAllByText(/balanced/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("status")).toHaveTextContent(/verdict: balanced/i);
  });
  it("labels every option from the kernel, never from a raw key", () => {
    // The picker is driven by ORACLES, and each entry now carries its own
    // label — so a new oracle can no longer ship an option captioned with its
    // bare key ("lowbit") via a missing entry in a parallel label map.
    render(<DjDemo source={JSON.stringify({ qubits: 3 })} />);
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(Object.keys(ORACLES).length);
    for (const [key, entry] of Object.entries(ORACLES)) {
      const option = options.find((o) => (o as HTMLOptionElement).value === key);
      expect(option).toBeDefined();
      expect(option).toHaveTextContent(entry.label);
    }
  });
  it("renders the footnote caption with the shared .text-caption utility", () => {
    render(<DjDemo source={JSON.stringify({ qubits: 3 })} />);
    const footnote = screen.getByText(/one query decides it/i);
    expect(footnote).toHaveClass("text-caption");
    expect(footnote).not.toHaveClass("text-gray-400");
  });
});
