"""Canonical solutions for 05-quantum-chemistry/notebooks/06-active-space.ipynb.

Executed by tests/test_exercise_checks.py inside the notebook's namespace,
directly before each exercise's check cell.
"""

SOLUTIONS = {
    1: """
E_tapered_excited = float(H2_C0 + np.hypot(H2_CZ, H2_CX))
print("excited", round(E_tapered_excited, 6), "vs ground", round(E_tapered_ground, 6))
""",
    2: """
full_spectrum = np.linalg.eigvalsh(H_full)
_tapered_spectrum = np.linalg.eigvalsh(H_tapered)
matched_distances = [float(np.min(np.abs(full_spectrum - _te))) for _te in _tapered_spectrum]
print(matched_distances)
""",
    3: """
basis_energies = {}
for _bit, _idx in (("0", 0), ("1", 1)):
    _v = np.zeros(2, dtype=complex)
    _v[_idx] = 1.0
    basis_energies[_bit] = complex(_v.conj() @ H_tapered @ _v)
hf_tapered = min(float(np.real(_e)) for _e in basis_energies.values())
print(basis_energies, "->", round(hf_tapered, 6))
""",
    4: """
ry_thetas = np.linspace(-np.pi, np.pi, 401)
ry_energies = []
for _theta in ry_thetas:
    _psi = statevector(Circuit().ry(0, _theta))
    ry_energies.append(float(np.real(_psi.conj() @ H_tapered @ _psi)))
E_vqe = min(ry_energies)
print("Ry-VQE min", round(E_vqe, 6), "vs FCI", round(H2_FCI, 6))
""",
}
