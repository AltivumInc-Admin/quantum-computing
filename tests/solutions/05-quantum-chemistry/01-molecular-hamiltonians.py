"""Canonical solutions for 05-quantum-chemistry/notebooks/01-molecular-hamiltonians.ipynb.

Executed by tests/test_exercise_checks.py inside the notebook's namespace,
directly before each exercise's check cell.
"""

SOLUTIONS = {
    1: """
top3_terms = sorted(H2_TERMS, key=lambda term: abs(term[1]), reverse=True)[:3]
for _pauli, _coeff in top3_terms:
    print(f"{_pauli}  {_coeff:+.6f}")
""",
    2: """
kept_terms = [(p, c) for p, c in H2_TERMS if abs(c) > 0.05]
trunc_ground = float(np.linalg.eigvalsh(hamiltonian_matrix(kept_terms))[0])
print(len(kept_terms), "terms ->", round(trunc_ground, 6), "vs FCI", round(H2_FCI, 6))
""",
    3: """
det_energies = {}
for _bits in ("1010", "0110", "0011"):
    _v = np.zeros(16, dtype=complex)
    _v[int(_bits, 2)] = 1.0
    det_energies[_bits] = hamiltonian_energy(_v, H2_TERMS)
print(det_energies)
""",
    4: """
np.random.seed(0)
random_energies = []
for _ in range(20):
    _v = np.random.randn(16) + 1j * np.random.randn(16)
    _v /= np.linalg.norm(_v)
    random_energies.append(hamiltonian_energy(_v, H2_TERMS))
print(min(random_energies), max(random_energies))
""",
}
