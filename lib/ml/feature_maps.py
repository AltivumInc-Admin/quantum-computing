"""Quantum data encoding circuits (feature maps) for QML."""

import numpy as np
from braket.circuits import Circuit


def angle_encoding(features: np.ndarray) -> Circuit:
    """Encode features as rotation angles (one qubit per feature).

    Args:
        features: 1D array of feature values.

    Returns:
        Circuit with Ry rotations encoding each feature.
    """
    circuit = Circuit()
    for i, x in enumerate(features):
        circuit.ry(i, x)
    return circuit


def iqp_encoding(features: np.ndarray, reps: int = 2) -> Circuit:
    """IQP (Instantaneous Quantum Polynomial) encoding.

    Creates an exponentially large feature space via ZZ interactions.

    Args:
        features: 1D array of feature values.
        reps: Number of encoding repetitions.

    Returns:
        Circuit implementing IQP encoding.
    """
    n_qubits = len(features)
    circuit = Circuit()

    for _ in range(reps):
        # Hadamard layer
        for i in range(n_qubits):
            circuit.h(i)

        # Single-qubit Z rotations
        for i in range(n_qubits):
            circuit.rz(i, features[i])

        # Two-qubit ZZ interactions (product of features)
        for i in range(n_qubits):
            for j in range(i + 1, n_qubits):
                angle = features[i] * features[j]
                circuit.cnot(i, j)
                circuit.rz(j, angle)
                circuit.cnot(i, j)

    return circuit


def amplitude_encoding(features: np.ndarray) -> Circuit:
    """Möttönen amplitude encoding — encodes N non-negative features into log2(N) qubits.

    Prepares the state ``|psi> = sum_i (f_i / ||f||) |i>`` using the recursive
    uniformly-controlled Ry decomposition of Möttönen, Bergholm, Cybulski, and
    Vartiainen (PRA 2004, doi:10.1103/PhysRevA.71.052330). For a length-N
    feature vector with N a power of 2, the circuit uses N-1 Ry rotations and
    N-2 CNOTs.

    Args:
        features: 1D array of non-negative feature values. Length must be a
            power of 2 and at least 2. The vector is L2-normalized before
            encoding.

    Returns:
        Circuit on ``log2(N)`` qubits that prepares the amplitude-encoded state.

    Raises:
        ValueError: if ``features`` is the zero vector, the length is not a
            power of 2 (or less than 2), or any feature is negative. Sign
            handling requires additional Rz corrections that this routine does
            not perform; use :func:`angle_encoding` for signed data.
    """
    features = np.asarray(features, dtype=float)
    norm = float(np.linalg.norm(features))
    if norm == 0:
        raise ValueError("Cannot encode zero vector")

    n_amplitudes = features.size
    if n_amplitudes < 2 or (n_amplitudes & (n_amplitudes - 1)) != 0:
        raise ValueError(f"Feature length must be a power of 2 and >= 2, got {n_amplitudes}")
    if np.any(features < 0):
        raise ValueError(
            "amplitude_encoding requires non-negative features. "
            "For signed data, use angle_encoding or apply sign-correction Z "
            "gates after this routine."
        )

    amplitudes = features / norm
    n_qubits = int(np.log2(n_amplitudes))
    circuit = Circuit()

    # Möttönen top-down ladder. At each level k (0..n_qubits-1) apply a
    # uniformly-controlled Ry on qubit k, controlled by qubits 0..k-1.
    for level in range(n_qubits):
        alphas = _mottonen_alphas(amplitudes, level, n_qubits)
        if level == 0:
            circuit.ry(0, alphas[0])
        else:
            _apply_uniformly_controlled_ry(
                circuit,
                alphas,
                target=level,
                controls=list(range(level)),
            )

    return circuit


def _mottonen_alphas(amplitudes: np.ndarray, level: int, n_qubits: int) -> list[float]:
    """Compute the 2^level Ry angles for Möttönen level ``level``.

    Partitions ``amplitudes`` into 2^level contiguous groups of size 2^(n-level).
    Each group's angle is ``2 * arcsin(||upper half|| / ||group||)``.
    """
    group_size = 1 << (n_qubits - level)
    n_groups = 1 << level
    alphas: list[float] = []
    for j in range(n_groups):
        group = amplitudes[j * group_size : (j + 1) * group_size]
        full_norm = float(np.linalg.norm(group))
        if full_norm < 1e-15:
            alphas.append(0.0)
            continue
        upper_norm = float(np.linalg.norm(group[group_size // 2 :]))
        # Clip to [0, 1] to guard against tiny floating-point overshoot.
        ratio = float(np.clip(upper_norm / full_norm, 0.0, 1.0))
        alphas.append(2.0 * float(np.arcsin(ratio)))
    return alphas


def _apply_uniformly_controlled_ry(
    circuit: Circuit,
    alphas: list[float],
    target: int,
    controls: list[int],
) -> None:
    """Decompose a uniformly-controlled Ry into Ry rotations and CNOTs.

    Implements the Möttönen-Bergholm-Cybulski-Vartiainen decomposition: a
    2^k-angle uniformly-controlled Ry expands into 2^k Ry rotations
    interleaved with 2^k CNOTs whose control qubits follow gray-code
    differences.
    """
    k = len(controls)
    n_angles = len(alphas)
    assert n_angles == (1 << k), "alphas length must be 2^len(controls)"

    thetas = _mottonen_angle_transform(alphas)

    for i in range(n_angles):
        circuit.ry(target, thetas[i])
        next_i = (i + 1) % n_angles
        diff = _gray(i) ^ _gray(next_i)
        # diff is always a single set bit; locate its position (0 = LSB).
        control_bit = diff.bit_length() - 1
        # controls[0] is the MSB, controls[-1] is the LSB.
        control_qubit = controls[k - 1 - control_bit]
        circuit.cnot(control_qubit, target)


def _gray(n: int) -> int:
    """Return the ``n``-th Gray code."""
    return n ^ (n >> 1)


def _mottonen_angle_transform(alphas: list[float]) -> list[float]:
    """Apply the Möttönen M matrix to convert uniformly-controlled angles.

    Entries are ``M_ij = (1/N) * (-1)^<gray(i), bin(j)>`` where the exponent is
    the parity of the bitwise AND. The transform decorrelates the angles into
    the basis used by the Ry-CNOT decomposition.
    """
    n = len(alphas)
    thetas: list[float] = []
    for i in range(n):
        gi = _gray(i)
        s = 0.0
        for j in range(n):
            parity = bin(gi & j).count("1") & 1
            s += -alphas[j] if parity else alphas[j]
        thetas.append(s / n)
    return thetas
