/**
 * Jordan-Wigner transform helpers for the qjw widget.
 *
 * The Jordan-Wigner mapping turns fermionic creation/annihilation operators into
 * Pauli strings. Occupation of spin-orbital p maps to qubit p (|0> empty, |1>
 * occupied), and a fermionic operator on mode p picks up a trailing Z-string on
 * all LOWER-index modes to encode the fermionic antisymmetry (parity):
 *
 *   a_p^dagger = (X_p - i Y_p)/2  (x) Z_{p-1} ... Z_0
 *   a_p        = (X_p + i Y_p)/2  (x) Z_{p-1} ... Z_0
 *
 * Strings are BIG-ENDIAN to match math.ts / chemistry.ts: char k acts on qubit k,
 * qubit 0 is leftmost. So the Z-string occupies positions 0..p-1, the X/Y factor
 * sits at position p, and identity fills p+1..n-1.
 */

/** The Pauli string for a single-Pauli factor `op` on `mode`, with the JW Z-string. */
export function jwString(mode: number, n: number, op: "X" | "Y"): string {
  const chars: string[] = [];
  for (let q = 0; q < n; q++) {
    if (q < mode) chars.push("Z");
    else if (q === mode) chars.push(op);
    else chars.push("I");
  }
  return chars.join("");
}

/**
 * The Jordan-Wigner image of a_p (or a_p^dagger): the X and Y Pauli strings and
 * the sign of the imaginary Y coefficient. a_p^dagger = (X - iY)/2 -> ySign -1;
 * a_p = (X + iY)/2 -> ySign +1. Both X and Y carry the same lower-mode Z-string.
 */
export interface JwImage {
  mode: number;
  dagger: boolean;
  xString: string;
  yString: string;
  /** sign of the i Y/2 term: +1 for a_p, -1 for a_p^dagger. */
  ySign: number;
  /** indices carrying the trailing Z-string (modes 0..p-1). */
  zChain: number[];
}

export function jwTransform(mode: number, n: number, dagger: boolean): JwImage {
  return {
    mode,
    dagger,
    xString: jwString(mode, n, "X"),
    yString: jwString(mode, n, "Y"),
    ySign: dagger ? -1 : 1,
    zChain: Array.from({ length: mode }, (_, i) => i),
  };
}

/** The Hartree-Fock occupation: the lowest `nElectrons` of `n` spin-orbitals filled. */
export function hfOccupation(nElectrons: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => (i < nElectrons ? 1 : 0));
}

/** Occupation vector -> computational-basis bitstring (big-endian, mode 0 leftmost). */
export function occupationToBitstring(occ: number[]): string {
  return occ.join("");
}

/** Occupation vector -> basis-state index (mode 0 = MSB), matching math.ts. */
export function occupationIndex(occ: number[]): number {
  return parseInt(occ.join(""), 2);
}

/** Total electron number of an occupation vector. */
export function electronCount(occ: number[]): number {
  return occ.reduce((a, b) => a + b, 0);
}
