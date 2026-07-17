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
| `.instructions` | List of applied `Instruction` objects. `.operator` is a Gate-like object whose `.name` matches Braket's capitalization (`H`, `CNot`, `Swap`, `CCNot`, `Rx`, `CPhaseShift` — **not** `CNOT`/`SWAP`). `.target` is the gate's qubit tuple in ORIGINAL labels. Supports `sum(1 for _ in circuit.instructions)`. The legacy `ins.operator == "CNOT"` idiom still counts (qcsim-only back-compat shim; real Braket returns `False`) — prefer `.operator.name == "CNot"`. |
| `.qubit_count` | Number of DISTINCT used qubits — Braket's compacted register width. `Circuit().h(0).cnot(0, 2)` is a 2-qubit circuit, not 3 (qubit indices stay 0 and 2). |
| `.depth` | Greedy DAG depth: the longest gate chain on any single qubit. |
| `str(circuit)` | Multi-line ASCII rendering, rows labelled with the original (used) qubit indices. |

All gate methods mutate the circuit in place AND return `self` for chaining.

### `Circuit.state_vector()` — DIVERGES from the real SDK

qcsim's `.state_vector()` computes the final amplitudes and returns a
`numpy.ndarray`. The real SDK's `Circuit.state_vector()` does something
entirely different: it registers a `StateVector` **result type** on the
circuit and returns the *circuit* (for chaining) — the amplitudes only
exist on a device result, via `device.run(circuit, shots=0).result().values[0]`.
So `sv = circuit.state_vector()` works in the browser but raises `TypeError`
under the documented local path (`make setup` installs the real SDK) the
moment `sv` is used as an array.

Curriculum notebooks must NOT call `.state_vector()` directly —
`scripts/validate_runnable.py` rejects it in browser-runnable notebooks
(`DIVERGENT_CALL_ATTRS`) — and use the portable helper instead, which
branches on the engine and returns the amplitudes as a complex ndarray
under both:

```python
from lib.utils.statevector import statevector

sv = statevector(circuit)   # numpy.ndarray under qcsim AND the real SDK
```

qcsim's method remains the browser-side workhorse: the helper delegates to
it, and `web/src/lib/pyodide-grader.ts` calls it directly (Pyodide-only
code, never executed under the real SDK).

### `braket.devices.LocalSimulator`

| Method | Notes |
|--------|-------|
| `LocalSimulator()` | Constructor |
| `.run(circuit, shots: int)` | Returns a `Task` |

### Result objects

| Attribute | Notes |
|-----------|-------|
| `result.measurement_counts` | `collections.Counter` of bitstring → count. Bitstring width is the compacted `qubit_count`. |
| `result.measurements` | `numpy.ndarray` of shape `(shots, n_qubits)`, dtype `int8`. Bit 0 leftmost in row. |
| `result.measurement_probabilities` | `dict[str, float]` — empirical probabilities |
| `result.measured_qubits` | `list[int]` — the qubits each measurement column corresponds to, in ORIGINAL labels (e.g. `[0, 2]` for `h(0).cnot(0, 2)`). Matches Braket; lets `lib/utils/results.parse_counts` validate its positional bitstring assumption. |

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
It also runs cross-SDK *object-shape* checks that diff `qcsim` against the
installed `amazon-braket-sdk` on `qubit_count`, bitstring width, instruction
`target` labels, `measured_qubits`, and every gate's `operator.name`, so a
future divergence from Braket fails CI rather than silently mis-teaching.
