/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { TopologyExplorer } from "@/components/quantum/topology-explorer";

describe("TopologyExplorer", () => {
  it("reports the SWAP cost for a line topology", () => {
    render(<TopologyExplorer source={JSON.stringify({ topology: "line", qubits: 5, gate: [0, 4] })} />);
    expect(screen.getByText(/3 SWAP/i)).toBeInTheDocument();
  });
  it("reports 0 SWAPs for all-to-all", () => {
    render(<TopologyExplorer source={JSON.stringify({ topology: "all-to-all", qubits: 5, gate: [0, 4] })} />);
    expect(screen.getByText(/0 SWAP/i)).toBeInTheDocument();
  });
  it("renders an error card for bad JSON", () => {
    render(<TopologyExplorer source={"{ not json"} />);
    expect(screen.getByText(/error/i)).toBeInTheDocument();
  });
});
