"""Reusable oracle circuit construction for quantum algorithms."""

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

    # Multi-controlled Z (implemented as H-MCX-H on last qubit)
    circuit.h(n_qubits - 1)
    # For 3+ qubits, decompose into Toffoli + CNOT
    if n_qubits == 2:
        circuit.cnot(0, 1)
    elif n_qubits == 3:
        circuit.ccnot(0, 1, 2)
    circuit.h(n_qubits - 1)

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

    # Multi-controlled Z
    circuit.h(n_qubits - 1)
    if n_qubits == 2:
        circuit.cnot(0, 1)
    elif n_qubits == 3:
        circuit.ccnot(0, 1, 2)
    circuit.h(n_qubits - 1)

    # Undo X
    for i in range(n_qubits):
        circuit.x(i)

    # Undo H
    for i in range(n_qubits):
        circuit.h(i)

    return circuit
