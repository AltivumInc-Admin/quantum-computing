import { getRunnableFences } from "@/lib/py-challenge-fences";

/**
 * The e2e fixture page for the ```runnable fence renders whatever this returns,
 * so these are the assertions that keep web/e2e/runnable-editor.e2e.ts pointed at
 * content a learner actually sees. Before the fixture read the GUIDE it held a
 * hand-kept copy of the fence, and nothing compared the two — the spec could
 * have gone on proving a fence that had been edited or deleted upstream.
 */
describe("getRunnableFences", () => {
  const fences = getRunnableFences("01-foundations");

  it("finds the shipped runnable fence in 01-foundations", () => {
    expect(fences.length).toBeGreaterThan(0);
  });

  it("the fence the fixture renders is the Bell circuit the e2e drives", () => {
    // runnable-editor.e2e.ts asserts these after Run and again after Reset. If a
    // GUIDE edit moves them, that spec's premise breaks — fail here, at PR time,
    // rather than in a browser run minutes later.
    expect(fences[0]).toContain("from braket.circuits import Circuit");
    expect(fences[0]).toContain("Circuit().h(0).cnot(0, 1)");
    expect(fences[0]).toContain("print(circuit.state_vector())");
  });

  it("carries the fence body only, with no fence markers", () => {
    expect(fences[0]).not.toContain("```");
  });

  it("throws for a section with no GUIDE", () => {
    expect(() => getRunnableFences("99-not-a-section")).toThrow(/no GUIDE\.md/);
  });

  it("throws for a section that has a GUIDE but no runnable fence", () => {
    // 00-prereqs teaches the local install; its Python lives in notebooks, not
    // in an in-page sandbox. A fixture pointed there must fail the build rather
    // than render an empty editor.
    expect(() => getRunnableFences("00-prereqs")).toThrow(/no ```runnable fence/);
  });
});
