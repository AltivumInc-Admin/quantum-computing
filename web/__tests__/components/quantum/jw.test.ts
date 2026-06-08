import {
  jwString,
  jwTransform,
  hfOccupation,
  occupationToBitstring,
  occupationIndex,
  electronCount,
} from "@/components/quantum/jw";

describe("jw Jordan-Wigner transform", () => {
  it("jwString places a Z-string on lower modes, the operator on its mode, I above", () => {
    expect(jwString(0, 4, "X")).toBe("XIII"); // no lower modes -> no Z-string
    expect(jwString(2, 4, "X")).toBe("ZZXI");
    expect(jwString(3, 4, "Y")).toBe("ZZZY");
  });
  it("jwTransform: a_p^dagger uses ySign -1, a_p uses +1, same Z-chain", () => {
    const create = jwTransform(2, 4, true);
    expect(create.xString).toBe("ZZXI");
    expect(create.yString).toBe("ZZYI");
    expect(create.ySign).toBe(-1);
    expect(create.zChain).toEqual([0, 1]);
    expect(jwTransform(2, 4, false).ySign).toBe(1);
  });
  it("Hartree-Fock occupation fills the lowest spin-orbitals; H2 = |1100>", () => {
    expect(hfOccupation(2, 4)).toEqual([1, 1, 0, 0]);
    expect(occupationToBitstring(hfOccupation(2, 4))).toBe("1100");
    expect(occupationIndex(hfOccupation(2, 4))).toBe(12); // big-endian, matches HF_INDEX
    expect(electronCount(hfOccupation(2, 4))).toBe(2);
  });
});
