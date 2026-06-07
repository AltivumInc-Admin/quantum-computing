import { parseCorrelation, sampleOutcome } from "@/components/quantum/correlation";
import { simulate, probabilities } from "@/components/quantum/math";
import { opsFor, parseProgram } from "@/components/quantum/qsim-dsl";

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
});

describe("sampleOutcome", () => {
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

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
