"""Canonical solutions for 03-algorithms/notebooks/03-qft.ipynb.

Executed by tests/test_exercise_checks.py inside the notebook's namespace,
directly before each exercise's check cell.
"""

SOLUTIONS = {
    1: """
qft2_hand = Circuit()
qft2_hand.h(0)
qft2_hand.cphaseshift(1, 0, np.pi / 2)
qft2_hand.h(1)
qft2_hand.swap(0, 1)
assert np.allclose(statevector(qft2_hand), statevector(build_qft(2)), atol=1e-9)
print("QFT(2) by hand matches build_qft(2).")
""",
    2: """
qft_j3_circuit = prep_basis(3, 3)
qft_j3_circuit.add_circuit(build_qft(3))
assert np.allclose(statevector(qft_j3_circuit), qft_basis_expected(3, 3), atol=1e-9)
print("QFT|3> on n=3 matches the exact phase-spread formula.")
""",
    3: """
_qft3_forward = build_qft(3)
_rt_circ = prep_basis(3, 6)
_rt_circ.add_circuit(_qft3_forward)
_rt_circ.add_circuit(_qft3_forward.adjoint())
roundtrip_state = statevector(_rt_circ)
recovered_j = int(np.argmax(np.abs(roundtrip_state)))
print(f"Recovered input index = {recovered_j}")
""",
}
