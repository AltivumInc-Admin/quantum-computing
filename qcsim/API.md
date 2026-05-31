# qcsim API Surface

`qcsim` is a pure-NumPy state-vector simulator that mirrors the subset of
the `amazon-braket-sdk` API the curriculum's notebooks actually use. It
exists so the curriculum notebooks can run unmodified inside a Pyodide
kernel where `amazon-braket-sdk` is not installable.

## Aliasing strategy

`qcsim/__init__.py` registers itself in `sys.modules` as:
- `braket`
- `braket.circuits`
- `braket.devices`

so that notebook code written as `from braket.circuits import Circuit`
works without any rewrite. The aliasing is a no-op if real Braket is
already imported.

## Surface coverage

### `braket.circuits.Circuit`

| Method / attribute | Notes |
|--------------------|-------|
| `Circuit()` | Empty circuit constructor |
| `.h(q)` `.x(q)` `.y(q)` `.z(q)` `.s(q)` `.t(q)` `.i(q)` | Single-qubit Cliffords + identity |
| `.rx(q, theta)` `.ry(q, theta)` `.rz(q, theta)` | Single-qubit rotations |
| `.cnot(c, t)` `.cz(c, t)` `.swap(a, b)` | Two-qubit gates |
| `.ccnot(c1, c2, t)` | Toffoli |
| `.add_circuit(other)` | Append another circuit's gates (optional `target_mapping` remap) |
| `.adjoint()` | New circuit implementing the inverse U-dagger (reverse order + conjugate-transpose each gate). Mirrors Braket; powers compute-uncompute kernels |
| `.instructions` | List of applied `Instruction` objects (`.operator` label, `.target` qubit tuple). Supports `sum(1 for _ in circuit.instructions)` |
| `.qubit_count` | Highest target qubit + 1 |
| `.depth` | Length of the gate list (informational) |
| `str(circuit)` | Multi-line ASCII rendering |

All gate methods mutate the circuit in place AND return `self` for chaining.

### `braket.devices.LocalSimulator`

| Method | Notes |
|--------|-------|
| `LocalSimulator()` | Constructor |
| `.run(circuit, shots: int)` | Returns a `Task` |

### Result objects

| Attribute | Notes |
|-----------|-------|
| `result.measurement_counts` | `collections.Counter` of bitstring → count |
| `result.measurements` | `numpy.ndarray` of shape `(shots, n_qubits)`, dtype `int8`. Bit 0 leftmost in row. |
| `result.measurement_probabilities` | `dict[str, float]` — empirical probabilities |

## What is intentionally NOT covered

- Hardware: `braket.aws.AwsDevice`, IonQ/IQM/Rigetti device URIs.
- Observables / expectation values via `.expectation()` (notebooks compute these manually from counts).
- Noise channels, mid-circuit measurement, classical control flow.
- Anything that requires a managed simulator (SV1/DM1/TN1).

Notebooks that import `braket.aws` MUST NOT be marked
`<!-- browser-runnable -->`.

## Parity guarantee

`tests/test_qcsim_parity.py` exercises 10 reference circuits and asserts
that `qcsim` and real Braket produce measurement distributions matching
within 4-sigma at 1000 shots, plus exact equality on deterministic states.
