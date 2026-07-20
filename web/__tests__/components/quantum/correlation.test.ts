import { parseCorrelation, sampleOutcome } from "@/components/quantum/correlation";
import { simulate, probabilities } from "@/components/quantum/math";
import { opsFor, parseProgram } from "@/components/quantum/qsim-dsl";
import { mulberry32 } from "@/components/quantum/rng";

function probsFor(src: string): number[] {
  const p = parseProgram(src);
  return probabilities(simulate(opsFor(p, 0), p.n));
}

describe("parseCorrelation", () => {
  it("parses prompt + two 2-qubit programs", () => {
    const r = parseCorrelation(JSON.stringify({ prompt: "p", entangled: "H 0\nCNOT 0 1", product: "H 0\nH 1" }));
    expect(r.spec).not.toBeNull();
    expect(r.spec!.entangled.n).toBe(2);
    expect(r.spec!.product.n).toBe(2);
  });
  it("rejects a non-2-qubit circuit", () => {
    const r = parseCorrelation(JSON.stringify({ prompt: "p", entangled: "H 0", product: "H 0\nH 1" }));
    expect(r.spec).toBeNull();
    expect(r.error).toMatch(/two qubits/i);
  });
  it("rejects a slider-bound theta (this widget samples at opsFor(spec, 0))", () => {
    // The DSL parses `theta` in any fence; unguarded, the bound gate would be
    // evaluated at 0 while the chip advertised "RY(θ) q0".
    const r = parseCorrelation(
      JSON.stringify({ prompt: "p", entangled: "RY 0 theta\nCNOT 0 1", product: "H 0\nH 1" })
    );
    expect(r.spec).toBeNull();
    expect(r.error).toMatch(/slider-bound theta/i);
  });
});

describe("sampleOutcome", () => {
  it("skips zero-mass outcomes even when rng() === 0 (single-sourced from shots.ts)", () => {
    expect(sampleOutcome([0, 0.5, 0, 0.5], () => 0)).toBe(1);
  });
  it("a Bell pair only ever yields 00 or 11", () => {
    const probs = probsFor("H 0\nCNOT 0 1");
    const rng = mulberry32(5);
    for (let i = 0; i < 200; i++) expect([0, 3]).toContain(sampleOutcome(probs, rng));
  });
  it("a product state can yield all four outcomes", () => {
    const probs = probsFor("H 0\nH 1");
    const rng = mulberry32(9);
    const seen = new Set<number>();
    for (let i = 0; i < 400; i++) seen.add(sampleOutcome(probs, rng));
    expect(seen.size).toBe(4);
  });
});
