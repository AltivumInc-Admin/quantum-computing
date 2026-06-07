import { adjacency, shortestPath, swapCost } from "@/components/quantum/topology";

describe("topology", () => {
  it("line(5): 0->4 needs 3 SWAPs", () => {
    expect(swapCost("line", 5, 0, 4).swaps).toBe(3);
  });
  it("all-to-all: any pair needs 0 SWAPs", () => {
    expect(swapCost("all-to-all", 6, 0, 5).swaps).toBe(0);
  });
  it("ring(4): 0->2 needs 1 SWAP (path length 3)", () => {
    expect(swapCost("ring", 4, 0, 2).swaps).toBe(1);
  });
  it("grid(9): 0 and 8 are corners of a 3x3, shortest path length 5 (4 edges)", () => {
    expect(shortestPath(adjacency("grid", 9), 0, 8)!.length).toBe(5);
  });
  it("adjacent qubits need 0 SWAPs", () => {
    expect(swapCost("line", 5, 1, 2).swaps).toBe(0);
  });
});
