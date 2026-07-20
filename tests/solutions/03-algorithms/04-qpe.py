"""Canonical solutions for 03-algorithms/notebooks/04-qpe.ipynb.

Executed by tests/test_exercise_checks.py inside the notebook's namespace,
directly before each exercise's check cell. Each snippet may lean on names the
notebook defines or imports earlier (qft_circuit, qpe_phase, statevector,
Circuit, np).
"""

SOLUTIONS = {
    1: """
def _qpe_s_gate(t):
    eig = t
    circ = Circuit().x(eig)
    for k in range(t):
        circ.h(k)
    for k in range(t):
        circ.cphaseshift(k, eig, (np.pi / 2) * (2 ** (t - 1 - k)))
    circ.add_circuit(qft_circuit(t).adjoint())
    return circ


_s_circ = _qpe_s_gate(2)
_s_probs = np.abs(statevector(_s_circ)) ** 2
_s_idx = int(np.argmax(_s_probs))
_s_bits = format(_s_idx, "0" + str(_s_circ.qubit_count) + "b")
s_phi_hat = int(_s_bits[:2], 2) / 2 ** 2
print("s_phi_hat =", s_phi_hat)
""",
    2: """
def _qpe_t_zero_state(t):
    eig = t
    circ = Circuit()  # eigenstate qubit left in |0> on purpose (no x(eig))
    for k in range(t):
        circ.h(k)
    for k in range(t):
        circ.cphaseshift(k, eig, (np.pi / 4) * (2 ** (t - 1 - k)))
    circ.add_circuit(qft_circuit(t).adjoint())
    return circ


_z_circ = _qpe_t_zero_state(3)
_z_probs = np.abs(statevector(_z_circ)) ** 2
_z_idx = int(np.argmax(_z_probs))
_z_bits = format(_z_idx, "0" + str(_z_circ.qubit_count) + "b")
zero_phi_hat = int(_z_bits[:3], 2) / 2 ** 3
print("zero_phi_hat =", zero_phi_hat)
""",
    3: """
sweep_ts = [2, 3, 4, 5, 6]
_phi_true = 0.1
sweep_errors = []
for _tt in sweep_ts:
    _c = qpe_phase(_tt, _phi_true)
    _p = np.abs(statevector(_c)) ** 2
    _j = int(np.argmax(_p))
    _b = format(_j, "0" + str(_c.qubit_count) + "b")
    _est = int(_b[:_tt], 2) / 2 ** _tt
    sweep_errors.append(abs(_est - _phi_true))

plt.figure(figsize=(7, 4))
plt.semilogy(sweep_ts, sweep_errors, marker="o", color="#4c72b0")
plt.xlabel("t (counting qubits)")
plt.ylabel("|error|")
plt.title("QPE best-estimate error vs t for phi = 0.1")
plt.tight_layout()
plt.show()
print("sweep_errors =", sweep_errors)
""",
}
