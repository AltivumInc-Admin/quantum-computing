"""Canonical solutions for 05-quantum-chemistry/notebooks/02-fermion-qubit-mapping.ipynb.

Executed by tests/test_exercise_checks.py inside the notebook's namespace,
directly before each exercise's check cell.
"""

SOLUTIONS = {
    1: """
dagger_anticomm = np.array(
    [
        [anticommutator(jw_creation(p), jw_creation(q)) for q in range(N_MODES)]
        for p in range(N_MODES)
    ]
)
print("max |{a_p^dagger, a_q^dagger}| =", np.max(np.abs(dagger_anticomm)))
""",
    2: """
_V = 0.8
H2body = H + _V * (number_ops[0] @ number_ops[1])
H2body_terms = pauli_decompose(H2body)
for _label, _coeff in H2body_terms:
    print(f"  {_label}  coeff = {_coeff.real:+.4f}  weight = {pauli_weight(_label)}")
""",
    3: """
distant_hop = jw_creation(0) @ jw_annihilation(3) + jw_creation(3) @ jw_annihilation(0)
distant_terms = pauli_decompose(distant_hop)
for _label, _coeff in distant_terms:
    print(f"  {_label}  coeff = {_coeff.real:+.4f}  weight = {pauli_weight(_label)}")
""",
    4: """
H_eigs = np.linalg.eigvalsh(H)
ground_energy = float(H_eigs[0])
print("ground energy      =", round(ground_energy, 4))
print("reference hf_energy =", round(hf_energy, 4))
""",
}
