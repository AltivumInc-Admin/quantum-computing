"""Reusable oracle circuit construction for quantum algorithms."""

import numpy as np
from braket.circuits import Circuit


def constant_oracle(n_qubits: int, output_value: int = 0) -> Circuit:
    """Create a constant oracle f(x) = constant for all x.

    Args:
        n_qubits: Number of input qubits.
        output_value: 0 or 1 — the constant output.

    Returns:
        Circuit implementing the oracle on n_qubits + 1 (ancilla) qubits.
    """
    circuit = Circuit()
    if output_value == 1:
        circuit.x(n_qubits)  # Flip ancilla to make f(x) = 1
    return circuit


def balanced_oracle(n_qubits: int, secret_bits: str = None) -> Circuit:
    """Create a balanced oracle f(x) = 1 for exactly half of inputs.

    Args:
        n_qubits: Number of input qubits.
        secret_bits: Binary string of length n_qubits. CNOT applied where bit is '1'.

    Returns:
        Circuit implementing the oracle on n_qubits + 1 qubits.
    """
    if secret_bits is None:
        secret_bits = "1" * n_qubits

    circuit = Circuit()
    ancilla = n_qubits
    for i, bit in enumerate(secret_bits):
        if bit == "1":
            circuit.cnot(i, ancilla)
    return circuit


def _apply_multi_controlled_z(circuit: Circuit, n_qubits: int) -> Circuit:
    """Append a multi-controlled Z (a -1 phase on |1...1> only) across qubits 0..n-1.

    For 1-3 qubits this uses the textbook decompositions (Z, H-CNOT-H = CZ,
    H-CCNOT-H = CCZ). For 4 or more qubits there is no ancilla to borrow -- the
    Grover circuits here span exactly n qubits -- so the general branch builds
    C^(n-1)Z as a phase polynomial: |1..1><1..1| expands over Pauli-Z strings as
    (1/2^n) * sum_S (-1)^|S| Z_S, so exp(i*pi*|1..1><1..1|) factors into one
    exp(i*theta*Z_S) per non-empty subset S -- a CNOT parity ladder plus a
    single Rz. Exact, but the term count is 2^n - 1: fine for teaching-scale n,
    while production compilers use ancilla-assisted Toffoli ladders instead.
    The construction is exact up to a global phase, which no measurement sees.
    """
    if n_qubits == 1:
        circuit.z(0)
    elif n_qubits == 2:
        circuit.h(1)
        circuit.cnot(0, 1)
        circuit.h(1)
    elif n_qubits == 3:
        circuit.h(2)
        circuit.ccnot(0, 1, 2)
        circuit.h(2)
    else:
        from itertools import combinations

        for size in range(1, n_qubits + 1):
            # exp(i*alpha*Z_S) with alpha = pi*(-1)^|S| / 2^n is Rz(-2*alpha) on
            # the subset parity; Braket's rz(theta) = exp(-i*theta*Z/2).
            theta = np.pi * ((-1) ** (size + 1)) / (2 ** (n_qubits - 1))
            for subset in combinations(range(n_qubits), size):
                target = subset[-1]
                for q in subset[:-1]:
                    circuit.cnot(q, target)
                circuit.rz(target, theta)
                for q in reversed(subset[:-1]):
                    circuit.cnot(q, target)
    return circuit


def grover_oracle(n_qubits: int, marked_state: str) -> Circuit:
    """Create a Grover oracle that marks a specific state.

    Applies a phase flip (-1) to the marked state.

    Args:
        n_qubits: Number of qubits.
        marked_state: Binary string of the state to mark (e.g., "101").

    Returns:
        Circuit implementing the phase oracle.
    """
    circuit = Circuit()

    # Flip qubits where marked_state has '0'
    for i, bit in enumerate(marked_state):
        if bit == "0":
            circuit.x(i)

    # Multi-controlled Z: -1 phase on |1...1>, so after the X conjugation the
    # flip lands exactly on the marked state. Handles every n >= 1 (the general
    # branch is a phase-polynomial decomposition -- see _apply_multi_controlled_z).
    _apply_multi_controlled_z(circuit, n_qubits)

    # Undo the flips
    for i, bit in enumerate(marked_state):
        if bit == "0":
            circuit.x(i)

    return circuit


def grover_diffusion(n_qubits: int) -> Circuit:
    """Create the Grover diffusion operator (reflect about mean).

    Args:
        n_qubits: Number of qubits.

    Returns:
        Circuit implementing the diffusion operator.
    """
    circuit = Circuit()

    # Apply H to all
    for i in range(n_qubits):
        circuit.h(i)

    # Apply X to all
    for i in range(n_qubits):
        circuit.x(i)

    # Multi-controlled Z (all n >= 1; see _apply_multi_controlled_z)
    _apply_multi_controlled_z(circuit, n_qubits)

    # Undo X
    for i in range(n_qubits):
        circuit.x(i)

    # Undo H
    for i in range(n_qubits):
        circuit.h(i)

    return circuit
