"""Canonical solutions for 03-algorithms/notebooks/02-grovers-search.ipynb.

Executed by tests/test_exercise_checks.py inside the notebook's namespace,
directly before each exercise's check cell.
"""

SOLUTIONS = {
    1: """
alt_marked = "011"
alt_probs = np.abs(statevector(grover_circuit(2, marked=alt_marked))) ** 2
print(f"argmax at index {int(np.argmax(alt_probs))} = |{alt_marked}>")
""",
    2: """
two_marked = ["101", "010"]
two_optimal_k = int(np.floor(np.pi / 4 * np.sqrt(N / len(two_marked))))

_circ = Circuit()
for _q in range(n):
    _circ.h(_q)
for _ in range(two_optimal_k):
    for _m in two_marked:
        apply_oracle(_circ, _m)
    apply_diffuser(_circ)
two_probs = np.abs(statevector(_circ)) ** 2
print(f"optimal k for M=2 is {two_optimal_k}; marked probs {two_probs[[int(s, 2) for s in two_marked]]}")
""",
    3: """
marked4 = "1011"
_anc = 4  # ancilla qubit; the four data qubits are 0..3


def _c3z(circ):
    # three-controlled Z on data qubits 0,1,2,3 via a clean ancilla
    circ.h(3)
    circ.ccnot(0, 1, _anc)
    circ.ccnot(2, _anc, 3)
    circ.ccnot(0, 1, _anc)
    circ.h(3)
    return circ


def _grover4(iterations, marked):
    circ = Circuit()
    for q in range(4):
        circ.h(q)
    circ.i(_anc)  # keep the ancilla in the register at every iteration count
    for _ in range(iterations):
        zeros = [q for q, bit in enumerate(marked) if bit == "0"]
        for q in zeros:
            circ.x(q)
        _c3z(circ)
        for q in zeros:
            circ.x(q)
        for q in range(4):
            circ.h(q)
        for q in range(4):
            circ.x(q)
        _c3z(circ)
        for q in range(4):
            circ.x(q)
        for q in range(4):
            circ.h(q)
    return circ


_m4 = int(marked4, 2)  # data pattern; the ancilla (LSB) stays 0, so the index is 2 * _m4
success4 = [float(np.abs(statevector(_grover4(k, marked4))[2 * _m4]) ** 2) for k in range(6)]
optimal_k_4 = int(np.argmax(success4))
print(f"success4 = {[round(p, 4) for p in success4]}; optimal_k_4 = {optimal_k_4}")
""",
}
