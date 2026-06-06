import { toPythonState } from "@/components/quantum/state-readout";
import { simulate } from "@/components/quantum/math";

describe("toPythonState (runnable NumPy state-vector literal)", () => {
  it("emits a NumPy complex array for the Bell state", () => {
    const bell = simulate(
      [
        { gate: "H", target: 0 },
        { gate: "CNOT", control: 0, target: 1 },
      ],
      2
    );
    const py = toPythonState(bell);
    expect(py.startsWith("np.array([")).toBe(true);
    expect(py).toContain("0.707107+0j");
    expect(py.match(/j/g)!.length).toBe(4); // one per amplitude
  });

  it("snaps near-zero components to 0j", () => {
    const ket1 = simulate([{ gate: "X", target: 0 }], 1); // |1>
    expect(toPythonState(ket1)).toBe("np.array([0j, 1+0j])");
  });

  it("uses j (not mathematical i) for imaginary parts", () => {
    const plusI = simulate([{ gate: "H", target: 0 }, { gate: "S", target: 0 }], 1); // (|0> + i|1>)/sqrt2
    const py = toPythonState(plusI);
    expect(py).toContain("0.707107j");
    expect(py).not.toContain("i");
  });
});
