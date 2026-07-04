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
  it("grid(9): corner-to-corner costs 3 SWAPs via swapCost", () => {
    expect(swapCost("grid", 9, 0, 8).swaps).toBe(3);
  });
  it("a === b: zero SWAPs and the single-node path", () => {
    expect(swapCost("ring", 5, 2, 2)).toEqual({ path: [2], swaps: 0 });
  });
  it("unreachable target (out-of-range b): swaps -1 and an empty path", () => {
    expect(swapCost("line", 4, 0, 9)).toEqual({ path: [], swaps: -1 });
  });
});
