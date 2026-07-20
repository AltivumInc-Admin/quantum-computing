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
| `.cnot(c, t)` `.cz(c, t)` `.swap(a, b)` `.cphaseshift(c, t, angle)` | Two-qubit gates. `cphaseshift` is the entangling primitive `lib/circuits/common.qft_circuit` is built from, and is verified against Braket exactly. |
| `.ccnot(c1, c2, t)` | Toffoli |
| `.add_circuit(other)` | Append another circuit's gates. `target_mapping` is a PARTIAL remap, as in Braket: listed qubits are remapped, unlisted qubits pass through at their original index. |
| `.adjoint()` | New circuit implementing the inverse U-dagger (reverse order + conjugate-transpose each gate). Mirrors Braket; powers compute-uncompute kernels. Gate labels are daggered with the matrices, so `.s(0).adjoint()` reports `operator.name == "Si"` and an inverted rotation renders `Rz(-0.40)` — matching Braket. |
| `.instructions` | List of applied `Instruction` objects. `.operator` is a Gate-like object whose `.name` matches Braket's capitalization (`H`, `CNot`, `Swap`, `CCNot`, `Rx`, `CPhaseShift` — **not** `CNOT`/`SWAP`). `.target` is the gate's qubit tuple in ORIGINAL labels. Supports `sum(1 for _ in circuit.instructions)`. The legacy `ins.operator == "CNOT"` idiom still counts (qcsim-only back-compat shim; real Braket returns `False`) — prefer `.operator.name == "CNot"`. |
| `.qubit_count` | Number of DISTINCT used qubits — Braket's compacted register width. `Circuit().h(0).cnot(0, 2)` is a 2-qubit circuit, not 3 (qubit indices stay 0 and 2). |
| `.depth` | Greedy DAG depth: the number of moments the gates pack into. Diffed against real Braket's `.depth` in the parity suite. |
| `str(circuit)` | Multi-line ASCII rendering, rows labelled with the original (used) qubit indices, **one column per moment** — so the diagram always shows exactly `.depth` columns, as Braket's does. Rotations render their axis (`Rx`/`Ry`/`Rz`). Braket additionally wraps very wide diagrams into stacked blocks with a `T : \| 0 \| 1 \|` moment header; qcsim keeps one plain-ASCII block, so on a wide circuit compare its total column count against the sum of Braket's blocks. |

All gate methods mutate the circuit in place AND return `self` for chaining.

Qubit indices must be integers (`int`, a numpy integer, or `bool`). A float —
which is what `n / 2` produces in Python 3 — raises `TypeError` with Braket's
wording, rather than silently building a different circuit than intended.

A gate-less `Circuit()` is refused on every path: `qubit_count` is `0`,
`.state_vector()` and `LocalSimulator.run()` both raise `ValueError`, and
`str()` is empty. Real Braket behaves the same way.

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
| `LocalSimulator(backend=None)` | Constructor. `backend` is validated against the names real Braket accepts (`default`, `braket_sv`, `braket_dm`, `braket_ahs`); anything else raises `ValueError` as it would on the real SDK. qcsim has exactly ONE engine — a noiseless state vector — so naming `braket_dm` (density matrix / noise) or `braket_ahs` (analog Hamiltonian) is accepted for call-site compatibility but emits a `RuntimeWarning`: the result you get back is a noiseless state-vector one regardless of the name. |
| `.run(circuit, shots: int)` | Returns a `Task`. Shots are drawn from a module-private `numpy.random.Generator`, so — exactly like real Braket — a run neither honours `np.random.seed()` nor advances the global legacy RNG stream. A seeded shot-noise demonstration therefore varies run to run in the browser just as it does locally. |

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

`tests/test_qcsim_parity.py` exercises 18 reference circuits — collectively
covering **every gate qcsim implements**, including descending qubit order to
pin multi-qubit axis ordering — and asserts that `qcsim` and real Braket produce
measurement distributions matching within 4-sigma at 1000 shots. State vectors
are compared **elementwise** (`atol=1e-12`), not by overlap magnitude: qcsim
matches Braket's phases exactly, and notebooks plot `np.angle(amplitude)` while
`web/src/lib/pyodide-grader.ts` grades on real and imaginary parts, so global
phase is not free to drift.

It also runs cross-SDK *object-shape* checks that diff `qcsim` against the
installed `amazon-braket-sdk` on `qubit_count`, bitstring width, instruction
`target` labels, `measured_qubits`, `depth`, every gate's `operator.name` (also
through `.adjoint()`), `target_mapping` pass-through, qubit-index type
validation, backend-name validation, and global-RNG independence — so a future
divergence from Braket fails CI rather than silently mis-teaching.

Gate coverage is *structural*, not hand-maintained: `qcsim.circuits._GATE_SPECS`
is the single registry every gate is defined in, and tests assert that the set
of public gate methods, the registry, the parity suite's all-gates circuit, and
`web/src/components/quantum/__fixtures__/gates.json` are the same set. A gate
added without registering it fails CI instead of failing open.
