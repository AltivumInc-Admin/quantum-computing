# Implementation Plans — quantum.altivum.ai eval recommendations
Generated from `/eval` → `/plan`. 9 recommendations: 3 top + 4 quick-wins + 2 leads (verify first).
Each plan was authored by an agent that read the actual implicated files.

---

# Plan 1: Harden the qsim DSL grader parser against negative/garbage indices
**Complexity:** Low · **Time:** 1.5-2.5 hours · **Files affected:** 3 · **Depends on:** none · **Parallelizable:** True

## Objective

Today the shared `qsim` DSL parser (`web/src/components/quantum/qsim-dsl.ts`) reads qubit indices with bare `parseInt(tok, 10)` guarded only by `Number.isNaN`, so `H -1` parses to a clean program (then `simulate()` throws an uncaught "Cannot read properties of undefined" — the learner's **Check** button silently dies with no message), and `H 0abc` / `H 2x` silently build the *wrong* circuit (`parseInt('0abc',10)===0`). Angles use `parseFloat`, so `RY 0 1.5xyz` silently truncates to `1.5`. After this change, `parseProgram` validates every index token with a strict integer parser (`/^\d+$/` then `Number(...)`, rejecting NaN / negative / sign-prefixed / trailing-garbage) and every literal angle with a strict float parser, routing all failures into the existing `ParseResult.error` channel — so the friendly error card renders instead of an exception, and every `simulate()`/`opsFor()` consumer (grader, circuit-lab, scrubber, shots-sampler, noise-visualizer, correlation-demo) is repaired by fixing the single source.

## Prerequisites

- Node + the `web/` workspace installed (`cd web && npm ci`); tests run via `npm test` (jest + ts-jest).
- Familiarity with the repo widget convention: pure `.ts` logic module + thin `.tsx` view + a jest test mirrored under `web/__tests__/`. The change here is **logic-only** — no `.tsx` edits.
- Knowledge that `web/src/components/quantum/parse-utils.ts` is the single-source home for parse/clamp helpers (reuse/extend, don't duplicate).
- No AWS, no notebook, no Python changes; the Python CI job and build-smoke are unaffected (web-only logic change, no new files in `web/public/lab` or `jupyterlite-build`).
- Assumption (verified by reading the code): the learner path is fully clamped to `[0, MAX_QUBITS-1]` only *after* a successful parse via the post-loop `n > MAX_QUBITS` guard; there is no per-token lower-bound/garbage guard today.

## Step-by-Step Implementation

### 1. Add two strict token parsers to `parse-utils.ts` (decision A — recommended)

These are pure functions returning a discriminated result so callers can route the message into an existing error channel.

1.1 Open `web/src/components/quantum/parse-utils.ts` and append:

```ts
/**
 * Parse a whitespace-DSL token as a non-negative integer index. Unlike
 * parseInt, this rejects signs, decimals, and trailing garbage: parseInt('-1')
 * is -1 and parseInt('0abc') is 0, both of which would silently build a wrong
 * (or crash-on-simulate) circuit. Leading zeros are accepted ('03' -> 3).
 */
export function parseIndex(
  tok: string | undefined
): { ok: true; value: number } | { ok: false } {
  if (tok === undefined || !/^\d+$/.test(tok)) return { ok: false };
  return { ok: true, value: Number(tok) };
}

/**
 * Parse a whitespace-DSL token as a finite float angle (radians). Rejects
 * trailing garbage that parseFloat would silently truncate ('1.5xyz' -> 1.5).
 */
export function parseAngle(
  tok: string | undefined
): { ok: true; value: number } | { ok: false } {
  if (tok === undefined || tok === "") return { ok: false };
  const v = Number(tok); // Number('1.5xyz') === NaN, Number('1e-3') === 0.001
  if (!Number.isFinite(v)) return { ok: false };
  return { ok: true, value: v };
}
```

Notes on edge cases handled by the above:
- `Number('-1')` is `-1` but `/^\d+$/` rejects the `-`, so negatives fail.
- `Number('0abc')` is `NaN`; even so `/^\d+$/` already rejects it.
- `Number('')`/`undefined` -> rejected (covers a missing operand, e.g. bare `H`).
- `Number('1.5xyz')` is `NaN` -> `parseAngle` rejects (vs. `parseFloat` truncating to 1.5).
- `Number('1e-3')` is `0.001` and `Number('-1.57')` is `-1.57` — both finite, so negative *angles* are correctly allowed (rotations may be negative); only **indices** must be non-negative.
- `Number(' 3 ')` would be `3`, but tokens are already produced by `line.split(/\s+/)` so they carry no internal whitespace.

### 2. Wire the strict parsers into `parseProgram`

Open `web/src/components/quantum/qsim-dsl.ts`.

2.1 Extend the import on line 15 region to pull in the new helpers:

```ts
import { type Op, NAMED_GATES } from "./math";
import { parseIndex, parseAngle } from "./parse-utils";
```

2.2 Replace the `qubits` directive handling (currently lines 55-58). `parseInt(parts[1], 10)` here also silently accepts garbage:

```ts
if (head === "qubits") {
  const got = parseIndex(parts[1]);
  if (!got.ok) throw new Error(`qubits directive needs a non-negative count`);
  n = Math.max(n, got.value);
  continue;
}
```

2.3 Replace the `CNOT` branch (currently lines 62-68):

```ts
if (gate === "CNOT") {
  const c = parseIndex(parts[1]);
  const t = parseIndex(parts[2]);
  if (!c.ok || !t.ok)
    throw new Error("CNOT needs a control and a target qubit");
  const control = c.value;
  const target = t.value;
  gates.push({ gate, target, control });
  n = Math.max(n, control + 1, target + 1);
}
```

2.4 Replace the `ROT` branch (currently lines 69-82):

```ts
} else if (ROT.has(gate)) {
  const t = parseIndex(parts[1]);
  const tok = (parts[2] ?? "").toLowerCase();
  if (!t.ok || tok === "")
    throw new Error(`${gate} needs a target qubit and an angle`);
  const target = t.value;
  if (tok === "theta") {
    hasTheta = true;
    gates.push({ gate, target, bound: true });
  } else {
    const angle = parseAngle(parts[2]); // use the original-case token
    if (!angle.ok) throw new Error(`${gate}: bad angle "${parts[2]}"`);
    gates.push({ gate, target, theta: angle.value });
  }
  n = Math.max(n, target + 1);
}
```

(Pass `parts[2]` — not the lowercased `tok` — to `parseAngle` so the error message preserves the user's exact text; `Number` is case-insensitive for `e`/`E` notation either way.)

2.5 Replace the `SINGLE` branch (currently lines 83-87):

```ts
} else if (SINGLE.has(gate)) {
  const t = parseIndex(parts[1]);
  if (!t.ok) throw new Error(`${gate} needs a target qubit`);
  const target = t.value;
  gates.push({ gate, target });
  n = Math.max(n, target + 1);
}
```

2.6 Leave the existing post-loop guards intact (lines 93-95): `if (n < 1) n = 1;` and `if (n > MAX_QUBITS) throw ...`. Do **not** add a per-token upper-bound check — the width guard already produces the friendly MAX_QUBITS message and the `try/catch` at lines 96-98 already funnels every `throw` into `{ error }`. The decision to not clamp upper-bound per token avoids duplicating the MAX_QUBITS message.

2.7 Confirm no behavioral regression for the happy path: valid `H 0`, `CNOT 0 1`, `RY 0 theta`, `RX 0 1.5708`, `qubits 3` all still parse — `parseIndex('0')`/`('1')`/`('3')` succeed and `parseAngle('1.5708')` returns `1.5708`.

### 3. (No view changes needed)

The grader path already surfaces `ParseResult.error`: `gradeTs` (`web/src/lib/challenge-grade.ts:17-19`) returns `{ status: "error", message: \`Your circuit: ${learner.error}\` }`, and `challenge.tsx` renders that via the `error` verdict style (lines 52-59, 168-175). Because the parser now sets `.error` for negative/garbage indices, the previously-uncaught `simulate()` throw at `challenge-grade.ts:58` becomes unreachable for learner input. No `try/catch` needs to be added around `simulate` — fixing the source is sufficient and is the minimal, correct change. The other consumers (`circuit-lab.tsx`, `wavefunction-scrubber.tsx`, `shots-sampler.tsx`, `noise-visualizer.tsx`, `correlation-demo.tsx`) all read `program.gates`/`program.n` only after parsing and are likewise protected (their sources are author-set, but they inherit the same hardening for free).

### 4. Run the suite

4.1 `cd web && npm test -- qsim-dsl challenge-grade` to run the two affected suites fast, then `npm test` for the full 472-test run.
4.2 `npm run lint` to confirm ESLint is clean (no unused imports; the discriminated-union returns satisfy `@typescript-eslint`).

## File & Code Changes

| Action | File Path | Description of Change |
| --- | --- | --- |
| Modify | `web/src/components/quantum/parse-utils.ts` | Append two pure helpers: `parseIndex(tok)` (`/^\d+$/` then `Number` — rejects NaN/negative/sign/trailing-garbage; accepts leading zeros) and `parseAngle(tok)` (`Number` + `Number.isFinite` — rejects `'1.5xyz'`, allows negative/exponent radians). Both return `{ ok: true; value } | { ok: false }`. |
| Modify | `web/src/components/quantum/qsim-dsl.ts` | Import `parseIndex`/`parseAngle`. Replace the four bare `parseInt(...,10)` index sites (`qubits`, CNOT control+target, ROT target, SINGLE target) and the one `parseFloat` angle site with the strict parsers; throw a typed message on failure (caught by the existing `try/catch` into `ParseResult.error`). No happy-path behavior change. |
| Modify | `web/__tests__/components/quantum/qsim-dsl.test.ts` | Add negative/garbage/malformed cases (see Testing). |
| Modify | `web/__tests__/lib/challenge-grade.test.ts` | Add a regression test that a learner circuit with a negative/garbage index grades as `status: "error"` (friendly message) rather than throwing. |

No files are created or deleted. No `.tsx`, notebook, Python, or infra files change.

## Testing & Validation

**Unit tests — `web/__tests__/components/quantum/qsim-dsl.test.ts`** (the existing file has ZERO negative/garbage cases). Add:
- `rejects a negative qubit index` — `expect(parseProgram("H -1").error).toMatch(/target qubit/i)` and assert `gates` is empty (`parseProgram("H -1").gates).toHaveLength(0)`).
- `rejects a garbage qubit index that parseInt would silently truncate` — `parseProgram("H 0abc").error` is defined; assert it does NOT silently produce `{ gate: "H", target: 0 }`.
- `rejects a trailing-garbage index on CNOT` — `parseProgram("CNOT 0 1x").error` defined; also `parseProgram("CNOT -1 0").error` defined.
- `rejects a garbage angle that parseFloat would truncate` — `parseProgram("RY 0 1.5xyz").error` matches `/bad angle/i` (previously truncated to 1.5).
- `still accepts a valid negative angle` — `parseProgram("RX 0 -1.5708")` has no error and `gates[0].theta` is `≈ -1.5708` (guards against over-rejecting rotations).
- `still accepts leading-zero indices` — `parseProgram("H 03").error` is undefined and `gates[0].target === 3` (documents the accepted edge case).
- `rejects a bad qubits directive` — `parseProgram("qubits x\nH 0").error` is defined.

**Unit tests — `web/__tests__/lib/challenge-grade.test.ts`** (mirrors the existing "reports a parse error in the learner's circuit" test at line 36):
- `surfaces a friendly error for a negative qubit index instead of throwing` — `const r = gradeTs("H -1", bell); expect(r.status).toBe("error"); expect(() => gradeTs("H -1", bell)).not.toThrow();` (this is the load-bearing regression — before the fix, `gradeTs("H -1", bell)` throws "Cannot read properties of undefined").
- `surfaces a friendly error for a garbage index` — `gradeTs("H 0abc", bell).status` is `"error"`.

**Manual verification (real path, not just mocks):**
1. `cd web && npm run dev`, open a lesson page containing a `qchallenge` block (e.g. the Bell-state challenge).
2. Type `H -1` into the challenge textarea, click **Check** → expect the gray "error" card reading `Your circuit: H needs a target qubit` (NOT a frozen button / console exception). Open devtools console to confirm zero uncaught errors.
3. Type `H 0abc` → expect an error card, not a silently-accepted (and wrong-graded) circuit.
4. Type `RY 0 1.5xyz` in a rotation challenge → expect `RY: bad angle "1.5xyz"`.
5. Sanity: type the real solution `H 0` then `CNOT 0 1` → expect the green "Solved" card (happy path unbroken).

**End-to-end confirmation:** `npm run build` (static export, 12 pages) must succeed; the Playwright Pyodide build-smoke is unaffected (no notebook/runtime change), and `git diff --exit-code web/jupyterlite-build/jupyter_lite_config.json` stays clean.

**Rollback verification:** the change is three additive helpers + in-place swaps; `git revert` of the commit restores the exact prior `parseInt`/`parseFloat` behavior. Re-running `npm test` after a revert should show the new negative/garbage tests fail (proving they actually exercise the fix) and all original tests pass.

## Risk & Mitigation

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Over-rejecting a previously-valid input (e.g. a negative rotation angle) and breaking an existing notebook/challenge | Low | Medium | `parseAngle` allows negative/exponent floats (only **indices** are non-negative); added an explicit `RX 0 -1.5708` test. Grep canonical content for existing DSL programs before merge to confirm none rely on garbage-truncation. |
| Leading-zero index policy surprises an author (`03` -> 3) | Low | Low | Documented in code comment + a dedicated test asserting acceptance; behavior is unambiguous. |
| Putting helpers in parse-utils.ts conflicts with another in-flight rec touching that file | Low | Low | parse-utils.ts is purely additive here (two new exports, no edits to existing ones); merge is trivial. If a conflict arises, the helpers can instead live local to qsim-dsl.ts with no semantic change (decision B). |
| Error message wording differs from learner expectation | Low | Low | Reuse the parser's existing message phrasing (`needs a target qubit`, `bad angle "..."`) so the friendly card matches the established voice; assert via regex in tests. |
| A consumer relied on the crash being swallowed elsewhere | Very Low | Low | Confirmed by grep: only `circuit-lab.tsx` wraps `simulate` in try/catch; all others read post-parse fields and are strictly improved by valid-only programs. |

## Estimated Effort

- **Complexity:** Low (logic-only, single source of truth, no UI/async/AWS).
- **Time:** 1.5-2.5 hours including writing the new unit tests and manual browser verification.
- **Files affected:** 3 source/test files modified (`parse-utils.ts`, `qsim-dsl.ts`) + 2 test files (`qsim-dsl.test.ts`, `challenge-grade.test.ts`) — 4 modifications total, 0 created, 0 deleted. (Counted as 3 "affected" code areas: the parser source, the helper module, and the grader/test surface.)

## Decision Points
1. Where to host the strict parse helpers: (A) add strictIndex/strictAngle to the existing web/src/components/quantum/parse-utils.ts, or (B) keep them local to qsim-dsl.ts. Recommended: A — parse-utils.ts is the project's single-source for parse/clamp helpers and the convention is to reuse/extend rather than duplicate. The one wrinkle is that today parse-utils.ts deals only with JSON-config widgets (qparam/qjob/qcheckpoint) while qsim-dsl.ts parses whitespace-token DSL; adding token->int/float validators is a natural extension, not a category mismatch.
2. Whether to reject leading-zero indices like '00' / '03'. Recommended: ACCEPT them (/^\d+$/ already matches; Number('03')=3). They are unambiguous and harmless; rejecting them would be surprising pedantically. Document the choice in a code comment.
3. Whether to also clamp index <= MAX_QUBITS-1 inside the strict parser, or leave the existing post-loop 'n > MAX_QUBITS' check as the sole width guard. Recommended: leave the width guard where it is (don't duplicate it); the strict parser's job is only NaN/negative/garbage, and the existing check already produces a friendly MAX_QUBITS message.

---

# Plan 2: Close qcsim<->Braket teaching-fidelity gaps and make the contract test them
**Complexity:** High · **Time:** 1.5-2.5 days · **Files affected:** 9 · **Depends on:** none · **Parallelizable:** False

## Objective

Today `qcsim` (the pure-NumPy Braket stand-in that powers every browser-runnable notebook) silently diverges from the real `amazon-braket-sdk` it impersonates, mis-teaching two idioms in shipped notebooks, and the contract validator models nothing about object *shape* so the drift is invisible. After this change qcsim **compacts the set of used qubits** exactly like Braket (so `Circuit().h(0).cnot(0,2)` reports `qubit_count==2` and emits length-2 bitstrings), its result object exposes `measured_qubits` (so the `lib/utils/results.py` guard actually runs under qcsim instead of being skipped), and `Instruction.operator` becomes a small Gate-like object whose `.name` matches Braket's (`CNot`, not `CNOT`) while staying backward-compatible with the existing `== "CNOT"` counting idiom. New **cross-SDK parity tests** assert qcsim and real Braket agree on `qubit_count`, bitstring length, `measured_qubits`, operator `.name`/`str()`, and target shape, so any future divergence fails CI. This solves the core risk that students learn idioms in the browser that break verbatim on real hardware.

## Prerequisites

- Local dev env with `make setup` run: installs `amazon-braket-sdk>=1.80` (base `dependencies` in `pyproject.toml`) **and** `pip install -e ./qcsim`. The parity suite imports real Braket at module top-level (no `importorskip`), so braket MUST be importable for `tests/test_qcsim_parity.py` to run — confirmed it is installed by `make setup`.
- `[dev]` extra for `nbclient`/`ipykernel`/`ipywidgets` (the slow notebook-contract execution test); `[full]` extra is NOT needed for braket itself (braket is a base dependency).
- Knowledge: Braket's measurement convention (qubit 0 = MSB/leftmost, matching qcsim's existing big-endian convention — see `qcsim/src/qcsim/circuits.py` lines 1-7), and that Braket **compacts** used qubits so non-contiguous indices collapse to a contiguous measured range.
- Tooling: `ruff` (line-length 100, target py310), `pytest`, the `NotebookEdit` tool or careful JSON edits for `.ipynb` cells (nbstripout is configured — see `.gitattributes`).
- CI gates that must stay green: python job (`make test` + `make lint` + `python scripts/validate_runnable.py --check`), web job, build-smoke (includes `git diff --exit-code web/jupyterlite-build/jupyter_lite_config.json`).

## Step-by-Step Implementation

### 1. Compact used qubits in `qcsim/src/qcsim/circuits.py`

The current `Circuit` tracks only `self._max_qubit` and reports `qubit_count == max_qubit + 1` (lines 147, 279-280), padding unused low/high qubits. Braket instead **maps the set of distinct used qubit indices to a contiguous 0..k-1 range** for output. Implement a compaction layer that leaves the authoring API (`.cnot(0, 2)` etc.) and state-vector math unchanged but makes `qubit_count`, the simulated width, and the rendered/measured qubits reflect the *compacted* set.

**1.1** Add a helper that returns the sorted distinct used qubit indices and the index→position map:

```python
def _used_qubits(self) -> list[int]:
    """Distinct qubit indices touched by any gate, ascending. Braket compacts
    these to a contiguous 0..k-1 range for measurement/output."""
    seen: set[int] = set()
    for _name, _gate, qubits in self._gates:
        seen.update(qubits)
    return sorted(seen)

def _compaction_map(self) -> dict[int, int]:
    """Map each used qubit index to its position in the compacted register."""
    return {q: i for i, q in enumerate(self._used_qubits())}
```

**1.2** Change `qubit_count` (lines 278-280) to return the count of *used* qubits, not `max_qubit + 1`:

```python
@property
def qubit_count(self) -> int:
    return len(self._used_qubits())
```

Edge case: an empty circuit returns `0` (unchanged); `state_vector()` already guards with `n = max(self.qubit_count, 1)` (line 299) so a 0-qubit circuit still returns the 1-element `|0>` vector — preserve that.

**1.3** Make `state_vector()` (lines 297-311) operate on the **compacted** width and remap each gate's qubit tuple through `_compaction_map()` before applying. This keeps `Circuit().h(0).cnot(0,2)` a 2-qubit state vector `(|00>+|11>)/sqrt2` rather than a 3-qubit padded one:

```python
def state_vector(self) -> np.ndarray:
    cmap = self._compaction_map()
    n = max(len(cmap), 1)
    state = np.zeros(2**n, dtype=np.complex128)
    state[0] = 1.0
    for _name, gate, qubits in self._gates:
        mapped = tuple(cmap[q] for q in qubits)
        if len(mapped) == 1:
            state = _apply_single(state, gate, mapped[0], n)
        elif len(mapped) == 2:
            state = _apply_two(state, gate, mapped[0], mapped[1], n)
        elif len(mapped) == 3:
            state = _apply_three(state, gate, mapped[0], mapped[1], mapped[2], n)
        else:
            raise NotImplementedError(f"gate on {len(mapped)} qubits is not supported")
    return state
```

**1.4** `depth` (lines 282-293) is computed per-original-qubit-index and is invariant under compaction (it is a max over per-qubit chains) — leave it unchanged. `__str__` (lines 315-350) currently iterates `range(self.qubit_count)` and indexes `col[qubits[0]]` with the *original* index, which now breaks if originals exceed the compacted count. Make `__str__` render the compacted register: build `col` of length `qubit_count`, and index it via `cmap[q]`:

```python
def __str__(self) -> str:
    cmap = self._compaction_map()
    n = self.qubit_count
    if n == 0:
        return "q0 : -"
    rows = ["" for _ in range(n)]
    if not self._gates:
        for q in range(n):
            rows[q] = f"q{q} : -"
        return "\n".join(rows)
    for name, _gate, qubits in self._gates:
        col = [" - " for _ in range(n)]
        m = [cmap[q] for q in qubits]
        if len(m) == 1:
            col[m[0]] = f" {name[0]} "
        elif name == "CNOT":
            col[m[0]] = " C "; col[m[1]] = " X "
        elif name == "CZ":
            col[m[0]] = " C "; col[m[1]] = " Z "
        elif name == "SWAP":
            col[m[0]] = " S "; col[m[1]] = " W "
        elif name.startswith("CP("):
            col[m[0]] = " C "; col[m[1]] = " P "
        elif name == "CCNOT":
            col[m[0]] = " C "; col[m[1]] = " C "; col[m[2]] = " X "
        for q in range(n):
            rows[q] += col[q]
    out = [f"q{q} :" + rows[q] for q in range(n)]
    return "\n".join(out)
```

(Note: the row labels now read `q0..q{k-1}` as compacted positions, matching Braket's compacted output; this is the intended teaching fidelity.)

**1.5** `adjoint()` (lines 250-269) copies `self._max_qubit`; keep that field for back-compat but it is no longer authoritative for `qubit_count`. It is still cheap bookkeeping. No change required, but verify `adjoint()._used_qubits()` equals the original's (it reuses the same qubit tuples), which it does.

### 2. Make `Instruction.operator` a Gate-like object (Decision Point #1, recommended approach A)

Real Braket: `ins.operator` is a `Gate` object with `.name == "CNot"` (note capitalization differs from qcsim's `"CNOT"`); `str(operator)` renders the gate. Today qcsim's `operator` is a plain `str` label and `target` is a `tuple[int]` (lines 118-133, 274-276), so `sum(1 for ins in circ.instructions if ins.operator == "CNOT")` returns 2 under qcsim but 0 on real Braket (real name is `CNot`).

**2.1** Replace the `Instruction` class (lines 118-133) with a Gate-like operator. Introduce a small `_Gate` whose `.name` matches Braket's canonical capitalization, whose `__str__`/`__repr__` render usefully, and whose `__eq__` accepts BOTH the Braket name and a string for back-compat with the existing curriculum idiom:

```python
# Map qcsim internal labels -> Braket Gate.name capitalization.
_BRAKET_GATE_NAMES = {
    "H": "H", "X": "X", "Y": "Y", "Z": "Z", "S": "S", "T": "T", "I": "I",
    "CNOT": "CNot", "CZ": "CZ", "SWAP": "Swap", "CCNOT": "CCNot",
    # parameterized labels start with a prefix; handled below
}

def _braket_name(label: str) -> str:
    if label.startswith("Rx("): return "Rx"
    if label.startswith("Ry("): return "Ry"
    if label.startswith("Rz("): return "Rz"
    if label.startswith("CP("): return "CPhaseShift"
    return _BRAKET_GATE_NAMES.get(label, label)


class _Operator:
    """Gate-like stand-in for a ``braket.circuits.Gate``. ``.name`` matches
    Braket's capitalization (e.g. 'CNot'); equality also accepts qcsim's legacy
    label so the curriculum's ``ins.operator == 'CNOT'`` idiom keeps working."""

    __slots__ = ("name", "_label")

    def __init__(self, label: str) -> None:
        self._label = label
        self.name = _braket_name(label)

    def __eq__(self, other: object) -> bool:
        if isinstance(other, _Operator):
            return self.name == other.name
        if isinstance(other, str):
            # Accept Braket name ('CNot'), the legacy qcsim label ('CNOT'),
            # and a case-insensitive match so both idioms teach correctly.
            return other in (self.name, self._label) or other.lower() == self.name.lower()
        return NotImplemented

    def __hash__(self) -> int:
        return hash(self.name)

    def __str__(self) -> str:
        return self.name

    def __repr__(self) -> str:
        return f"{self.name}"
```

> Decision note: equality accepting the legacy `"CNOT"` string is a deliberate compatibility shim so the shipped notebooks do not break the instant qcsim updates. The notebooks are ALSO rewritten in Step 5 to use the correct `.name == "CNot"` form so the browser teaches the real idiom; the shim covers any third-party/learner code still using the old string.

**2.2** Update `Instruction` to carry the operator object (keep `target` as a tuple of ints — see 2.3 for the Braket-shape caveat):

```python
class Instruction:
    __slots__ = ("operator", "target")

    def __init__(self, operator: "_Operator", target: tuple[int, ...]) -> None:
        self.operator = operator
        self.target = target

    def __repr__(self) -> str:
        return f"Instruction(operator={self.operator!r}, target={self.target})"
```

**2.3** Update the `instructions` property (lines 273-276) to emit compacted targets wrapped in `_Operator`. Braket's `ins.target` is a `QubitSet` of `Qubit` (each `int(qubit)` works); a tuple of ints is the closest faithful stand-in that still supports `ins.target[0]` indexing. Compact the targets so they match the measured register:

```python
@property
def instructions(self) -> list[Instruction]:
    cmap = self._compaction_map()
    return [
        Instruction(_Operator(name), tuple(cmap[q] for q in qubits))
        for name, _gate, qubits in self._gates
    ]
```

Update `__all__` (line 356) to `["Circuit", "Instruction"]` (unchanged) — `_Operator` stays private.

### 3. Set `measured_qubits` on the result in `qcsim/src/qcsim/devices.py`

`lib/utils/results.py:parse_counts` (lines 14-24) raises if `result.measured_qubits != range(n)` — but `_Result` (lines 14-28) never sets `measured_qubits`, so `getattr(result, "measured_qubits", None)` returns `None` and the guard is silently skipped under qcsim. After compaction the measured qubits ARE the contiguous range, so set it and let the guard run (and pass):

**3.1** Pass the measured-qubit list into `_Result` from `LocalSimulator.run`. In `run` (lines 48-72), after `n = max(circuit.qubit_count, 1)`, the compacted register is `list(range(circuit.qubit_count))` (or `[0]` for the empty-circuit `n>=1` floor). Add:

```python
class _Result:
    def __init__(self, measurements: np.ndarray, measured_qubits: list[int]) -> None:
        self.measurements = measurements
        self.measured_qubits = measured_qubits
    # ... measurement_counts / measurement_probabilities unchanged ...
```

and in `run`:

```python
        measured_qubits = list(range(circuit.qubit_count)) or [0]
        return _Task(_Result(measurements, measured_qubits))
```

Edge case: empty circuit -> `qubit_count == 0` so `circuit.state_vector()` returns the 1-element vector and `n == 1`; `list(range(0)) or [0]` yields `[0]`, matching the single measured column. Keep the `measurements` width `n` consistent with `len(measured_qubits)` (both 1).

**3.2** Document `measured_qubits` in `qcsim/API.md` Result table.

### 4. Cross-SDK parity tests in `tests/test_qcsim_parity.py`

The existing file (lines 227-241) asserts only the qcsim shape and never cross-checks the real SDK on instruction/qubit-count semantics. Add tests that diff qcsim against real Braket for the gaps fixed above. Braket is imported at the top of this file already (lines 12-13).

**4.1** Add a non-contiguous-qubit parity test:

```python
def test_noncontiguous_qubits_compact_like_braket():
    """h(0).cnot(0,2) -> Braket compacts to 2 qubits; qcsim must match."""
    q = QCircuit().h(0).cnot(0, 2)
    b = BraketCircuit().h(0).cnot(0, 2)
    assert q.qubit_count == b.qubit_count == 2
    qr = QSimulator().run(q, shots=2000).result()
    br = BraketSimulator().run(b, shots=2000).result()
    # bitstrings are length-2 and support {'00','11'}
    assert {len(k) for k in qr.measurement_counts} == {2}
    assert set(qr.measurement_counts) == set(br.measurement_counts) == {"00", "11"}
```

**4.2** Add a `measured_qubits` test (covers the previously-skipped `parse_counts` guard):

```python
def test_measured_qubits_set_and_contiguous():
    from lib.utils.results import parse_counts
    qr = QSimulator().run(QCircuit().h(0).cnot(0, 2), shots=100).result()
    assert list(qr.measured_qubits) == [0, 1]
    # parse_counts guard must now actually run AND pass (was silently skipped).
    counts = parse_counts(qr)
    assert all(len(k) == 2 for k in counts)
```

**4.3** Add an operator-shape parity test diffing `.name` against real Braket:

```python
def test_instruction_operator_name_matches_braket():
    q = QCircuit().h(0).cnot(0, 1).ry(1, 0.3)
    b = BraketCircuit().h(0).cnot(0, 1).ry(1, 0.3)
    q_names = [ins.operator.name for ins in q.instructions]
    b_names = [ins.operator.name for ins in b.instructions]
    assert q_names == b_names  # e.g. ['H', 'CNot', 'Ry']
    # Braket's CNOT name is 'CNot', NOT 'CNOT'.
    assert "CNot" in q_names and "CNOT" not in q_names
    # The curriculum counting idiom must agree across SDKs.
    assert (sum(1 for i in q.instructions if i.operator.name == "CNot")
            == sum(1 for i in b.instructions if i.operator.name == "CNot") == 1)
```

**4.4** Add a back-compat test for the legacy string equality shim (so we know the shim works and is intentional):

```python
def test_operator_legacy_string_equality_still_counts():
    q = QCircuit().h(0).cnot(0, 1)
    # legacy idiom kept working via _Operator.__eq__ shim
    assert sum(1 for i in q.instructions if i.operator == "CNOT") == 1
    assert sum(1 for i in q.instructions if i.operator == "CNot") == 1
```

**4.5** Update the existing `test_instructions_iterable_and_counts` (lines 227-233) and `test_qubit_count_and_depth` (lines 236-240): they remain valid (contiguous targets), but change `c.instructions[0].target == (0,)` assertions to also assert `c.instructions[1].operator.name == "CNot"` so the file documents the new shape. Keep the `.target == (0, 1)` assertions (compacted == original for contiguous circuits).

### 5. Fix the offending notebook cells (use `NotebookEdit`)

Three cells across two manifest-listed runnable notebooks use the wrong idiom. After Step 2's `__eq__` shim they will STILL execute correctly, but the browser must teach the real Braket idiom (`.operator.name == "CNot"`), so rewrite them.

**5.1** `05-quantum-chemistry/notebooks/05-ansatz-design.ipynb`:
- Cell 7 (`double_cnots = sum(1 for ins in double_circ.instructions if ins.operator == "CNOT")`) -> `if ins.operator.name == "CNot"`.
- Cell 11 (`he_cnots = sum(1 for ins in he_circ.instructions if ins.operator == "CNOT")`) -> `if ins.operator.name == "CNot"`.
- The circuits here touch qubits 0,1,2,3 (contiguous), so qubit-compaction does NOT change output. Verify the `CNOTs=...` printed numbers are unchanged by the execution test in Step 6.

**5.2** `02-hardware/notebooks/03-iqm-exploration.ipynb` cell 2, helper `two_qubit_gate_count`:
- `return sum(1 for ins in circ.instructions if ins.operator in ("CNOT", "SWAP", "CZ"))` -> `return sum(1 for ins in circ.instructions if ins.operator.name in ("CNot", "Swap", "CZ"))`.
- This notebook uses `span(circ, CHAIN)` = `circ.i(n-1)` (touches qubit 4) so the register is always contiguous 0..4; compaction does NOT change its bitstring length, and cell 12's `bitstring[0] == bitstring[4]` assertion still holds. Confirm via Step 6 execution.

**5.3** Do NOT add emojis. Preserve surrounding prose/markdown. nbstripout is configured — after editing, confirm `git diff` shows only the intended source-line change (no spurious output/metadata churn; if it does, see MEMORY's nbstripout quirk — on-disk == HEAD is fine).

### 6. Regenerate manifests and re-run the slow contract suite (CRITICAL — behavior change)

Qubit-compaction is a behavior change. Even though the verified blast radius on shipped notebooks is zero (chemistry notebooks are contiguous 0..3; hardware/qnn notebooks pad the top qubit via `span`/`.i(N-1)`), the slow execution contract MUST be re-run.

**6.1** If bumping `qcsim.__version__` (Decision Point #3, recommended): edit `qcsim/src/qcsim/__init__.py` `__version__ = "0.2.0"`. This changes the wheel filename derived by `scripts/validate_runnable.py:_qcsim_wheel_name()` and the JupyterLite pin.

**6.2** Regenerate manifests: `python scripts/validate_runnable.py --write-manifest` then `git diff web/src/lib/runnable-manifest.json web/src/lib/content-manifest.json`. The runnable LIST should be unchanged (no notebook newly fails the static scan); only `content-manifest.json`'s `wheel` field changes if the version was bumped.

**6.3** Regenerate the JupyterLite pin so the build-smoke `git diff --exit-code web/jupyterlite-build/jupyter_lite_config.json` gate stays green: run `web/jupyterlite-build/build.sh` (or the documented regeneration path) and commit the resulting `jupyter_lite_config.json` change if the wheel name changed. If `__version__` is NOT bumped, this file is untouched.

**6.4** Run the manifest drift gate: `python scripts/validate_runnable.py --check` (must print "Manifests are in sync.").

**6.5** Run the FULL python suite including slow tests: `make test` (= `pytest tests/ -v`, no `-m` deselection, so `test_runnable_notebook_executes_under_qcsim` runs). Every browser-runnable notebook must still execute with no cell error and the printed `CNOTs=...` / two-qubit-count numbers must match expectations. Confirm `tests/test_notebook_contract.py::test_manifest_in_sync` passes.

### 7. Update `qcsim/API.md`

- Correct the `.qubit_count` row (currently "Highest target qubit + 1") to "Number of DISTINCT used qubits, compacted to a contiguous 0..k-1 register — matches Braket".
- Correct the `.instructions` row to note `.operator` is a Gate-like object with `.name` matching Braket capitalization (`CNot`, `Swap`, `Rx`, `CPhaseShift`), and `.target` a compacted int tuple.
- Add `measured_qubits` to the Result-objects table.
- (Optional, pre-existing doc nit) the `.depth` row says "Length of the gate list" but the code computes DAG depth (`circuits.py` 282-293); fix to "Greedy DAG depth (longest single-qubit gate chain)" while editing.

### 8. Lint and final verification

Run `make lint` (`ruff check .` + `ruff format --check .`) — keep line-length <= 100. Run `make test` once more clean. Then `python scripts/validate_runnable.py --check` and confirm all three python-job gates pass locally before opening a branch/PR.

## File & Code Changes

| Action | File Path | Description of Change |
|--------|-----------|------------------------|
| Modify | `/Users/cperez/dev/altivum-dev/quantum/qcsim/src/qcsim/circuits.py` | Add `_used_qubits`/`_compaction_map`; make `qubit_count` count distinct used qubits; remap gates through the compaction map in `state_vector()` and `__str__()`; replace `Instruction.operator` str with `_Operator` Gate-like object (`.name` = Braket capitalization, `__eq__` shim for legacy `"CNOT"`); emit compacted targets in `instructions`. |
| Modify | `/Users/cperez/dev/altivum-dev/quantum/qcsim/src/qcsim/devices.py` | Add `measured_qubits` param to `_Result.__init__`; set `measured_qubits = list(range(circuit.qubit_count)) or [0]` in `LocalSimulator.run`. |
| Modify | `/Users/cperez/dev/altivum-dev/quantum/qcsim/src/qcsim/__init__.py` | (If version-bumping) `__version__ = "0.2.0"`. |
| Modify | `/Users/cperez/dev/altivum-dev/quantum/tests/test_qcsim_parity.py` | Add cross-SDK tests: non-contiguous compaction vs Braket, `measured_qubits` + `parse_counts` guard, operator `.name` vs Braket, legacy-string shim back-compat; tighten existing `test_instructions_iterable_and_counts`/`test_qubit_count_and_depth` to assert the new operator shape. |
| Modify | `/Users/cperez/dev/altivum-dev/quantum/05-quantum-chemistry/notebooks/05-ansatz-design.ipynb` | Cells 7 & 11: `ins.operator == "CNOT"` -> `ins.operator.name == "CNot"`. |
| Modify | `/Users/cperez/dev/altivum-dev/quantum/02-hardware/notebooks/03-iqm-exploration.ipynb` | Cell 2 `two_qubit_gate_count`: `ins.operator in ("CNOT","SWAP","CZ")` -> `ins.operator.name in ("CNot","Swap","CZ")`. |
| Modify | `/Users/cperez/dev/altivum-dev/quantum/qcsim/API.md` | Correct `.qubit_count` (compaction), `.instructions` (Gate-like operator + compacted target), add `measured_qubits` to Result table; fix `.depth` description. |
| Modify | `/Users/cperez/dev/altivum-dev/quantum/web/src/lib/content-manifest.json` | Regenerated by `validate_runnable.py --write-manifest` (only `wheel` field changes, iff version bumped). Do not hand-edit. |
| Modify | `/Users/cperez/dev/altivum-dev/quantum/web/jupyterlite-build/jupyter_lite_config.json` | Regenerated by `build.sh` (only the `piplite_urls` wheel pin changes, iff version bumped); required so build-smoke's `git diff --exit-code` gate stays green. Do not hand-edit. |

## Testing & Validation

**Unit tests (Python, `make test`):**
- `test_noncontiguous_qubits_compact_like_braket` — proves `qubit_count`, bitstring length, and support set all equal real Braket for `h(0).cnot(0,2)` (the core gap A).
- `test_measured_qubits_set_and_contiguous` — proves `_Result.measured_qubits` is now set AND that `lib/utils/results.py:parse_counts`'s previously-skipped guard now runs and passes.
- `test_instruction_operator_name_matches_braket` — proves `.operator.name` equals Braket's per-gate names (`H`,`CNot`,`Ry`) and that the count idiom agrees across SDKs (gap B).
- `test_operator_legacy_string_equality_still_counts` — proves the `__eq__` shim keeps the legacy `== "CNOT"` idiom working (no silent breakage for learner code).
- Existing parity suite (`test_qcsim_matches_braket` over 10 reference circuits, `test_state_vector_*`, `test_state_vector_random_norm_preserved`) must remain green — confirms compaction did not perturb contiguous-circuit math.
- `tests/test_notebook_contract.py::test_manifest_in_sync` and `::test_runnable_notebook_static_contract` (fast) and `::test_runnable_notebook_executes_under_qcsim` (SLOW — runs under `make test`) must pass for all 32 runnable notebooks.

**Manual verification:**
- `python -c "from qcsim import Circuit, LocalSimulator; c=Circuit().h(0).cnot(0,2); print(c.qubit_count, set(LocalSimulator().run(c,shots=500).result().measurement_counts), list(LocalSimulator().run(c,shots=10).result().measured_qubits))"` -> expect `2 {'00','11'} [0, 1]`.
- `python -c "from qcsim import Circuit; print([i.operator.name for i in Circuit().h(0).cnot(0,1).instructions])"` -> expect `['H', 'CNot']`.
- Open the two edited notebooks in JupyterLab (`make lab`), Run All, and read the printed `CNOTs=...` / two-qubit counts — they must match the pre-change values (chemistry: doubles & HEA CNOT counts unchanged; hardware: routed/logical 2q counts unchanged) because those circuits are contiguous/span-padded.

**End-to-end confirmation (per user's verification rule — green tests are not proof):**
- After `npm run build` (static export) run the Playwright Pyodide smoke (`npm run test:e2e`) which boots REAL Pyodide + the qcsim wheel in JupyterLite and executes a browser notebook end-to-end. Confirm the rebuilt lab loads the new wheel and a runnable notebook executes — this proves the compacted qcsim actually runs in-browser, not just under CPython.
- Spot-run `02-hardware/03-iqm-exploration.ipynb` in the deployed/preview lab and confirm cell 12's `bitstring[0] == bitstring[4]` assertion passes (depends on qubit 4 still being present in the compacted register — it is, via `span`).

**Rollback verification:**
- The change is self-contained to `qcsim/` + tests + two notebooks + regenerated manifests. To roll back: `git revert` the commit, then `python scripts/validate_runnable.py --write-manifest` and `build.sh` to restore the old wheel pin, and confirm `validate_runnable.py --check` + build-smoke's `git diff --exit-code` both pass. Re-run `make test` to confirm the reverted state is green.

## Risk & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Qubit-compaction changes a shipped notebook's bitstring length/output, breaking an assertion in-browser | Low | High | Verified blast radius: all non-contiguous runnable notebooks either use contiguous indices (chemistry 0..3) or pad the top qubit via `span(c,n)`/`.i(N-1)` (hardware, qnn). Re-run the SLOW `test_runnable_notebook_executes_under_qcsim` (runs under `make test`) + Playwright Pyodide smoke before merge. |
| `_Operator.__eq__` shim accepting both `"CNOT"` and `"CNot"` masks a future real divergence | Low | Medium | The shim is back-compat only; the authoritative cross-SDK test (`test_instruction_operator_name_matches_braket`) asserts `.name` equals Braket exactly and that `"CNOT"` is NOT among names — so a real drift still fails CI. |
| Version bump cascades to `jupyter_lite_config.json` and trips build-smoke's `git diff --exit-code` gate | Medium | Medium | Regenerate the pin via `build.sh` (single-sourced from `__version__`) and commit it; run the drift gate `validate_runnable.py --check` locally. If avoiding the cascade, choose NOT to bump (Decision Point #3) — then no manifest/pin change at all. |
| Parity tests fail to run because real Braket isn't importable in CI | Low | High | `make setup` installs `amazon-braket-sdk>=1.80` as a BASE dependency; the parity file already imports it at top-level (no `importorskip`) and CI runs `make setup`. Confirm `import braket` works in CI before relying on the new tests. |
| `__str__` remap breaks rendering for circuits printed in notebooks | Low | Medium | `__str__` is updated to index via the compaction map; the QFT/iqm notebooks `print(circuit)` — covered by the slow execution test (a render exception would fail the cell). |
| nbstripout churn makes the notebook diff noisy / fails review | Low | Low | Edit via `NotebookEdit`; confirm `git diff` shows only the source-line change. Per MEMORY, on-disk == HEAD after tooling-touched mtime is expected; do not blind-commit stripped output. |

## Estimated Effort

- **Complexity:** High — touches the simulator core (compaction is a behavior change), a public object contract (`Instruction.operator`), the contract validator's blind spot, cross-SDK tests, shipped notebooks, and the version/wheel/pin cascade with three CI gates to keep green.
- **Time range:** 1.5–2.5 days (most of it in carefully verifying the slow notebook-contract execution + Playwright Pyodide smoke after the behavior change, and the wheel-pin regeneration).
- **Files affected:** 9 (3 qcsim source/version, 1 parity test, 2 notebooks, 1 API.md, 2 regenerated manifests/config) — plus `web/src/lib/runnable-manifest.json` only if the static scan result changes (expected: unchanged).

## Decision Points
1. Operator-shape approach: (A) make Instruction.operator a Gate-like object whose .name matches Braket ('CNot' not 'CNOT') and whose __eq__/__str__ stay back-compatible with the current 'CNOT' string idiom, vs (B) keep operator a plain str and add AST denylist checks to validate_runnable.py that flag ins.operator==.../str(ins.operator)/ins.target[n] reliance. RECOMMENDED: (A) it teaches the correct idiom instead of merely banning the wrong one, and is what the curriculum cells already lean on.
2. Qubit-compaction default: always compact used qubits (matches Braket), vs add an opt-out. RECOMMENDED: always compact (no flag) so qcsim cannot silently diverge; the curriculum's span(circ,n)/.i(n-1) padding pattern already keeps the high qubit touched, so verified blast radius on shipped notebooks is zero.
3. Whether to bump qcsim.__version__ (0.1.0 -> 0.2.0). Bumping changes the wheel filename in content-manifest.json AND jupyter_lite_config.json (build-smoke has a 'git diff --exit-code' gate on that file). RECOMMENDED: bump, and regenerate both via scripts/validate_runnable.py --write-manifest + build.sh so the pin is single-sourced.
4. Keep parse_counts' measured_qubits guard as-is and make qcsim's _Result set measured_qubits=list(range(n)) (so the guard runs and passes), vs teach the non-contiguous case. RECOMMENDED: set measured_qubits to the compacted contiguous range so the lib/utils/results.py guard is actually exercised under qcsim instead of silently skipped.

---

# Plan 3: Credit overdue elapsed time in the spaced-repetition scheduler
**Complexity:** Low · **Time:** 1.5-2.5 hours · **Files affected:** 2 · **Depends on:** none · **Parallelizable:** True

## Objective

Make the spaced-repetition kernel actually credit overdue/elapsed time when grading a mature card, so a passing review that is (say) 90 days overdue produces a longer next interval than the same grade given exactly on the due day — the defining behavior of the FSRS/SM-2 family the module docstring invokes (`web/src/lib/review-schedule.ts:1-2`). Today `schedule()` ignores elapsed time entirely (the `todayEpochDay` param only stamps `dueEpochDay`/`lastEpochDay` at lines 126-127 and never enters the growth math at lines 110-115), so the schedule diverges from its stated model. When done, the kernel still grows on success, resets on lapse, stays monotonic and clamped, and gains test coverage proving overdue Good > on-time Good.

## Prerequisites

- Node + the `web/` workspace installed (`cd web && npm ci`), so `npm test` / `npx jest` run.
- Familiarity with the existing kernel invariants in `web/src/lib/review-schedule.ts`: clamp range `[1, MAX_INTERVAL]` where `MAX_INTERVAL = 365` (line 34, applied at line 116) and the SM-2 monotonicity clamp `interval = Math.max(interval, state.stability)` for any non-`again` grade (line 119).
- Knowledge that `schedule()` is pure (no clock, no storage) and that the sole production caller is `gradeCard()` in `web/src/lib/review-store.ts:89-100`, which already passes `today = epochDay(nowMs)` and has `prev.dueEpochDay` / `prev.lastEpochDay` available — so elapsed time is computable inside `schedule()` from its existing args without any signature change.
- No new dependencies. No notebook, no Python, no AWS surface is touched.

## Step-by-Step Implementation

This is one function change (`schedule()`), one call-site type-check verification (`gradeCard()` — no edit expected), and one additive test.

**Decision (resolve first):** implement **Option A (recommended)** — credit elapsed time in the mature growth base — versus **Option B (cheaper)** — keep behavior and instead delete the FSRS/SM-2 claim from the docstring, redocumenting the module as a deliberate fixed-interval scheduler. The steps below implement Option A. If the team instead chooses Option B, the only change is editing the docstring at `review-schedule.ts:1-2` and `8-11` to remove "FSRS/SM-2 family" and state the fixed-interval intent, plus a one-line test/comment noting on-time and overdue Good are intentionally equal; no logic changes and no new test asserting overdue > on-time.

1. **Add a helper to compute credited elapsed days inside the kernel.** In `web/src/lib/review-schedule.ts`, just above `schedule()` (after `easeFor` at line 90), add a small pure helper so the growth base is explicit and testable. Use a non-negative elapsed value clamped at 0 so an early review (graded before its due day) is never penalized:

   1.1. The elapsed-since-due quantity is `Math.max(0, todayEpochDay - state.dueEpochDay)`. A card graded exactly when due yields `0` (preserving current behavior for the on-time path); a card 90 days overdue yields `90`.

   1.2. Reuse the existing `clamp` helper (line 43) — do not add a second clamp utility (repo convention: reuse `parse-utils`/existing helpers rather than duplicate; here the local `clamp` is the existing helper).

2. **Use the credited base only in the mature branch.** Modify the `else` (mature) branch at lines 110-115. The learning step (`state.reps === 0`, line 104) and graduating step (`state.reps === 1`, line 107) are fixed-step rules and must stay byte-for-byte identical (the existing tests at test lines 67-74 and 24-33 assert exact values 1/3/4/6/9). Only the mature multiply changes its base:

   2.1. Replace the growth base `state.stability` with `growthBase = Math.max(state.stability, elapsed)` where `elapsed = Math.max(0, todayEpochDay - state.dueEpochDay)`. Concretely the mature branch becomes:
   ```ts
   } else {
     // Mature review: grow the previous interval by an ease-derived multiplier,
     // crediting overdue time (FSRS/SM-2 family) so a long-overdue pass earns a
     // longer interval than the same grade given exactly on the due day.
     const elapsed = Math.max(0, todayEpochDay - state.dueEpochDay);
     const growthBase = Math.max(state.stability, elapsed);
     const ease = easeFor(difficulty);
     const mult = rating === "hard" ? 1.2 : rating === "good" ? ease : ease * 1.3;
     interval = Math.round(growthBase * mult);
   }
   ```
   This keeps the on-time case (`elapsed === 0` → `growthBase === state.stability`) numerically identical to today, so every existing on-time test stays green, while an overdue case grows from the larger of (stored stability, days overdue).

   2.2. Leave line 116 (`interval = clamp(interval, 1, MAX_INTERVAL)`) and line 119 (`if (rating !== "again") interval = Math.max(interval, state.stability)`) exactly as-is. The `MAX_INTERVAL` clamp still caps runaway overdue growth at 365; the monotonicity clamp still guarantees a passing review never shortens the interval. Because `growthBase >= state.stability` and `mult >= 1.2`, the rounded interval already dominates `state.stability` in the mature branch, so line 119 remains a correct no-op there and continues to protect the graduating-step edge case it was written for (comment at lines 117-118).

   2.3. Do not touch the `again` branch (line 102-103): a lapse still resets to interval `1` regardless of how overdue the card was — elapsed credit must apply to passing grades only, matching the family's semantics and the existing lapse test (test lines 56-65).

3. **Update the module docstring to match (Option A).** The current docstring (lines 1-12) claims the FSRS/SM-2 family but the kernel did not honor it; with the change it now does. Refine the second paragraph (lines 7-11) to state that the next interval grows from the larger of current stability and elapsed overdue days, so the prose and code agree. Keep it to one or two added sentences; do not rewrite the whole block.

4. **Verify the sole call site still type-checks (no edit expected).** `gradeCard()` at `web/src/lib/review-store.ts:89-92` calls `schedule(prev, rating, today)` — the `schedule` signature is unchanged (`(state, rating, todayEpochDay)`), and `prev` already carries `dueEpochDay`/`lastEpochDay` from `getCardState()` / `newCard()`. No edit is required here; confirm with `npx tsc --noEmit` (step 6.3). The first-ever grade of a brand-new card goes through `newCard(today)` whose `dueEpochDay === today` (review-schedule.ts:79), so `elapsed === 0` and `reps === 0` routes to the learning step — overdue credit never misfires on a first review.

5. **Edge cases to confirm hold:**
   - **Early review (graded before due):** `todayEpochDay < state.dueEpochDay` → `elapsed` clamps to `0` → identical to current behavior (no negative base).
   - **Extreme overdue + Easy repeatedly:** large `elapsed * ease * 1.3` is capped by `clamp(..., 1, 365)` at line 116; the existing "intervals never exceed the maximum" test (test lines 89-97) must still pass.
   - **Overdue Hard:** mature `hard` uses `mult = 1.2` on the credited base; with the line-119 clamp it can never drop below `state.stability`, so an overdue hard is `>=` an on-time hard.
   - **Purity:** still a pure function of `(state, rating, todayEpochDay)` — the "is a pure function of its inputs" test (test lines 106-112) must still pass.

6. **Run the gates locally.**
   1. `cd web && npx jest __tests__/lib/review-schedule.test.ts` — fast inner loop on the kernel test.
   2. `cd web && npm test` — full Jest suite (must stay green; this rec touches only the scheduler).
   3. `cd web && npx tsc --noEmit` and `npm run lint` — confirm `gradeCard` and the new helper type-check and pass ESLint.

## File & Code Changes

| Action | File Path | Description of Change |
| --- | --- | --- |
| Modify | `web/src/lib/review-schedule.ts` | In the mature branch of `schedule()` (lines 110-115) compute `elapsed = Math.max(0, todayEpochDay - state.dueEpochDay)` and grow from `growthBase = Math.max(state.stability, elapsed)` instead of `state.stability`; update the module docstring (lines 7-11) to state overdue time is credited. Leave learning/graduating branches, both clamps (lines 116, 119), and the `again` branch unchanged. |
| Modify | `web/__tests__/lib/review-schedule.test.ts` | Add a test asserting an overdue mature **Good** yields a strictly larger next interval than an on-time mature Good; plus an "early review is never penalized" assertion (elapsed clamps at 0) and an "overdue interval still respects MAX_INTERVAL and monotonicity" assertion. |
| (No edit) | `web/src/lib/review-store.ts` | `gradeCard()` (lines 89-100) already passes `today` and `prev` with the needed fields; signature unchanged, so no code change — only `tsc --noEmit` verification that it still type-checks. |

## Testing & Validation

**Unit tests to write (additive, in `web/__tests__/lib/review-schedule.test.ts`):**
- *Overdue Good beats on-time Good.* Mature a card to a known stability (e.g. two `good` reviews each "exactly when due", as the existing helper pattern at test lines 42-54 does), then branch: grade one copy `good` at `c.dueEpochDay` (on-time) and another `good` at `c.dueEpochDay + 90` (90 days overdue). Assert `overdue.stability > onTime.stability` (and equivalently the displayed `nextIntervalDays(overdue) > nextIntervalDays(onTime)`). Covers the core fix.
- *Early review is not penalized.* Grade a mature card `good` at `c.dueEpochDay - 3`; assert its `stability` equals the on-time-graded result (elapsed clamped to 0). Covers the negative-elapsed edge case.
- *Overdue growth still clamped + monotonic.* Grade a mature card `easy` at `c.dueEpochDay + 10_000`; assert `nextIntervalDays(result) <= MAX_INTERVAL` and `result.stability >= prior stability`. Covers lines 116 and 119 under the new base.
- *Lapse ignores overdue.* Grade an overdue mature card `again`; assert `nextIntervalDays === 1` and `lapses` incremented — proves elapsed credit does not leak into the `again` path.

**Manual verification:** none required at the UI level (pure kernel), but optionally exercise the real `/review` flow: in `npm run dev`, grade a card, change the system clock forward (or call `gradeCard(id, "good", futureMs)` from a scratch test) and confirm the "next review in N days" readout (driven by `nextIntervalDays`, review-schedule.ts:137-139) reflects the larger interval.

**End-to-end / CI confirmation:** the web CI gate is `npm lint + npm test` (plus tutor lambda `node --test`, untouched here). Run `cd web && npm test` and `npm run lint` and confirm fully green. The build-smoke / Pyodide gate and the Python gate are unaffected (no notebook, no `lib/`, no manifest change), so `validate_runnable.py` drift and `jupyter_lite_config.json` diff stay clean by construction.

**Rollback verification:** the change is two files and signature-compatible. Reverting the `schedule()` mature-branch edit (and the added tests) restores byte-identical prior behavior; confirm by `git stash` / re-running `npx jest __tests__/lib/review-schedule.test.ts` and seeing the original 10 tests pass. Because the on-time path is numerically unchanged, no stored `qc:card:*` localStorage records are invalidated — existing users' schedules continue advancing identically until their next overdue review, so there is no data migration or rollback hazard.

## Risk & Mitigation

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Overdue credit unintentionally perturbs the fixed learning/graduating steps, breaking the exact-value tests (1/3/4/6/9). | Low | Medium | Change is scoped strictly to the `else` mature branch (lines 110-115); learning (`reps===0`) and graduating (`reps===1`) branches are untouched. Run the full kernel test (test lines 67-74, 24-33) to confirm. |
| Large `elapsed` produces absurd intervals. | Medium | Low | Existing `clamp(interval, 1, MAX_INTERVAL=365)` at line 116 caps it; add the "overdue growth still clamped" test to lock this in. |
| Monotonicity clamp (line 119) interaction overlooked, allowing a shorter interval. | Low | Medium | `growthBase >= state.stability` and `mult >= 1.2`, so the mature interval already dominates stability; line 119 left intact as belt-and-suspenders, with an explicit monotonicity assertion in the new test. |
| Behavior change surprises users mid-streak (a long-dormant card jumps to a much longer interval). | Low | Low | This is the intended, correct family behavior; the on-time path is unchanged so only genuinely overdue cards are affected, and the jump is bounded by MAX_INTERVAL. Documented in the updated docstring. |
| Team prefers a fixed-interval scheduler (rejects the family semantics). | Low | Low | Fall back to Option B: remove the FSRS/SM-2 claim from the docstring, no logic change — captured as the first decision point. |

## Estimated Effort

- **Complexity:** Low — one pure function's mature branch, a docstring tweak, and additive tests; no signature change, no call-site edit, no migration.
- **Time range:** 1.5-2.5 hours including writing/running the new tests and the full `npm test` + lint pass.
- **Files affected:** 2 (`web/src/lib/review-schedule.ts`, `web/__tests__/lib/review-schedule.test.ts`); `web/src/lib/review-store.ts` is verified-only (no edit).

## Decision Points
1. Option A (credit elapsed time in the growth base) vs Option B (drop the FSRS/SM-2 claim and document a deliberate fixed-interval scheduler). Recommend Option A — it makes the kernel match its docstring and is the defining property of the family it invokes.
2. Within Option A: simple growth base `max(state.stability, elapsed)` (recommended — minimal, preserves all existing tests and clamps) vs a true FSRS retrievability factor `1 + factor*(elapsed/stability)` (more faithful but introduces a new tunable constant and risks perturbing the existing monotonicity/interval tests). Recommend the simple base for this change; note the retrievability option as a future refinement.
3. Whether to apply elapsed credit to the `hard` mature grade as well as `good`/`easy`. Recommend yes (apply to the shared mature growth base) so a long-overdue `hard` is never worse than an on-time `hard`; the final `Math.max(interval, state.stability)` clamp already guarantees monotonicity either way.

---

# Plan 4: Fix `make deploy-infra` (broken nested-stack deploy)
**Complexity:** Medium · **Time:** 2-4 hours (Option A) / 3-5 hours (Option B), incl. cfn-lint validation; live AWS deploy verification optional and account-gated · **Files affected:** 3 · **Depends on:** none · **Parallelizable:** True

## Objective

`make deploy-infra` currently fails at deploy time: `infra/scripts/deploy-infra.sh` runs `aws cloudformation deploy --template-file main.yaml` directly, but `infra/cloudformation/main.yaml` declares four nested `AWS::CloudFormation::Stack` resources whose `TemplateURL` values are **local relative paths** (`./braket-s3.yaml`, `./braket-iam.yaml`, `./braket-budget.yaml`, `./braket-notebook.yaml`). CloudFormation requires `TemplateURL` to be an S3 URL, so the deploy errors out and the entire Braket cost/budget-guardrail infrastructure is non-functional out of the box. When done, `make deploy-infra` runs end-to-end and provisions the S3 bucket, least-privilege IAM role, budget alarm, and (optional) notebook, fixing the only broken `make` target in the repo.

## Prerequisites

- AWS CLI v2 installed and configured (`aws sts get-caller-identity` succeeds) — already asserted by `infra/scripts/validate-setup.sh`.
- AWS credentials with permission to create CloudFormation stacks, S3 buckets, IAM roles (`CAPABILITY_NAMED_IAM`), Budgets, and SageMaker notebooks. **Live deploy is account-gated and costs money** (SageMaker notebook if `DeployNotebook=true`); per project rules, do NOT run a live QPU/managed deploy without explicit user approval — validate with `cfn-lint` / change-sets instead.
- `cfn-lint` available locally for template validation (`pip install cfn-lint`, or via the `awsiac` MCP `validate_cloudformation_template` tool).
- Knowledge: `aws cloudformation package` uploads local artifacts (including the `TemplateURL` property of `AWS::CloudFormation::Stack`) to S3 and rewrites the template; confirmed against the AWS CLI `package` reference and the "Upload local artifacts" CloudFormation user-guide page (which lists `TemplateURL` for `AWS::CloudFormation::Stack` as a packageable property and states "Before you begin, you must have an existing Amazon S3 bucket"). `aws cloudformation deploy --resolve-s3` only manages the parent-template upload bucket — it does NOT package nested-stack `TemplateURL` references, which is why a `package` step is mandatory for Option A.
- Assumption: no CI job currently exercises `infra/` (the python/web/build-smoke gates do not touch CloudFormation), so this is a runtime/manual-path fix; CI stays green regardless.

## Step-by-Step Implementation

**Recommended: Option A** (add a `package` step, keep the modular nested stacks the README advertises at lines 484-492). Option B (flatten) is documented at the end as the alternative.

### Option A — add `aws cloudformation package` before `deploy`

1. **Modify `infra/scripts/deploy-infra.sh` to package then deploy.**

   1.1. Keep the existing interactive prompts (budget, email, notebook) and `STACK_NAME`/`TEMPLATE_DIR` resolution (lines 1-43) unchanged.

   1.2. Add a packaging step immediately before the `aws cloudformation deploy` call (current lines 36-43). Use `--resolve-s3` so the CLI auto-creates/uses the account's managed `cf-templates-<hash>-<region>` bucket — zero extra resources, no bucket-name bikeshedding, and it works on a fresh account:

   ```bash
   PACKAGED_TEMPLATE="$(mktemp -t braket-packaged-XXXXXX.yaml)"
   trap 'rm -f "$PACKAGED_TEMPLATE"' EXIT

   echo "Packaging nested-stack templates to S3..."
   aws cloudformation package \
       --template-file "$TEMPLATE_DIR/main.yaml" \
       --resolve-s3 \
       --output-template-file "$PACKAGED_TEMPLATE"
   ```

   1.3. Change the `deploy` invocation to use the packaged template (the `TemplateURL` values are now rewritten to `s3://...` URLs):

   ```bash
   aws cloudformation deploy \
       --template-file "$PACKAGED_TEMPLATE" \
       --stack-name "$STACK_NAME" \
       --capabilities CAPABILITY_NAMED_IAM CAPABILITY_AUTO_EXPAND \
       --parameter-overrides \
           MonthlyBudget="$BUDGET" \
           NotificationEmail="$EMAIL" \
           DeployNotebook="$NOTEBOOK"
   ```

   Note the added `CAPABILITY_AUTO_EXPAND` — required when a parent template contains nested stacks that are processed/expanded at deploy time. Without it, deploy of a packaged nested-stack template is rejected.

   1.4. Edge case — `--resolve-s3` requires a region in context. The script already relies on the default region (validate-setup surfaces it); if `aws cloudformation package --resolve-s3` fails with a missing-region error, it will surface clearly. Optionally guard early by asserting `aws configure get region` is non-empty before packaging and printing a clear remediation (`Set a region: aws configure set region us-east-1`).

   1.5. Edge case — older AWS CLI (`--resolve-s3` added in CLI v2 / late v1). validate-setup already prints the CLI version; add a one-line comment in the script pointing to the deterministic-bucket fallback (decision-point option 2) for environments without `--resolve-s3`:

   ```bash
   # Fallback for CLI without --resolve-s3: create a deterministic staging bucket
   #   ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
   #   REGION=$(aws configure get region)
   #   BUCKET="braket-cfn-staging-${ACCOUNT_ID}-${REGION}"
   #   aws s3 mb "s3://${BUCKET}" 2>/dev/null || true
   #   ...package with --s3-bucket "$BUCKET" instead of --resolve-s3
   ```

   1.6. Leave the post-deploy `describe-stacks ... Outputs` block (lines 45-47) unchanged — it still prints `ResultsBucket` and `IAMRoleArn` from `main.yaml`'s `Outputs`.

2. **Verify `teardown-infra.sh` still works.** It deletes by `STACK_NAME` (`aws cloudformation delete-stack`), which CloudFormation recursively applies to nested stacks — no change needed. (Known caveat unchanged by this fix: the S3 results bucket may block stack deletion if non-empty; out of scope here, but note it in testing.)

3. **Run `cfn-lint` on all five templates** to confirm the templates themselves are valid (independent of the packaging fix):

   ```bash
   cfn-lint infra/cloudformation/main.yaml \
            infra/cloudformation/braket-s3.yaml \
            infra/cloudformation/braket-iam.yaml \
            infra/cloudformation/braket-budget.yaml \
            infra/cloudformation/braket-notebook.yaml
   ```

   Note: `cfn-lint` on `main.yaml` may warn that local `TemplateURL` paths are not S3 URLs — this is expected pre-package and confirms the root cause; it is not introduced by this change.

4. **Update README to reflect the package step.** README line 484 and the Mermaid block (lines 489-492) already describe the nested-stack architecture correctly under Option A — confirm wording at line 146 (`make deploy-infra # interactive: budget, notification email, optional managed notebook`) still holds; optionally add one sentence near line 484 noting the deploy now packages child templates to the account's managed CloudFormation S3 bucket. No structural README change required under Option A.

5. **Run `make lint`** (`ruff check . && ruff format --check .`) — ruff does not lint shell, so this stays green; confirm no Python touched.

### Option B — flatten 4 child stacks into a single `main.yaml` (alternative)

B.1. Merge all `Resources` from `braket-s3.yaml`, `braket-iam.yaml`, `braket-budget.yaml`, `braket-notebook.yaml` into `main.yaml`'s `Resources:` block. The merge is small (one bucket, one role, one budget, one notebook ≈ 4 resources total, ~120 lines).

B.2. Replace cross-stack `!GetAtt SomeStack.Outputs.X` wiring with direct intrinsic refs: `S3Stack.Outputs.BucketArn` → `!GetAtt BraketResultsBucket.Arn`; `IAMStack.Outputs.RoleArn` → `!GetAtt BraketUserRole.Arn`. Drop the `AWS::CloudFormation::Stack` wrappers and `DependsOn: S3Stack/IAMStack` (CloudFormation infers ordering from `!GetAtt`/`!Ref`). Keep the `ShouldDeployNotebook` condition on the notebook resource.

B.3. Reconcile parameter names: child templates expose `BucketPrefix`, `RetentionDays`, `InstanceType` defaults that `main.yaml` does not surface — either hoist them as `main.yaml` Parameters or hardcode the existing defaults.

B.4. Delete the four child YAML files. `deploy-infra.sh` needs **no** change (no nested stacks → no `TemplateURL` → no `package` step). Update README lines 484-492 (the nested-stack Mermaid diagram) to reflect a single flat stack.

B.5. Run `cfn-lint infra/cloudformation/main.yaml`.

**Recommendation: Option A.** It is a ~15-line script edit, removes zero modular boundaries, keeps the four-stack architecture the README markets as a feature, and uses only AWS-supported, documented CLI behavior. Option B removes the failure class entirely (no S3 bucket ever needed) but discards the modular stack design and forces a README/diagram rewrite and parameter reconciliation.

## File & Code Changes

| Action | File Path | Description of Change |
| --- | --- | --- |
| Modify | `infra/scripts/deploy-infra.sh` | (Option A) Insert `aws cloudformation package --template-file "$TEMPLATE_DIR/main.yaml" --resolve-s3 --output-template-file "$PACKAGED_TEMPLATE"` (with `mktemp` + `trap` cleanup) before the deploy; point `deploy --template-file` at the packaged template; add `CAPABILITY_AUTO_EXPAND` to `--capabilities`; add a region-present guard and a commented deterministic-bucket fallback for CLIs lacking `--resolve-s3`. |
| Modify | `README.md` | (Option A) Optional one-sentence note near line 484 that `make deploy-infra` packages child templates to the account's managed CloudFormation S3 bucket. (Option B) Rewrite the nested-stack Mermaid diagram lines 489-492 to a single flat stack. |
| Modify | `infra/cloudformation/main.yaml` | (Option A) No change — local `TemplateURL` paths are now valid `package` inputs. (Option B only) Inline all child `Resources`, replace `!GetAtt *Stack.Outputs.*` with direct `!GetAtt`/`!Ref`, drop `AWS::CloudFormation::Stack` wrappers + `DependsOn`, hoist child parameters. |
| Delete | `infra/cloudformation/braket-s3.yaml` `braket-iam.yaml` `braket-budget.yaml` `braket-notebook.yaml` | **Option B only** — removed after their resources are inlined into `main.yaml`. Under Option A these are unchanged. |

## Testing & Validation

- **Template validation (both options):** `cfn-lint` over all templates passes (Option A: 5 files; Option B: 1 file). Optionally use the `awsiac` MCP `validate_cloudformation_template` (cfn-lint) and `check_cloudformation_template_compliance` (cfn-guard) tools for a security pass on the IAM/S3 resources.
- **Static dry-run of the script (no live AWS):** run `bash -n infra/scripts/deploy-infra.sh` (syntax check) and `shellcheck infra/scripts/deploy-infra.sh` if available — confirms the `mktemp`/`trap`/quoting are correct.
- **Package-step verification without deploying:** run only the package command against a sandbox/dev account: `aws cloudformation package --template-file infra/cloudformation/main.yaml --resolve-s3 --output-template-file /tmp/packaged.yaml`, then confirm the output's four `TemplateURL` values are now `https://s3.../...` URLs (was `./braket-*.yaml`). This proves the root-cause fix with zero stack creation and ~zero cost (only tiny template objects uploaded to the managed bucket).
- **Change-set dry-run (no resource creation):** `aws cloudformation deploy ... --no-execute-changeset` (add temporarily) to confirm the packaged template is accepted and a change set is produced, without provisioning anything.
- **End-to-end (account-gated, requires explicit user approval — has cost):** run `make deploy-infra` with `DeployNotebook=false` (avoids SageMaker cost), confirm stack reaches `CREATE_COMPLETE`, the `describe-stacks` Outputs print `ResultsBucket` + `IAMRoleArn`, the budget alarm exists (`aws budgets describe-budgets`), and the IAM role exists. Per project cost rules, do this only if the user explicitly asks.
- **Rollback verification:** run `make teardown-infra`, type `delete`, confirm the parent + nested stacks delete (`aws cloudformation describe-stacks --stack-name braket-quantum-workspace` returns "does not exist"). Note the empty-bucket caveat: if the results bucket has objects, deletion of the S3 nested stack will fail — document this in the teardown output or empty the bucket first.
- **CI:** confirm `make lint` and the web/build-smoke gates remain green (none touch infra/), so no CI regression.

## Risk & Mitigation

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| `--resolve-s3` unsupported on the user's AWS CLI version | Low | Medium | validate-setup prints CLI version; ship the commented deterministic-bucket (`aws s3 mb`) fallback in the script and document it in README/prereqs. |
| `CAPABILITY_AUTO_EXPAND` omitted → deploy rejects expanded nested template | Medium | Medium | Explicitly add `CAPABILITY_AUTO_EXPAND` alongside `CAPABILITY_NAMED_IAM` in the deploy call (Step 1.3); covered by the change-set dry-run test. |
| Live deploy incurs unexpected cost (esp. SageMaker notebook) | Low | High | Default `DeployNotebook=false`; gate any live run behind explicit user approval per project cost rules; validate via cfn-lint + `--no-execute-changeset` instead of deploying. |
| Region not set → `package`/`deploy` fail with opaque error | Low | Low | Add an early region-present guard with a clear remediation message (Step 1.4). |
| Option B parameter/`!GetAtt` reconciliation introduces a regression (cross-stack outputs lost) | Medium (Option B only) | Medium | cfn-lint + change-set dry-run; prefer Option A which avoids the refactor entirely. |
| Adjacent latent bug: `braket-budget.yaml` hardcodes Threshold 50/80 instead of `MonthlyBudget` | Certain (pre-existing) | Low | Out of scope; flag to user as a follow-up. Do not bundle into this fix unless approved. |

## Estimated Effort

Complexity **Medium**. Time: **2-4 hours** for Option A (script edit + cfn-lint + package-only dry-run + change-set verification; excludes any account-gated live deploy), **3-5 hours** for Option B (resource inlining + parameter reconciliation + README diagram rewrite). Files affected: **3** under the recommended Option A (`infra/scripts/deploy-infra.sh`, `README.md`, plus `infra/cloudformation/main.yaml` only if Option B). Independent of all other recommendations — touches `infra/` files no web/Python rec touches, so it can land in parallel.

## Decision Points
1. Option A (add `aws cloudformation package` step, keep nested stacks) vs Option B (flatten all 4 child templates into a single main.yaml). Recommend A — preserves the modular boundaries the README advertises and is a ~15-line script change.
2. If Option A: how to provision the packaging/staging S3 bucket — (1) `aws cloudformation package --resolve-s3` (CLI auto-creates/uses the account's managed `cf-templates-*` bucket, zero new resources, RECOMMENDED), (2) deterministic `aws s3 mb s3://braket-cfn-staging-<accountId>-<region>` created idempotently by the script, or (3) prompt the user for an existing bucket name.
3. Whether to add a non-deploying `cfn-lint`/`validate-template` smoke step to CI (currently NO CI gate touches infra/). Recommended as a lightweight guard so this class of bug is caught, but it adds a Python-job dependency (cfn-lint) and is optional.
4. Out-of-scope but adjacent: braket-budget.yaml hardcodes Threshold 50/80 instead of referencing MonthlyBudget — flag to user, do not fix under this rec unless they approve scope expansion.

---

# Plan 5: Add a notebook markdown-link integrity test and fix the deutsch-jozsa->grover 404
**Complexity:** Low · **Time:** 30-60 minutes · **Files affected:** 2 · **Depends on:** none · **Parallelizable:** True

## Objective

Fix the single broken in-lab "Next" navigation link so that opening `03-algorithms/notebooks/01-deutsch-jozsa.ipynb` in the JupyterLite lab and clicking through to Grover's search resolves to the real file (`02-grovers-search.ipynb`) instead of 404ing on `02-grover-search.ipynb`. Then add a cheap, deterministic pytest contract (`tests/test_notebook_links.py`) that parametrizes over every `0*/notebooks/*.ipynb`, extracts relative `.ipynb` and `.md` links from markdown cells, resolves each against the notebook's parent directory, and asserts the target exists — so this class of broken cross-notebook link can never reach `main` again (it runs in the existing Python CI job via `make test`). When done: the live lab "Next" link works, and the curriculum's 38 relative `.ipynb` links + 51 relative `.md` links are guarded by an executable test.

## Prerequisites

- Local repo at `/Users/cperez/dev/altivum-dev/quantum` on a feature branch (not `main`; `main` is branch-protected with 3 CI checks).
- Python dev environment installed (the project's `.venv`; `pip install -e ".[dev,full]"` or `make setup`). `pytest` must be importable; the new test needs only the stdlib (`json`, `re`, `os`/`pathlib`) plus `pytest`, so no new dependency.
- Knowledge that the 45 canonical notebooks under `0*/notebooks/` are the single source of truth; the JupyterLite `web/public/lab` copy and `web/jupyterlite-build/files/` staging are gitignored and regenerated by `build.sh` (which only injects a Pyodide bootstrap cell at the top via `web/jupyterlite-build/prepare_notebooks.py` — markdown link text is copied verbatim). Therefore fixing the canonical notebook fixes the lab copy.
- `.gitattributes` applies an `nbstripout` clean filter to `*.ipynb` (strips outputs/execution counts only, not markdown source), so a one-line markdown-source edit shows as a clean, minimal diff.

## Step-by-Step Implementation

### 1. Create the feature branch
1.1 From repo root: `git checkout -b fix/notebook-link-integrity`

### 2. Fix the one broken link in the canonical notebook
The break is in `03-algorithms/notebooks/01-deutsch-jozsa.ipynb`, the **Summary** cell (cell index 21 of 22, `cell_type: "markdown"`). The `source` is a JSON list of strings; the offending line is exactly:

```
"**Next:** [`02-grover-search.ipynb`](02-grover-search.ipynb) -- when one query is not enough, and\n"
```

Both the backtick display text and the link target read `02-grover-search.ipynb`; the real file on disk is `02-grovers-search.ipynb` (verified via `ls 03-algorithms/notebooks/`). Fix BOTH occurrences (display + target) so the rendered label matches the file too.

2.1 Edit the notebook. Preferred: use the **NotebookEdit tool** targeting cell index 21 (the markdown Summary cell), replacing only that one line's `02-grover-search.ipynb` → `02-grovers-search.ipynb` (two occurrences on the same line). NotebookEdit keeps the JSON well-formed and avoids hand-editing escaped source arrays.

2.2 Alternative (equivalent) if editing JSON directly: in the cell-21 `source` array, change the single element
`"**Next:** [\`02-grover-search.ipynb\`](02-grover-search.ipynb) -- when one query is not enough, and\n"`
to
`"**Next:** [\`02-grovers-search.ipynb\`](02-grovers-search.ipynb) -- when one query is not enough, and\n"`.
Do not touch any other cell, output, or execution count (let nbstripout keep the diff minimal).

2.3 Verify the on-disk fix and that no other link regressed, using the same resolution logic the test will use:
```
python3 - <<'PY'
import json, glob, re, os
LINK_RE = re.compile(r'\[[^\]]*\]\(([^)]+)\)')
broken = []
for nb_path in sorted(glob.glob('0*/notebooks/*.ipynb')):
    nb = json.load(open(nb_path)); parent = os.path.dirname(nb_path)
    for cell in nb['cells']:
        if cell['cell_type'] != 'markdown': continue
        src = ''.join(cell['source'])
        for m in LINK_RE.finditer(src):
            t = m.group(1).strip()
            if t.startswith(('http://','https://','mailto:','#')): continue
            clean = t.split('#', 1)[0]
            if not (clean.endswith('.ipynb') or clean.endswith('.md')): continue
            if not os.path.exists(os.path.normpath(os.path.join(parent, clean))):
                broken.append((nb_path, clean))
print('broken:', broken)
PY
```
Expected output after the fix: `broken: []`.

### 3. Add the link-integrity test module
Create `tests/test_notebook_links.py` matching the established idiom (module-level `REPO_ROOT = Path(__file__).resolve().parent.parent`, discovery at import time, `@pytest.mark.parametrize` with human-readable `ids=`, exactly as `tests/test_notebook_contract.py` and `tests/test_content_manifest.py` do). Behavior to implement:

3.1 **Discovery (module scope):** glob `REPO_ROOT.glob("0*/notebooks/*.ipynb")`, sorted. Build a list of `(notebook_path, link_target)` pairs by reading each notebook's JSON, iterating markdown cells (`cell["cell_type"] == "markdown"`), joining `cell["source"]` (a list of strings), and extracting links with the regex `r"\[[^\]]*\]\(([^)]+)\)"`.

3.2 **Link filtering rules (edge cases):**
- `.strip()` each target.
- Skip externals: targets starting with `http://`, `https://`, `mailto:` (case-insensitive prefix check).
- Skip pure-anchor targets starting with `#`.
- Strip a trailing `#anchor`: `clean = target.split("#", 1)[0]`; skip if the result is empty.
- Only assert on relative links whose cleaned target ends with `.ipynb` or `.md` (this is the contract scope; image/other relative assets are out of scope here).

3.3 **Resolution + assertion:** resolve each cleaned target relative to the notebook's parent dir with `(notebook_path.parent / clean).resolve()` (or `os.path.normpath(os.path.join(parent, clean))`), and assert `.exists()`. This must correctly handle the existing cross-section `../GUIDE.md` and `../../03-algorithms/GUIDE.md` style links (verified: all 51 `.md` links resolve today).

3.4 **Parametrization & IDs:** parametrize the assertion test over the `(notebook_path, link_target)` pairs, with `ids=` formatted as `f"{nb.relative_to(REPO_ROOT).as_posix()} -> {link}"` so a failure names the offending notebook and the exact dead link.

3.5 **Discovery guard:** add a non-parametrized `test_found_notebook_links()` that asserts the discovered pair list is non-empty (mirrors `test_found_runnable_notebooks` in `test_notebook_contract.py`) so a future glob/regex regression that silently empties the corpus fails loudly instead of trivially passing.

3.6 Concrete implementation:
```python
"""Executable contract: every relative cross-reference in a curriculum
notebook's markdown cells must resolve to a file that exists.

These relative ``.ipynb`` / ``.md`` links are the primary cross-notebook
navigation inside the JupyterLite lab (34/45 notebooks carry a "Next" link),
so a typo'd target is a live 404 with zero other coverage. The scan is cheap
and deterministic and runs in the Python CI job (``make test``).
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent

# [display text](target)
_LINK_RE = re.compile(r"\[[^\]]*\]\(([^)]+)\)")
_SKIP_PREFIXES = ("http://", "https://", "mailto:", "#")
_CHECKED_SUFFIXES = (".ipynb", ".md")


def _relative_links() -> list[tuple[Path, str]]:
    pairs: list[tuple[Path, str]] = []
    for nb_path in sorted(REPO_ROOT.glob("0*/notebooks/*.ipynb")):
        nb = json.loads(nb_path.read_text(encoding="utf-8"))
        for cell in nb.get("cells", []):
            if cell.get("cell_type") != "markdown":
                continue
            source = "".join(cell.get("source", []))
            for match in _LINK_RE.finditer(source):
                target = match.group(1).strip()
                if target.lower().startswith(_SKIP_PREFIXES):
                    continue
                clean = target.split("#", 1)[0]
                if not clean or not clean.endswith(_CHECKED_SUFFIXES):
                    continue
                pairs.append((nb_path, clean))
    return pairs


_LINKS = _relative_links()
_IDS = [f"{nb.relative_to(REPO_ROOT).as_posix()} -> {link}" for nb, link in _LINKS]


def test_found_notebook_links():
    """Guard against a discovery regression silently emptying the suite."""
    assert _LINKS, "no relative .ipynb/.md links discovered in 0*/notebooks/*.ipynb"


@pytest.mark.parametrize(("nb_path", "link"), _LINKS, ids=_IDS)
def test_relative_notebook_link_resolves(nb_path: Path, link: str):
    """Every relative cross-reference must point at a file that exists."""
    target = (nb_path.parent / link).resolve()
    assert target.exists(), (
        f"{nb_path.relative_to(REPO_ROOT).as_posix()} links to '{link}', "
        f"but {target.relative_to(REPO_ROOT) if target.is_relative_to(REPO_ROOT) else target} "
        f"does not exist (dead in-lab navigation link)."
    )
```
(`Path.is_relative_to` requires py39+; project targets py310 so it is safe.)

3.7 Ensure ruff-cleanliness: keep lines ≤ 100 chars (`ruff` `line-length = 100`); the file above already respects this. `*.ipynb` is `extend-exclude`d from ruff, so the notebook edit is not linted.

### 4. Run the gates locally
4.1 `make test` (= `pytest tests/ -v`) — the new module runs alongside the existing suite; `slow` tests are NOT deselected, so confirm the full run is green.
4.2 `make lint` (ruff) — confirm `tests/test_notebook_links.py` passes.
4.3 `python scripts/validate_runnable.py --check` — the manifest-drift gate; the link fix does not change runnable status or counts, so this must still exit 0 (no manifest regeneration needed).

### 5. Commit
5.1 `git add 03-algorithms/notebooks/01-deutsch-jozsa.ipynb tests/test_notebook_links.py`
5.2 Commit (do not push/PR unless the user asks). If the notebook shows a spurious nbstripout "modified" mtime with no real content change beyond the link, re-add is unnecessary; only the markdown-source line should appear in `git diff`.

## File & Code Changes

| Action | File Path | Description of Change |
| --- | --- | --- |
| Modify | `/Users/cperez/dev/altivum-dev/quantum/03-algorithms/notebooks/01-deutsch-jozsa.ipynb` | In the Summary markdown cell (index 21), change the single "Next" line's `02-grover-search.ipynb` to `02-grovers-search.ipynb` in BOTH the backtick display text and the `(...)` link target. No other cell touched. |
| Create | `/Users/cperez/dev/altivum-dev/quantum/tests/test_notebook_links.py` | New parametrized pytest module: discovers all `0*/notebooks/*.ipynb`, extracts relative `.ipynb`/`.md` links from markdown cells (skips http(s)/mailto/`#`-anchors, strips trailing `#fragment`), resolves each against the notebook's parent dir, and asserts existence; plus a non-empty discovery guard. Stdlib + pytest only. |

## Testing & Validation

- **Unit tests written:**
  - `test_relative_notebook_link_resolves[...]` — one parametrized case per discovered relative link (38 `.ipynb` + 51 `.md` = 89 cases today). Covers: the now-fixed deutsch-jozsa→grover link (passes), all "Next" inter-notebook links, and cross-section `../GUIDE.md` / `../../<section>/GUIDE.md` links. Each ID names the source notebook and the exact target so a failure is self-diagnosing.
  - `test_found_notebook_links` — asserts the discovered link list is non-empty, so a regex/glob regression that empties the corpus fails loudly rather than passing vacuously.
- **Regression proof (red→green):** before applying the Step 2 fix, run `pytest tests/test_notebook_links.py -v`; the `... -> 02-grover-search.ipynb` case must FAIL (proves the test actually catches the bug). After the fix, the entire module must be green.
- **Manual verification (real path, per project rules):** run `cd web && npm run build` (regenerates the staged lab from canonical notebooks), then open the JupyterLite lab, navigate to `03-algorithms/notebooks/01-deutsch-jozsa.ipynb`, and click the "Next" link in the Summary — it must open `02-grovers-search.ipynb` rather than 404. (Alternatively confirm via the Step 2.3 script that `broken: []`, then a quick `npm run test:e2e` Pyodide smoke to confirm the build is intact.)
- **CI gate confirmation:** `make test`, `make lint`, and `python scripts/validate_runnable.py --check` all green; the web job and build-smoke are unaffected (no web source change; `git diff --exit-code web/jupyterlite-build/jupyter_lite_config.json` stays clean because that file is untouched).
- **Rollback verification:** the change is two files. To roll back, `git revert` the commit (or restore the notebook line and delete `tests/test_notebook_links.py`); re-run `make test` to confirm the suite returns to its prior green state. Reverting only the notebook fix while keeping the test would correctly turn the suite RED again — itself a confirmation the guard works.

## Risk & Mitigation

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Editing the notebook JSON by hand corrupts the file or alters unrelated cells | Low | Medium | Use the NotebookEdit tool (Step 2.1); change exactly one markdown line; verify with the Step 2.3 script and `make test`. nbstripout keeps the diff minimal. |
| New test is flaky/non-deterministic across machines | Very Low | Low | Test is pure filesystem + regex over committed files; no network, no kernel, no AWS. Resolution uses paths relative to the notebook, independent of CWD. |
| Regex misses an unusual markdown link form (e.g. reference-style `[a][b]` or angle-bracket `<...>`) → a real dead link slips through | Low | Low | Corpus uses only inline `[text](target)` links (verified across all `0*/notebooks`). Scope is explicitly inline links; reference-style is not used in the curriculum. Acceptable known limitation; can extend later if a new style appears. |
| False positive from a future intentionally-relative-but-generated link | Low | Low | Filter restricts to `.ipynb`/`.md` suffixes and skips http(s)/mailto/anchors; failure message names the exact file+link for fast triage. |
| Manifest-drift gate trips unexpectedly | Very Low | Low | The fix changes no runnable status, counts, titles, or wheel; `validate_runnable.py --check` is run locally in Step 4.3 before commit. |

## Estimated Effort

- **Complexity:** Low.
- **Time:** 30-60 minutes (most of it is the red→green proof and the optional `npm run build` + in-lab click-through).
- **Files affected:** 2 (1 modified canonical notebook, 1 new test module). No web source, no infra, no dependency changes. Independent of other recommendations — touches files no other rec touches (`canParallelize = true`).

## Decision Points
1. Scope of the new test: assert only .ipynb relative links, or both .ipynb AND .md relative links. RECOMMENDED: cover both — all 51 .md links already resolve today (verified), they are zero-cost to guard, and the GUIDE.md cross-section links (../GUIDE.md, ../../03-algorithms/GUIDE.md) are exactly the kind of path that silently breaks on a future renumber. Excluding .md would leave that navigation unguarded.
2. Whether to also scan code cells for links. RECOMMENDED: no — the verified finding and all real cross-notebook nav links live in markdown cells only; scanning code cells would add false positives (e.g. string literals, URLs in comments) for no benefit.
3. Whether to fold this into an existing test module (e.g. test_notebook_contract.py) or create a dedicated tests/test_notebook_links.py. RECOMMENDED: dedicated module — matches the one-concern-per-file convention already in tests/ (test_content_manifest.py, test_notebook_contract.py) and keeps the parametrized link IDs readable in pytest -v output.
4. Anchor handling: the regex strips #fragments before resolving. There are currently no intra-notebook #anchor links in the corpus, so no anchor-existence checking is needed (and JupyterLite does not support notebook heading anchors anyway). Keep it simple: strip and ignore anchors.

---

# Plan 6: Make the Braket budget alarm thresholds intent-explicit (percentage vs dollars)
**Complexity:** Low · **Time:** 20-40 minutes · **Files affected:** 1 · **Depends on:** none · **Parallelizable:** True

## Objective

Today `infra/cloudformation/braket-budget.yaml` declares three budget `Notification` blocks with `Threshold: 50`, `80`, and `100` and no `ThresholdType`. Per AWS CloudFormation docs, `ThresholdType` defaults to `PERCENTAGE`, so these literals mean 50%/80%/100% of `MonthlyBudget` — not $50/$80/$100. The numbers only *look* like dollars because `MonthlyBudget` defaults to `50` (50% of 50 = $25, etc.). When done, each `Notification` block will carry an explicit `ThresholdType: PERCENTAGE` plus a clarifying comment, so the intent is unambiguous in the template and the guardrail can never be misread as a dollar amount — closing the trap where a user who runs `deploy-infra.sh` with, say, `MonthlyBudget=200` is silently told the alerts fire at $100/$160/$200 when they look like $50/$80/$100.

## Prerequisites

- Read access to the repo (cwd is the repo root) and ability to edit `infra/cloudformation/braket-budget.yaml`.
- `cfn-lint` available for local validation. It is **not** currently installed and **not** in `pyproject.toml` — install it ad hoc in a throwaway venv (`pip install cfn-lint`) or use the bundled `awsiac` MCP `validate_cloudformation_template` tool. No repo dependency change is required for this fix.
- Knowledge that `AWS::Budgets::Budget` `Notification.ThresholdType` is **optional**, type `String`, allowed values `PERCENTAGE | ABSOLUTE_VALUE`, default `PERCENTAGE` (verified against the current AWS CloudFormation Template Reference — "AWS::Budgets::Budget Notification"; the `Threshold` property doc states "Thresholds are always a percentage").
- Assumption (recommended Option A): the existing behavior — alert at 50%/80%/100% of the monthly budget — is the *intended* behavior and only needs to be made explicit. This matches the deployed stack, so Option A is a no-op at the AWS API level and will not trigger a resource replacement on the next `cloudformation deploy`.
- Note: there is **no** CI gate that validates `infra/` CloudFormation today (CI's python job is `make test` + `make lint` (ruff only) + manifest-drift; no cfn-lint job). This fix therefore relies on local validation; wiring cfn-lint into CI is a separate, optional follow-up.

## Step-by-Step Implementation

### Option A (recommended — preserves current behavior, pure clarity fix)

**1. Edit `infra/cloudformation/braket-budget.yaml`.** Add `ThresholdType: PERCENTAGE` to each of the three `Notification` blocks and a one-line clarifying comment so the intent is self-documenting.

1.1 First `Notification` block (currently lines 28-31, `ACTUAL` / `Threshold: 50`). Change:

```yaml
        - Notification:
            NotificationType: ACTUAL
            ComparisonOperator: GREATER_THAN
            Threshold: 50
```

to:

```yaml
        # Thresholds are PERCENT of MonthlyBudget (the AWS default for
        # AWS::Budgets::Budget Notification), NOT dollar amounts. Stated
        # explicitly so the intent can't be misread as $50/$80/$100.
        - Notification:
            NotificationType: ACTUAL
            ComparisonOperator: GREATER_THAN
            Threshold: 50
            ThresholdType: PERCENTAGE
```

1.2 Second `Notification` block (currently lines 35-38, `ACTUAL` / `Threshold: 80`). Add `ThresholdType: PERCENTAGE` immediately after its `Threshold: 80` line, at the same indentation (12 spaces) as the sibling keys.

1.3 Third `Notification` block (currently lines 42-45, `FORECASTED` / `Threshold: 100`). Add `ThresholdType: PERCENTAGE` immediately after its `Threshold: 100` line, same 12-space indentation.

1.4 Edge cases / things to preserve:
- Do **not** change the `Threshold` numbers (50/80/100) — they are correct as percentages.
- Keep `BudgetLimit.Amount: !Ref MonthlyBudget` and `Unit: USD` unchanged; only the *notification* thresholds are percentage-based, the budget limit itself stays dollar-denominated.
- Keep two-space YAML indentation; `ThresholdType` must align with `NotificationType`/`ComparisonOperator`/`Threshold` (12 spaces under the `- Notification:` sequence item).
- Place the explanatory comment once (on the first block is sufficient); a short trailing `# percent of MonthlyBudget` may be appended to the 2nd/3rd `Threshold` lines if extra clarity is wanted.

**2. Leave `main.yaml` and `deploy-infra.sh` unchanged.** `main.yaml`'s `BudgetStack` (line 46) passes `MonthlyBudget` through unmodified — correct. `deploy-infra.sh`'s `Budget: $$BUDGET/month` echo (line 26) and `MonthlyBudget="$BUDGET"` override (line 41) refer to the *budget limit* (which IS dollars), so they remain accurate. Optional polish (only if doing a broader docs pass, otherwise skip to keep this change one-file): after the `echo "  Budget: \$$BUDGET/month"` line in `deploy-infra.sh`, add `echo "  Alerts at 50% / 80% (actual) and 100% (forecasted) of budget"`. Recommendation: keep this fix to the single template file and omit the script echo to minimize blast radius.

**3. Validate the template with cfn-lint.**

```bash
pip install cfn-lint   # in a throwaway venv if not present
cfn-lint infra/cloudformation/braket-budget.yaml
```

Expect zero findings. (`cfn-lint` independently knows `ThresholdType`'s allowed values and will flag a typo such as `PERCENT` instead of `PERCENTAGE`.) Alternatively, run the `awsiac` MCP `validate_cloudformation_template` tool against the file. Also lint the parent for safety: `cfn-lint infra/cloudformation/main.yaml` (it references the budget template via `TemplateURL`).

**4. Confirm no behavioral drift against a deployed stack (optional but recommended if a stack exists).** Run a change-set dry run so AWS reports the diff as a no-op:

```bash
aws cloudformation deploy \
  --template-file infra/cloudformation/main.yaml \
  --stack-name braket-quantum-workspace \
  --parameter-overrides MonthlyBudget=50 NotificationEmail=you@example.com DeployNotebook=false \
  --no-execute-changeset
```

Inspect the printed change set: the `BraketBudget` resource should show **Modify** with no replacement (adding an explicit value equal to the implicit default is a no-op at the API). If you have no live stack, skip this step.

### Option B (behavior-changing — only if dollar-denominated alerts were the actual intent)

5.1 In each `Notification` block set `ThresholdType: ABSOLUTE_VALUE` and replace the `Threshold` numbers with fixed dollar tiers, e.g. `Threshold: 25` / `40` / `50` (the dollar values that the default `MonthlyBudget=50` produces today). Note this **decouples** the alerts from `MonthlyBudget` — they no longer scale, which is usually undesirable for a parameterized budget, and `Threshold` is a CloudFormation `Number` (not a string), so you cannot compute `0.5 * MonthlyBudget` inline. This is why Option A is recommended.

5.2 If keeping the percentage *relationship* but wanting dollar display, the cleaner route is still Option A plus a docs/echo note (Step 2 polish) rather than ABSOLUTE_VALUE. Validate with the same `cfn-lint` step (3) and change-set dry run (4) — note that under Option B the change set WILL show a real (non-no-op) `Modify` to the budget, since the alert points actually move.

## File & Code Changes

| Action | File Path | Description of Change |
| --- | --- | --- |
| Modify | `infra/cloudformation/braket-budget.yaml` | Add `ThresholdType: PERCENTAGE` to all three `Notification` blocks (after each `Threshold:` line, 12-space indent) and a one-line comment above the first block stating thresholds are percent-of-`MonthlyBudget`, not dollars. (Option B: instead set `ThresholdType: ABSOLUTE_VALUE` with fixed dollar tiers — not recommended.) |
| Modify (optional, skip by default) | `infra/scripts/deploy-infra.sh` | After the `Budget: $$BUDGET/month` echo, optionally add a line clarifying alerts fire at 50%/80%/100% of budget. Omit to keep the change scoped to one file. |

No files are created or deleted. `infra/cloudformation/main.yaml` is read-only verified (plumbing already correct) and not edited.

## Testing & Validation

- **Static validation (primary gate, since no CI covers infra):** `cfn-lint infra/cloudformation/braket-budget.yaml` and `cfn-lint infra/cloudformation/main.yaml` both return zero findings. This is the authoritative check that `ThresholdType: PERCENTAGE` is a valid property/value and that YAML structure is intact. If using the `awsiac` MCP server, `validate_cloudformation_template` is equivalent.
- **YAML/template sanity:** confirm the file still parses and the three `ThresholdType` keys sit at the same indentation as their sibling `Threshold` keys (a misindented key would make it a child of the wrong map and cfn-lint would flag it).
- **Repo CI confirmation (no new tests required):** there are no Python `tests/` covering `infra/`, and `make lint` is `ruff` over Python only, so this change touches nothing the existing `python`, `web`, or `build-smoke` jobs run — all three remain green by construction. Run `make lint` once to confirm the YAML edit didn't accidentally trip anything (it won't; ruff ignores YAML).
- **Manual / intent verification:** read the diff and confirm the literals 50/80/100 are unchanged and now annotated; the comment makes the percent semantics explicit to the next reader.
- **End-to-end (optional, requires AWS creds):** run the Step 4 `--no-execute-changeset` dry run. Under Option A the change set is a no-op Modify on `BraketBudget` (proving deployed behavior is unchanged). Optionally, after an actual deploy, inspect the budget in the Billing console / `aws budgets describe-budget --account-id <id> --budget-name BraketQuantumWorkspaceBudget` and confirm the three notifications read as PERCENTAGE 50/80/100 — i.e. for a $50 budget they fire at $25/$40/$50, and for a $200 budget at $100/$160/$200 (the now-explicit, intended behavior).
- **Rollback verification:** the change is a single template file with a three-key addition; `git revert`/`git checkout` of `braket-budget.yaml` restores the prior file exactly. Because Option A only makes the existing default explicit, reverting does not change deployed behavior either. Re-run `cfn-lint` after a revert to confirm the original still lints clean.

## Risk & Mitigation

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Misindented `ThresholdType` key silently nests under the wrong map | Low | Medium | Run `cfn-lint` (catches schema/structure errors) and visually confirm 12-space alignment with sibling keys before committing. |
| Reader assumes Option B (dollar) intent and changes thresholds, altering when alerts fire | Low | Medium | The added comment states percent-of-budget explicitly; the plan documents Option B as separate and not recommended, with rationale (Threshold is a Number, can't scale with MonthlyBudget). |
| Wrong allowed value typed (e.g. `PERCENT`) | Low | High (deploy fails) | `cfn-lint` validates `ThresholdType` against `PERCENTAGE | ABSOLUTE_VALUE`; the exact string `PERCENTAGE` is copied from the AWS doc. |
| Change unexpectedly triggers budget resource replacement on next deploy | Very Low | Low | Adding an explicit value equal to the implicit default is a no-op; confirm via `--no-execute-changeset` dry run (Step 4) showing a no-op Modify. |
| No CI gate catches a future regression to this template | Medium | Low | Out of scope for this fix; note a follow-up to add a cfn-lint CI step. The explicit `ThresholdType` itself reduces the chance of a future misread. |

## Estimated Effort

- **Complexity:** Low — a three-key addition plus a comment in one YAML file; no logic, no dependencies, no behavior change under the recommended option.
- **Time:** 20-40 minutes including local `cfn-lint` setup and the optional change-set dry run.
- **Files affected:** 1 (`infra/cloudformation/braket-budget.yaml`); an optional 2nd file (`infra/scripts/deploy-infra.sh`) is recommended to skip.

## Decision Points
1. Option A (recommended) vs Option B: keep the current percent-of-budget alarm tiers and just make them explicit (A), OR switch to fixed dollar thresholds via ABSOLUTE_VALUE (B). A preserves today's deployed behavior and is a pure documentation/clarity fix; B changes when alerts fire and is only correct if dollar-denominated alerts were the original intent (the code, prompt, and default-50 coincidence suggest percentages were intended).
2. If Option B is chosen, decide how the three dollar tiers are derived: hard-coded literals (e.g. 25/40/50) lose the MonthlyBudget linkage, while a computed approach requires Fn::Sub/arithmetic that AWS::Budgets::Budget Threshold (a Number, not a string) cannot express directly — so B effectively forces hard-coded dollar tiers or new parameters. This is a strong argument for A.
3. Whether to additionally wire cfn-lint into CI as a new gate. Out of scope for this one-file fix (CI currently has no CloudFormation job); recommend a separate follow-up rather than expanding this change.

---

# Plan 7: Neutralize the destructive generate_notebooks.py scaffolder
**Complexity:** Low · **Time:** 15-30 minutes (Option A); 30-45 minutes (Option B) · **Files affected:** 2 · **Depends on:** none · **Parallelizable:** True

## Objective

`scripts/generate_notebooks.py` is a git-tracked one-shot scaffolder whose `create_notebook()` opens every target with `open(filepath, "w")` and **no existence/force/skip guard** (lines 47-48). It declares 39 fixed notebook paths across sections 01-06; all 39 currently exist as hand-authored notebooks (verified: 15-21 cells each). Running it from the repo root — which is the documented invocation — would silently truncate and overwrite all 39 with ~1-2KB 2-cell stubs (no browser-runnable marker, no objectives, no self-checks), with no warning or backup. When done, this footgun is removed (Option A, recommended) or made non-destructive (Option B), and the README no longer advertises a live, dangerous tool. Nothing in the build/CI references the script, so neutralizing it breaks no gates.

## Prerequisites

- Local clone at repo root (`/Users/cperez/dev/altivum-dev/quantum`), clean working tree on a fresh branch (do not work on `main`; it is branch-protected with 3 CI checks).
- `git`, `python3`, and (for Option B verification) the `[dev,full]` extras installed (`pip install -e '.[dev,full]'`) so `make test`/`make lint` run.
- `ruff` available (line-length 100, target py310) — invoked by `make lint`.
- Confirmed facts (already verified, no placeholders): the only references to `generate_notebooks` outside docs are gitignored `web/.next/**` build artifacts and dated historical planning notes under `docs/superpowers/`; it is NOT referenced by `Makefile`, `.github/workflows/ci.yml`, `build.sh`, `amplify.yml`, `pyproject.toml`, or `scripts/validate_runnable.py`. The README scripts-tree mention is at `README.md:294`.

## Step-by-Step Implementation

Two valid approaches. **Option A is recommended** (delete the obsolete scaffolder). Option B is the fallback if the team wants to keep it as documentation of the curriculum layout.

### Pre-work (both options)

1. Create a working branch.
   1.1. `git switch -c chore/neutralize-generate-notebooks-scaffolder`
   1.2. Confirm clean tree: `git status --porcelain` should be empty.
2. Re-confirm the script is inert in the toolchain (defense against regressions since the eval).
   2.1. `grep -rn "generate_notebooks" Makefile .github/workflows/ci.yml web/jupyterlite-build/build.sh amplify.yml pyproject.toml scripts/validate_runnable.py` — expect **zero** hits.
   2.2. `git ls-files scripts/generate_notebooks.py` — expect the path (confirms it is tracked).

### Option A — Delete the scaffolder (RECOMMENDED)

3. Remove the file from git and disk.
   3.1. `git rm scripts/generate_notebooks.py`
   3.2. If a stale bytecode cache exists, remove it (untracked, harmless either way): `rm -f scripts/__pycache__/generate_notebooks.*.pyc`
4. Update the README scripts-tree line so it no longer advertises the deleted tool.
   4.1. In `README.md` line 294, change `├── scripts/                 # validate_runnable.py · generate_notebooks.py` to list only the tools that still ship and are documentation-relevant. Recommended replacement: `├── scripts/                 # validate_runnable.py · gen_h2_fixture.py · build_tutor_corpus.mjs`. (The `scripts/` directory also contains `gen-tutor-core.mjs`; keep the comment concise — it is a tree summary, not an exhaustive listing. The key requirement is that the deleted `generate_notebooks.py` no longer appears.)
   4.2. Preserve exact box-drawing characters and column alignment so the fenced tree block in the README stays visually aligned.
5. (Optional, recommended to skip per decision point 3) Leave the historical `docs/superpowers/` planning notes untouched — they are dated records of past work, not live instructions.

### Option B — Keep the file, make it non-destructive (FALLBACK)

3. Add a skip-existing guard plus an explicit `--force` override to `scripts/generate_notebooks.py`.
   3.1. Add `import argparse`, `import sys`, and `from pathlib import Path` to the imports block (currently only `import json`).
   3.2. Change the `create_notebook` signature to accept a `force` flag and guard the write:
   ```python
   def create_notebook(filepath, title, description, section_guide, force=False):
       path = Path(filepath)
       if path.exists() and not force:
           print(f"skip (exists): {filepath}")
           return
       notebook = { ... }  # unchanged body
       with open(filepath, "w") as f:
           json.dump(notebook, f, indent=1)
       print(f"wrote: {filepath}")
   ```
   3.3. In the `__main__` block, parse args before the loops:
   ```python
   if __name__ == "__main__":
       parser = argparse.ArgumentParser(
           description="Scaffold starter notebooks. Existing files are skipped unless --force."
       )
       parser.add_argument(
           "--force",
           action="store_true",
           help="Overwrite existing notebooks (DESTRUCTIVE: truncates hand-authored content).",
       )
       args = parser.parse_args()
   ```
   3.4. Thread `force=args.force` through every `create_notebook(...)` call inside the six `for path, title, desc in ...` loops (six call sites).
   3.5. Optionally add a confirmation prompt when `--force` is set and any target already exists, so even the explicit destructive path requires interactive intent:
   ```python
   if args.force:
       existing = [p for (p, *_), in []]  # see note
   ```
   Simpler and sufficient: when `--force` is passed, print a one-line warning to stderr (`print("--force: overwriting existing notebooks", file=sys.stderr)`) before the loops. Keep it non-interactive so it stays scriptable; the skip-by-default behavior is the real safety net.
   3.6. Keep the final `print("All notebooks created successfully.")` but soften to `print("Scaffolding complete.")` since most runs will now skip everything.
4. Update the README line 294 comment to reflect the safer contract, e.g. annotate it as a scaffolder: `├── scripts/                 # validate_runnable.py · generate_notebooks.py (scaffolder, skips existing)`. This documents that re-running is safe.
5. Verify ruff cleanliness of the edited file (line-length 100): `ruff check scripts/generate_notebooks.py`.

### Edge cases (both options)

- **Untracked `__pycache__`**: `scripts/__pycache__/` holds compiled bytecode; it is not tracked and not part of the change. Do not `git add` it.
- **Gitignored build artifacts**: `web/.next/**` mentions of `generate_notebooks` are Next.js nft trace files, gitignored (`git check-ignore` confirms). Ignore them entirely.
- **nbstripout**: No `.ipynb` files are edited by this change, so the nbstripout filter quirk does not apply.
- **No manifest drift**: `validate_runnable.py --check` reads the runnable manifest, not this script; deleting/guarding the scaffolder does not touch any notebook content, so the manifest-drift gate is unaffected.

## File & Code Changes

### Option A (recommended)

| Action | File Path | Description of Change |
| --- | --- | --- |
| Delete | `scripts/generate_notebooks.py` | `git rm` the obsolete one-shot scaffolder; its 39 targets are all fully authored and it can only destroy them. |
| Modify | `README.md` (line 294) | Remove `generate_notebooks.py` from the `scripts/` line of the directory tree; replace with still-shipping scripts (`validate_runnable.py`, `gen_h2_fixture.py`, `build_tutor_corpus.mjs`), preserving tree alignment. |

### Option B (fallback)

| Action | File Path | Description of Change |
| --- | --- | --- |
| Modify | `scripts/generate_notebooks.py` | Add `argparse`/`pathlib`/`sys` imports; add `force` param to `create_notebook` with skip-if-exists guard (default safe); add `--force` CLI flag + stderr warning in `__main__`; thread `force=args.force` through all six call sites; per-file `skip`/`wrote` logging. |
| Modify | `README.md` (line 294) | Annotate the scripts-tree mention to document the new safe contract ("scaffolder, skips existing"). |

## Testing & Validation

**Option A:**
- Manual verification:
  - `test ! -f scripts/generate_notebooks.py && echo "deleted"` — confirms removal.
  - `grep -rn "generate_notebooks" README.md` — expect **zero** hits.
  - `git grep -n "generate_notebooks" -- ':!docs/superpowers/*'` — expect zero hits outside the intentionally-preserved historical notes.
- CI gates (must stay green; nothing in them touches the script, so this is a regression check, not a new test):
  - Python job: `make test` (full pytest, including slow), `make lint` (ruff), `python scripts/validate_runnable.py --check`.
  - Web job: unaffected (no web files changed) — `npm run lint && npm test` in `web/`.
  - Build-smoke: unaffected (`build.sh` does not invoke the script; `git diff --exit-code web/jupyterlite-build/jupyter_lite_config.json` stays clean).
- End-to-end confirmation: run the full Python CI locally — `make test && make lint && python scripts/validate_runnable.py --check` — and confirm green. Spot-check that a previously-targeted notebook is intact: `python3 -c "import json; print(len(json.load(open('01-foundations/notebooks/01-first-circuit.ipynb'))['cells']))"` still prints 15.
- Rollback verification: `git revert <commit>` (or `git checkout main -- scripts/generate_notebooks.py README.md`) restores the file and README line byte-for-byte; re-run `git ls-files scripts/generate_notebooks.py` to confirm it returns. Rollback is trivial because no other file depends on the script.

**Option B (in addition to the CI gates above):**
- New unit test `tests/test_generate_notebooks_guard.py` (pytest, runs under `make test`), using `tmp_path` and `monkeypatch.chdir(tmp_path)`:
  - `test_skips_existing`: create a sentinel file at a target path containing known unique bytes; call `create_notebook(path, ..., force=False)`; assert the sentinel content is unchanged (proves no truncation).
  - `test_force_overwrites`: pre-create a file; call with `force=True`; assert it now parses as the 2-cell stub (`len(cells) == 2`).
  - `test_writes_when_absent`: call with a non-existent path; assert the file is created and parses as valid nbformat-4 JSON with 2 cells.
  - `test_cli_default_is_skip`: invoke the module as a subprocess (`subprocess.run([sys.executable, "scripts/generate_notebooks.py"], cwd=repo_root)`) and assert all 39 hand-authored notebooks retain their original cell counts (compare a `git stash`-free snapshot, or assert each is >2 cells). This is the critical regression test that the *documented* invocation is now safe.
- Manual verification: from repo root, run `python scripts/generate_notebooks.py` and confirm output is all `skip (exists): ...` lines and that `git status --porcelain` is empty afterward (no notebook mutated). Then run `python scripts/generate_notebooks.py --force` against a throwaway copy directory only — never against the real tree.
- Rollback verification: `git revert <commit>` restores the original unguarded script; the new test file is removed by the revert. Confirm `make test` is still green post-revert.

## Risk & Mitigation

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| A future contributor or automation still expects `scripts/generate_notebooks.py` to exist (Option A) | Low | Low | Verified zero references in Makefile/CI/build/amplify/pyproject; only references are gitignored `.next` artifacts and dated historical `docs/superpowers/` notes. Deletion is fully recoverable via `git revert`. |
| README tree edit misaligns the fenced code block or drops a still-relevant script | Low | Low | Edit only the comment after `scripts/`; preserve box-drawing chars and column width; visually diff the rendered tree; `npm`/`make` gates unaffected. |
| Option B guard introduced a regression (e.g. `--force` default flipped, or threading missed a call site) that still truncates | Low | High | Default behavior is skip-existing; the `test_cli_default_is_skip` subprocess test asserts the *documented* root invocation mutates nothing; ruff + review confirm all six call sites pass `force=args.force`. |
| Reviewer disagrees with deletion and prefers retention | Medium | Low | This is captured as decision point 1; present both options in the PR description and let the maintainer choose. Both options remove the footgun. |
| Touching the historical `docs/superpowers/` notes rewrites the record-of-work | Low | Low | Explicitly leave them untouched (decision point 3); they are dated plans, not live docs. |

## Estimated Effort

- Complexity: **Low**.
- Time: **15-30 min** for Option A (delete + one README line + run CI locally); **30-45 min** for Option B (guard logic + CLI flag + a small pytest module + CI run).
- Files affected: **2** (Option A: delete `scripts/generate_notebooks.py`, modify `README.md`. Option B: modify `scripts/generate_notebooks.py`, modify `README.md`, plus 1 new test file under `tests/`).

## Decision Points
1. Option A (git rm the script + remove the README mention) vs Option B (keep it for documentation, add an existence guard / --force flag). Recommend Option A: the curriculum is fully authored (all 39 targets exist as 15-21 cell hand-authored notebooks), the one-shot scaffolder has served its purpose, and the stubs it writes are obsolete (no browser-runnable marker, no objectives/self-checks).
2. If Option B is chosen: whether to default to skip-existing (safest, idempotent re-run produces nothing) or to gate ALL writes behind an explicit --force flag (most defensive). Recommend skip-existing as the default behavior PLUS a --force override, so the script remains usable for genuinely new sections without ever silently truncating authored work.
3. Whether to delete the historical docs/superpowers/ planning-note references too. Recommend leaving them untouched: they are dated historical plans (2026-05-17, 2026-06-06), not live docs, and rewriting history-of-record notes adds noise without value.

---

# Plan 8: Eliminate the Pyodide CDN single point of failure (self-host pinned core + SRI fallback + clear remediation)
**Complexity:** Medium · **Time:** 4-7 hours · **Files affected:** 5 · **Depends on:** none · **Parallelizable:** True

## Objective

Today every runnable lesson cell and the Tier-py challenge grader boot Python by fetching `pyodide.js` and the Pyodide core/stdlib (~10 MB) from `cdn.jsdelivr.net` with **no Subresource Integrity, no fallback origin, and no self-host** (`web/src/lib/pyodide-runtime.ts` lines 12-13, 49-51). If jsdelivr is blocked (corporate proxy, ad-blocker, GFW, CDN outage) the learner sees a bare `Couldn't start Python: failed to load https://cdn.jsdelivr.net/...` with no remediation, and the site ships executable third-party JS+WASM with no integrity check. When done, the lesson runtime loads a **version-pinned Pyodide distribution self-hosted under same-origin `/pyodide/`** (mirroring how the lab already self-hosts the qcsim wheel from `/lab/files/wheels/`), with the CDN retained only as an automatic fallback, an SRI hash protecting the bootstrap script, and a clear, actionable error message when both origins fail. This removes the third-party single point of failure for the lesson runtime and closes the supply-chain gap.

## Prerequisites

- Node 22 + npm (the `NODE_VERSION` in `.github/workflows/ci.yml`); Python 3.10+ for `build.sh`.
- `web/` deps installed (`cd web && npm ci`) so `npm test` / `npm run build` / `npm run lint` run.
- `curl`/`tar` available in the build environment and CI runner (already true on ubuntu-latest and Amplify's Amazon Linux image) to download + unpack the pinned Pyodide tarball during `build.sh`.
- Knowledge: the lesson runtime (`pyodide-runtime.ts`, Pyodide **0.27.7**) is **separate** from the in-browser lab kernel (JupyterLite `jupyterlite-pyodide-kernel==0.7.0`, which loads Pyodide **0.29.0** from jsdelivr — observed in `public/lab/extensions/@jupyterlite/pyodide-kernel-extension/static/*.js`). This plan fixes the lesson runtime, which is the directly-controlled, source-level CDN load. The lab kernel's separate CDN dependency is documented as a follow-up decision point, not changed here (changing it means re-pinning JupyterLite, a much larger build change).
- Assumption: Amplify's static export ships everything under `web/public/` at the site root, so files placed in `web/public/pyodide/` are served same-origin at `/pyodide/...` exactly like `/lab/files/wheels/...`.
- Pinned version is `0.27.7` (must stay identical between the self-hosted assets and `PYODIDE_VERSION`).

## Step-by-Step Implementation

**Decision (resolve first — see Decision Points): this plan implements Option B (self-host pinned core) + Option C (CDN fallback + clear error) + the cheap part of Option A (SRI on `pyodide.js`). If the build-artifact size or Amplify build-time cost is unacceptable, fall back to A+C only (SRI + fallback origin + error message, no self-host) — Step 1.x notes which steps to drop.**

### 1. Verify the exact current load mechanism and pinned version (LEAD verification — do this first)

1.1 Confirm the single source-level CDN consumer and version:
```
cd web
grep -rn "cdn.jsdelivr\|PYODIDE_VERSION\|PYODIDE_BASE\|loadPyodide\|indexURL" src/
```
Expected: only `src/lib/pyodide-runtime.ts` matches — `PYODIDE_VERSION = "0.27.7"` (line 12), `PYODIDE_BASE = https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/` (line 13), `loadScript(${PYODIDE_BASE}pyodide.js)` (line 49), `loadPyodide({ indexURL: PYODIDE_BASE })` (line 51). `pyodide-run.ts` and `pyodide-grader.ts` consume it only via `getPyodide()`; they hold no URL.

1.2 Confirm the lab kernel is a separate dependency (do NOT change it here):
```
grep -rho "cdn.jsdelivr.net[^\"' )]*" public/lab 2>/dev/null | sort -u
```
Expected: `cdn.jsdelivr.net/pyodide/v0.29.0/full/pyodide.js` (JupyterLite's bundled kernel default). Record this in the PR description as a known, out-of-scope follow-up.

1.3 Confirm the wheel-self-host precedent and that `public/` is gitignored for `/lab/` only (so a new `public/pyodide/` would also need a gitignore entry if generated by build.sh):
```
sed -n '24,30p' .gitignore        # /public/lab/ is ignored
ls -la public/lab/files/wheels/    # qcsim wheel served same-origin
```

1.4 Capture the SRI hash for the pinned `pyodide.js` (used in Step 4). Run from a trusted network:
```
curl -fsSL https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.js | openssl dgst -sha384 -binary | openssl base64 -A
```
Record the output as `sha384-<HASH>`. (`pyodide.js` is ~14.9 KB, so SRI is cheap and only guards the bootstrap loader script; the larger `pyodide.asm.wasm` / stdlib are integrity-checked by Pyodide's own loader against its packaged lockfile, so SRI on the bootstrap is the meaningful supply-chain guard.)

### 2. Self-host the pinned Pyodide distribution in build.sh (Option B — drop this whole step for A+C-only)

2.1 Add a new step to `web/jupyterlite-build/build.sh` after step 1 (deps) and before step 8 (source-map strip), that downloads and unpacks the pinned Pyodide **core** distribution into the static-export public tree. Use the GitHub release tarball (`pyodide-core-<ver>.tar.bz2`, ~5.6 MB compressed, ~10 MB unpacked — the "core" build excludes the large optional scientific packages we don't use), pinned to the SAME version the runtime declares. Insert after line 17 (`pip install ... requirements.txt`) a self-contained block:
```bash
# 1b) Self-host the pinned Pyodide runtime under ../public/pyodide so the lesson
#     runtime (src/lib/pyodide-runtime.ts) boots from same-origin instead of a
#     third-party CDN. Version MUST match PYODIDE_VERSION in that file.
PYODIDE_VERSION="0.27.7"
PYODIDE_DEST="../public/pyodide"
PYODIDE_TARBALL="pyodide-core-${PYODIDE_VERSION}.tar.bz2"
PYODIDE_URL="https://github.com/pyodide/pyodide/releases/download/${PYODIDE_VERSION}/${PYODIDE_TARBALL}"
echo "==> Self-hosting Pyodide ${PYODIDE_VERSION} -> ${PYODIDE_DEST}"
rm -rf "$PYODIDE_DEST"
mkdir -p "$PYODIDE_DEST"
curl -fsSL --retry 3 "$PYODIDE_URL" -o "/tmp/${PYODIDE_TARBALL}"
# Tarball unpacks to a top-level pyodide/ dir; flatten it into PYODIDE_DEST.
tar -xjf "/tmp/${PYODIDE_TARBALL}" -C "/tmp"
cp -R /tmp/pyodide/. "$PYODIDE_DEST"/
rm -f "/tmp/${PYODIDE_TARBALL}"
# Sanity: the bootstrap script the runtime loads must exist.
test -f "$PYODIDE_DEST/pyodide.js" || { echo "pyodide.js missing after self-host"; exit 1; }
```
Edge cases the block covers: `set -euo pipefail` (already at top of build.sh) aborts the build if the download or extraction fails, so a partial/corrupt self-host can never silently ship; `--retry 3` rides out a transient blip; `rm -rf` before unpack keeps a re-run idempotent.

2.2 Pin the version in ONE place to prevent drift: read `PYODIDE_VERSION` from the runtime file rather than hard-coding it twice. Replace the literal in 2.1 with a parse of the TS constant:
```bash
PYODIDE_VERSION=$(grep -oE 'PYODIDE_VERSION *= *"[0-9.]+"' ../src/lib/pyodide-runtime.ts | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
test -n "$PYODIDE_VERSION" || { echo "could not parse PYODIDE_VERSION from pyodide-runtime.ts"; exit 1; }
```
This makes the runtime file the single source of truth; bumping `PYODIDE_VERSION` there automatically re-self-hosts the matching distribution.

2.3 Add `/public/pyodide/` to `web/.gitignore` directly under the existing `/public/lab/` line (line 27), since it is a regenerated build artifact, never committed.

### 3. Point the runtime at same-origin first, CDN as fallback (Options B + C)

3.1 In `web/src/lib/pyodide-runtime.ts`, replace the single CDN constant with a primary (same-origin) base and a CDN fallback base. After line 13:
```ts
const PYODIDE_VERSION = "0.27.7";
// Same-origin self-hosted distribution (staged into public/pyodide by
// jupyterlite-build/build.sh). Primary so a blocked/owned third-party CDN never
// bricks every runnable cell + the grader. CDN kept only as automatic fallback.
const PYODIDE_LOCAL_BASE = "/pyodide/";
const PYODIDE_CDN_BASE = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
const PYODIDE_SRI = "sha384-<HASH FROM STEP 1.4>"; // integrity for the CDN bootstrap script
```

3.2 Replace `loadScript` (lines 35-44) with a version that accepts an optional `integrity` + `crossorigin` and, when adding the CDN `<script>`, sets `integrity` and `crossOrigin="anonymous"` (SRI requires CORS). Keep the existing "already injected" short-circuit. Same-origin loads need no integrity attribute (browser same-origin trust + the asset is ours):
```ts
function loadScript(src: string, integrity?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    if (integrity) {
      s.integrity = integrity;
      s.crossOrigin = "anonymous";
    }
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(s);
  });
}
```

3.3 Rework the boot IIFE in `getPyodide` (lines 48-63) to try same-origin first, then fall back to the CDN, then surface a clear remediation message. Replace the body that loads the script + calls `loadPyodide`:
```ts
pyodidePromise = (async () => {
  const base = await bootFrom(PYODIDE_LOCAL_BASE).catch(() => bootFrom(PYODIDE_CDN_BASE, PYODIDE_SRI));
  // base is the resolved indexURL; loadPyodide + wheel install happen inside bootFrom
  return base;
})();
```
and add a private helper that does the per-origin sequence so each origin is attempted atomically:
```ts
async function bootFrom(base: string, integrity?: string): Promise<Pyodide> {
  await loadScript(`${base}pyodide.js`, base === PYODIDE_LOCAL_BASE ? undefined : integrity);
  if (!window.loadPyodide) throw new Error("Pyodide runtime did not load");
  const py = await window.loadPyodide({ indexURL: base });
  await py.loadPackage("micropip");
  const wheelUrl = new URL(`/lab/files/wheels/${getWheelName()}`, window.location.origin).href;
  await py.runPythonAsync(
    `import micropip\n` +
      `await micropip.install(${JSON.stringify(wheelUrl)})\n` +
      `import qcsim  # registers the braket.* aliases\n`
  );
  return py;
}
```
Edge cases: if same-origin succeeds, the CDN is never contacted (no third-party request at all in the common case). If `loadScript` for `/pyodide/pyodide.js` injects a `<script>` then the CDN fallback injects a *different* src, the existing querySelector short-circuit is keyed on `src`, so the two are independent and a fallback after a same-origin failure still injects. The boot-cache-clear `pyodidePromise.catch(() => { pyodidePromise = null; })` (lines 67-69) is unchanged and still re-boots after a double failure.

3.4 Improve the remediation message at the point it reaches the user. The consumers already wrap with `Couldn't start Python: ${message}` (`pyodide-run.ts` line 21, `pyodide-grader.ts` line 32). Make the thrown message actionable: when both origins fail, throw from `getPyodide` a message like `couldn't load the Python runtime from this site or the CDN — check your network/ad-blocker/proxy and reload`. Implement by catching the CDN failure and rethrowing:
```ts
const base = await bootFrom(PYODIDE_LOCAL_BASE).catch(() =>
  bootFrom(PYODIDE_CDN_BASE, PYODIDE_SRI).catch(() => {
    throw new Error(
      "couldn't load the Python runtime from this site or the CDN. " +
      "A network block, proxy, or ad-blocker may be preventing it — check your connection and reload."
    );
  })
);
```
This renders in `runnable-editor.tsx` (line 136 surfaces `result.error`) and the grader, so the learner gets a remediation hint instead of a raw URL.

### 4. Keep the build-smoke + manifest-drift gates green

4.1 The build-smoke job (`.github/workflows/ci.yml` lines 96-161) runs `build.sh`, then `git diff --exit-code -- web/jupyterlite-build/jupyter_lite_config.json` (line 132). Our build.sh change does NOT touch `jupyter_lite_config.json`, so that gate is unaffected. Confirm by running `bash web/jupyterlite-build/build.sh` locally and then `git diff --exit-code -- web/jupyterlite-build/jupyter_lite_config.json` (must exit 0).

4.2 The Playwright Pyodide smoke (`web/e2e/lab-pyodide.e2e.ts`) exercises the **lab** kernel, not the lesson runtime, so it is unaffected. Verify it still passes after `npm run build` (it reuses `web/out` + `web/public/lab`). Note the new `web/public/pyodide/` is also present in the export and ships at `/pyodide/`.

4.3 Add a CI guard that the self-hosted version matches the runtime constant (prevents a silent self-host/runtime version skew). In the build-smoke job, after the build step, assert the staged distribution's version equals the runtime's:
```yaml
- name: Assert self-hosted Pyodide version matches runtime constant
  run: |
    test -f web/public/pyodide/pyodide.js || { echo "self-hosted pyodide missing"; exit 1; }
    grep -q "0.27.7" web/public/pyodide/pyodide-lock.json || { echo "self-hosted pyodide version mismatch"; exit 1; }
```
(Use whichever versioned file is present in the unpacked core tarball — `pyodide-lock.json` carries the version; confirm its filename during Step 1 by listing the unpacked dir.)

## File & Code Changes

| Action | File Path | Description of Change |
| --- | --- | --- |
| Modify | `/Users/cperez/dev/altivum-dev/quantum/web/src/lib/pyodide-runtime.ts` | Add `PYODIDE_LOCAL_BASE = "/pyodide/"`, keep `PYODIDE_CDN_BASE` (renamed from `PYODIDE_BASE`) and `PYODIDE_SRI`. Extend `loadScript` to accept optional `integrity` + set `crossOrigin`. Refactor `getPyodide`'s boot IIFE to a `bootFrom(base, integrity?)` helper, try same-origin then CDN-with-SRI, and rethrow an actionable remediation message on double failure. Boot-cache-clear logic unchanged. |
| Modify | `/Users/cperez/dev/altivum-dev/quantum/web/jupyterlite-build/build.sh` | New step (after deps install) that parses `PYODIDE_VERSION` from `pyodide-runtime.ts`, downloads the pinned `pyodide-core-<ver>.tar.bz2` from the GitHub release, unpacks/flattens it into `../public/pyodide/`, and asserts `pyodide.js` exists (build aborts on any failure via existing `set -euo pipefail`). |
| Modify | `/Users/cperez/dev/altivum-dev/quantum/web/.gitignore` | Add `/public/pyodide/` under the existing `/public/lab/` ignore (regenerated artifact, never committed). |
| Modify | `/Users/cperez/dev/altivum-dev/quantum/.github/workflows/ci.yml` | In `build-smoke`, add an assertion that `web/public/pyodide/pyodide.js` exists and its lockfile carries the pinned version, catching any self-host/runtime version skew. |
| Modify | `/Users/cperez/dev/altivum-dev/quantum/web/__tests__/lib/pyodide-runtime.boot.test.ts` | Update / extend the boot test: pre-inject the same-origin `/pyodide/pyodide.js` script (current test pre-injects the jsdelivr URL); add a case proving same-origin failure falls back to the CDN, and a case proving a double failure throws the actionable remediation message. |

## Testing & Validation

**Unit tests (jest, `cd web && npm test`):**
- Extend `web/__tests__/lib/pyodide-runtime.boot.test.ts`:
  - Existing "re-boots after a failed boot" case: keep, but pre-inject `/pyodide/pyodide.js` (same-origin primary) so the loader short-circuits and `window.loadPyodide` drives the result — confirms the primary path still memoizes/clears correctly.
  - New: same-origin `loadPyodide` rejects once, CDN base succeeds → `getPyodide()` resolves; assert `loadPyodide` was called with `indexURL: "/pyodide/"` first then the jsdelivr base (fallback ordering).
  - New: both bases reject → `getPyodide()` rejects with a message matching `/runtime from this site or the CDN/i` (actionable remediation), and the boot cache is cleared (a second call re-attempts).
- `web/__tests__/lib/pyodide-run.test.ts` and the grader's tests already mock `@/lib/pyodide-runtime`, so they are insulated from the URL change — run them to confirm no regression (`npm test`).
- Run `npm run lint` (ESLint gate in the web CI job) — the new `bootFrom`/`integrity` code must be lint-clean.

**Manual / real-path verification (per project rule: green tests are NOT proof it works):**
1. `cd web/jupyterlite-build && bash build.sh` → confirm `web/public/pyodide/pyodide.js` and the lockfile exist; confirm `git diff --exit-code -- web/jupyterlite-build/jupyter_lite_config.json` exits 0 (drift gate intact).
2. `cd web && npm run build` then serve `web/out` (e.g. `npx serve web/out`); open a lesson with a runnable cell, run it, and confirm Python boots and prints output. In DevTools → Network, confirm `pyodide.js` and the WASM/stdlib load from `/pyodide/...` (same-origin), with **zero** requests to `cdn.jsdelivr.net` for the lesson runtime.
3. Simulate the CDN-blocked scenario the recommendation targets: in DevTools, the same-origin load should already cover it; additionally block `/pyodide/*` (DevTools request blocking) and confirm the boot falls back to the CDN with the SRI'd script and still works — then block BOTH and confirm the learner sees the actionable remediation message (not a raw URL) in the runnable editor output panel and the grader.
4. SRI sanity: temporarily corrupt the `PYODIDE_SRI` constant, force the CDN fallback, and confirm the browser refuses the script (integrity failure) → proves SRI is wired.

**End-to-end confirmation:** the existing Playwright smoke (`npx playwright test` in `web/`) exercises the lab kernel; run it to confirm the lab path is untouched. For the lesson runtime, the manual step 2-3 above is the e2e proof (no automated lesson-runtime browser smoke exists today; optionally add one as follow-up).

**Rollback verification:** revert the four production files (runtime, build.sh, ci.yml, .gitignore); run `bash build.sh` (no `public/pyodide/` produced) and `npm test` — the runtime reverts to the single CDN load, all tests green. Because `/pyodide/` is gitignored and regenerated, there is no committed artifact to clean up; a rollback is purely code.

## Risk & Mitigation

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Self-hosted Pyodide version drifts from `PYODIDE_VERSION` after a future bump | Medium | High (subtle runtime/loader mismatch) | Single source of truth: build.sh parses the version from `pyodide-runtime.ts`; CI build-smoke asserts the staged lockfile carries that exact version (Step 4.3). |
| Pyodide GitHub release download fails/slow during Amplify/CI build | Low | Medium (build fails) | `curl --retry 3` + `set -euo pipefail` aborts loudly rather than shipping a partial self-host; Amplify caches restore between builds; failure is a build error, never a broken deploy. |
| Self-host adds ~5.6 MB compressed (~10 MB unpacked) to the static export, raising build time / Amplify cache size | Medium | Low | Use the "core" tarball (excludes large optional sci packages); strip is unnecessary since core is already minimal; if unacceptable, fall back to A+C-only (SRI + CDN fallback, no self-host). |
| SRI hash becomes stale if the CDN re-publishes `pyodide.js` (jsdelivr immutably versions, so unlikely) | Low | Medium (CDN fallback blocked by integrity) | Same-origin is primary so SRI only gates the rare fallback; document the recompute command (Step 1.4); jsdelivr `/pyodide/vX.Y.Z/` paths are version-immutable. |
| Static export serves `/pyodide/` but a hosting/redirect rule intercepts it | Low | Medium | Mirrors the proven `/lab/files/...` same-origin pattern under the same `public/` root; manual Network-tab check (Testing step 2) confirms 200s from `/pyodide/`. |
| Lab kernel's separate jsdelivr dependency (Pyodide 0.29.0) remains a SPOF | Known | Medium | Explicitly out of scope here (re-pinning JupyterLite is a larger change); documented in the PR + as decision point for a follow-up. |

## Estimated Effort

- **Complexity:** Medium (one focused runtime refactor with fallback + SRI, one build-script download/stage step, and CI/gitignore wiring; no new components, reuses the proven wheel-self-host pattern).
- **Time range:** 4-7 hours including the real-path browser verification of all three failure modes (same-origin OK, CDN fallback, double-failure remediation) and SRI tamper check.
- **Files affected:** 5 (`web/src/lib/pyodide-runtime.ts`, `web/jupyterlite-build/build.sh`, `web/.gitignore`, `.github/workflows/ci.yml`, `web/__tests__/lib/pyodide-runtime.boot.test.ts`).

## Decision Points
1. Which option(s) to ship: recommended B+C+SRI (self-host pinned core as primary, CDN as SRI-protected fallback, actionable error) vs. the lighter A+C-only (SRI + CDN fallback + better error, NO self-host) if the ~5.6 MB compressed build-artifact size / Amplify build-time cost is unacceptable.
2. Whether to also address the SECOND, separate CDN dependency discovered during verification: the in-browser lab kernel (JupyterLite pyodide-kernel 0.7.0) independently loads Pyodide 0.29.0 from cdn.jsdelivr.net at runtime. Fixing it requires re-pinning JupyterLite's kernel pyodideUrl and is a larger build change — recommend handling as a separate follow-up, not in this PR.
3. Exact self-host source: GitHub release 'pyodide-core-0.27.7.tar.bz2' (recommended, ~5.6 MB, excludes heavy optional packages) vs. the larger 'full' distribution. Confirm the unpacked dir's version-carrying filename (pyodide-lock.json) during Step 1 for the CI version-match assertion.
4. Whether to add a new automated browser smoke for the LESSON runtime (none exists today; the Playwright smoke only covers the lab kernel). Optional follow-up; manual Network-tab verification is the e2e proof in this plan.

---

# Plan 9: Add per-IP abuse/rate protection to the public tutor Function URL
**Complexity:** Medium · **Time:** 1.5–3 days (Option A: CloudFront+WAF); ~0.5 day (Option C: in-Lambda limiter stopgap) · **Files affected:** 6 · **Depends on:** none · **Parallelizable:** True

## Objective

Today the public tutor endpoint (`lambda/tutor/template.yaml`, Function URL with `AuthType: NONE`, `InvokeMode: RESPONSE_STREAM`) has exactly one hard control — `ReservedConcurrentExecutions` (default 5) — and CORS that does not stop scripted clients. A bot can keep all 5 concurrent ~800-token Haiku generations busy 24/7, fully billable and denying real learners. When done, every request to the tutor passes through a per-source-IP rate limit that returns HTTP 429 (or is rejected in-handler) before it can fan out into a paid Bedrock generation, so a single abuser can no longer monopolize the concurrency cap or run up Bedrock spend. The streaming UX for legitimate learners is unchanged.

This plan presents the three real options (WAF cannot attach directly to a Lambda Function URL — verified against current AWS docs), recommends **Option A (CloudFront + WAF rate-based rule)** as the durable fix for a public edge endpoint, and gives **Option C (in-Lambda per-IP limiter)** as a same-day stopgap that needs no new front door. Do one; they are complementary (ship C now, A later).

## Prerequisites

- AWS CLI v2 + SAM CLI configured for the deploy account (the live profile per `policy.json` is account `205930636302`, region `us-east-2`; the inference profile is `arn:aws:bedrock:us-east-2:205930636302:application-inference-profile/q050egz0q4mb`).
- Permission to create CloudFront distributions, WAFv2 web ACLs (**CLOUDFRONT scope = us-east-1/global**), and to run `aws lambda add-permission` (OAC resource policy must be set via CLI — the Lambda console cannot edit it).
- `cfn-lint` for template validation (CI already runs the IaC gate elsewhere; validate locally too).
- Knowledge of the verified AWS constraints below; do not deviate from them:
  - **WAF cannot be associated with a Lambda Function URL directly.** WAFv2 web ACLs attach only to CloudFront, ALB, API Gateway, AppSync, Cognito, App Runner, Verified Access. (Confirmed: WAF/CloudFront and WAF/API Gateway developer-guide pages; no Lambda-Function-URL association exists.)
  - **CloudFront CAN use a Lambda Function URL as an origin and protect it with WAF**, but to lock the origin down it uses **Origin Access Control (OAC)**, which **requires the Function URL's `AuthType` to be `AWS_IAM`** and CloudFront signs each request with SigV4. (Confirmed: "Restrict access to an AWS Lambda function URL origin", CloudFront Developer Guide.)
  - **For `POST`/`PUT` through OAC, the client must compute the SHA-256 of the body and send it in the `x-amz-content-sha256` header** — "Lambda doesn't support unsigned payloads." This is the decisive UX wrinkle for this streaming POST endpoint (see Decision Points).
  - **WAF rate-based rules** aggregate by source IP by default over a configurable window (60–600 s), action Block returns 429; an optional scope-down statement can narrow what's counted. (Confirmed: "Using rate-based rule statements in AWS WAF".)
  - **The Function URL event (payload format 2.0) exposes the caller IP at `event.requestContext.http.sourceIp`** — usable directly for an in-Lambda limiter. (Confirmed: "Invoking Lambda function URLs".)
  - **API Gateway (Option B) is rejected**: HTTP/REST APIs support native throttling + usage plans + WAF, but **do not support Lambda response streaming**, which would break the whole "Ask the margin" streaming UX. Documented as rejected, not implemented.

## Step-by-Step Implementation

> Choose ONE primary path. Steps 1–4 = Option A (recommended). Step 5 = Option C (stopgap). Step 6 = docs/tests common to whichever you pick.

### 1. (Option A) Switch the Function URL to AWS_IAM and add CloudFront + WAF in the SAM template

1.1 In `lambda/tutor/template.yaml`, change `FunctionUrlConfig.AuthType` from `NONE` to `AWS_IAM` (OAC prerequisite). Keep `InvokeMode: RESPONSE_STREAM` and the existing `Cors` block (CloudFront forwards the browser's `Origin`; CORS still governs browser-visible responses).

1.2 Add a new parameter `PriceClass` (Default `PriceClass_100`) and keep `AllowedOrigin` as-is (now also the CloudFront-allowed origin behavior).

1.3 Add a **CLOUDFRONT-scope** WAFv2 web ACL. Because CloudFront-scope WAF must live in `us-east-1`, this stack must be deployed (or this resource carved out) in `us-east-1` even though the Lambda is in `us-east-2` — OR keep the Lambda stack in us-east-2 and create the CloudFront+WAF in a **separate us-east-1 stack** that references the Function URL output (recommended to avoid a cross-region single-stack). Plan for the separate-stack split:

   - New file `lambda/tutor/edge.yaml` (us-east-1) defining:
     - `AWS::WAFv2::WebACL` `Scope: CLOUDFRONT`, `DefaultAction: Allow`, one rule:
       - `RateBasedStatement` with `AggregateKeyType: IP`, `Limit: 300`, `EvaluationWindowSec: 60` (start conservative: 300 req / 60 s / IP — far above a real learner, well below abuse). `Action: Block` (returns 429). `VisibilityConfig` with `SampledRequestsEnabled: true`, `CloudWatchMetricsEnabled: true`, `MetricName: quantumTutorRateLimit`.
     - `AWS::CloudFront::OriginAccessControl` with `OriginAccessControlOriginType: lambda`, `SigningBehavior: always`, `SigningProtocol: sigv4`.
     - `AWS::CloudFront::Distribution` with one origin = the Function URL domain (parameter `FunctionUrlDomain`, the host part of the us-east-2 `TutorUrl` output), `OriginAccessControlId` referencing the OAC, `CustomOriginConfig` `OriginProtocolPolicy: https-only`. `DefaultCacheBehavior`: `ViewerProtocolPolicy: redirect-to-https`, `AllowedMethods: [GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE]`, **caching disabled** (use the managed `CachingDisabled` policy id `4135ea2d-6df8-44a3-9df3-4b5a84be39ad`) so streamed/dynamic responses are never cached, and an `OriginRequestPolicy` that forwards `content-type` + the `x-amz-content-sha256` header (use a custom policy forwarding the needed headers; do not forward `Host`). Attach `WebACLId: !GetAtt TutorWebAcl.Arn`.
     - Output `DistributionDomainName` (`xxxx.cloudfront.net`) and `DistributionId`.

1.4 The Function URL resource policy must allow the CloudFront service principal scoped to the distribution. SAM/CloudFormation cannot express the OAC resource policy on the implicit Function URL cleanly, so after `sam deploy` of both stacks, run the documented CLI grant (record it in the README and in a `lambda/tutor/scripts/grant-oac.sh` helper):

```bash
aws lambda add-permission --function-name quantum-tutor \
  --statement-id AllowCloudFrontOAC \
  --action lambda:InvokeFunctionUrl \
  --principal cloudfront.amazonaws.com \
  --source-arn arn:aws:cloudfront::205930636302:distribution/<DistributionId> \
  --region us-east-2
```

(Verified command form from the CloudFront "Restrict access to a Lambda function URL origin" page.)

### 2. (Option A) Make the browser client send the OAC-required body hash

2.1 In `web/src/components/ask-tutor.tsx`, point `NEXT_PUBLIC_TUTOR_URL` at the CloudFront domain (operational, no code change) and add the `x-amz-content-sha256` header to the `fetch` in `ask()` (currently lines ~104–109). Compute it with `SubtleCrypto` over the exact JSON body:

```ts
const bodyStr = JSON.stringify({ slug, question: q });
const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(bodyStr));
const sha = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
const res = await fetch(url, {
  method: "POST",
  headers: { "content-type": "application/json", "x-amz-content-sha256": sha },
  body: bodyStr,
  signal: controller.signal,
});
```

   - Put the digest helper in a small pure module `web/src/lib/sha256.ts` (one exported `sha256Hex(s: string): Promise<string>`), matching the repo's pure-logic-module convention, so it is unit-testable. `crypto.subtle` requires a secure context — fine, the site is HTTPS-only.
   - Edge case: `crypto.subtle` is undefined in non-secure/test contexts — guard and fall back to no header only when `crypto?.subtle` is absent (so jsdom tests don't throw); production always has it.

2.2 If the team prefers **not** to touch the client (Decision Point 2), keep `AuthType: NONE`, skip OAC, and instead add a CloudFront `OriginCustomHeaders` shared secret (e.g. `X-Tutor-Edge: <random>`) and have the handler in `index.mjs` reject any request lacking it. This makes CloudFront the only viable path without breaking POST signing, at the cost of a weaker (secret-in-config) guarantee. Recommended only if the SHA-256 client change is undesirable.

### 3. (Option A) Re-point the frontend and the SNS/alarm wiring

3.1 Update `NEXT_PUBLIC_TUTOR_URL` in the Amplify app env to the CloudFront `https://<DistributionDomainName>/` value; redeploy. The existing `quantum-tutor-high-invocations` Lambda-Invocations alarm stays valid. Optionally add a WAF `BlockedRequests` CloudWatch alarm on `MetricName quantumTutorRateLimit` to observe abuse being shed.

### 4. (Option A) Validate and deploy

4.1 `cfn-lint lambda/tutor/template.yaml lambda/tutor/edge.yaml`.
4.2 `cd lambda/tutor && sam build && sam deploy` (us-east-2 stack), then deploy `edge.yaml` in us-east-1 with `FunctionUrlDomain` set to the host of `TutorUrl`. Run the Step 1.4 grant.
4.3 Live verification in Testing section.

### 5. (Option C) In-Lambda per-IP sliding-window limiter (stopgap, no new front door)

5.1 Create a pure module `lambda/tutor/rate-limit.mjs` exporting a factory so it is unit-testable without timers bleeding across tests:

```js
// Sliding-window-ish token bucket keyed by IP, per warm container.
export function createRateLimiter({ capacity = 5, refillPerSec = 5 / 60, now = () => Date.now() } = {}) {
  const buckets = new Map(); // ip -> { tokens, ts }
  return {
    allow(ip) {
      if (!ip) return true; // never hard-fail a missing IP
      const t = now();
      const b = buckets.get(ip) ?? { tokens: capacity, ts: t };
      b.tokens = Math.min(capacity, b.tokens + ((t - b.ts) / 1000) * refillPerSec);
      b.ts = t;
      if (b.tokens < 1) { buckets.set(ip, b); return false; }
      b.tokens -= 1; buckets.set(ip, b);
      return true;
    },
  };
}
```

5.2 In `index.mjs`: instantiate one limiter at module scope (`const limiter = createRateLimiter();`) so it persists across warm invocations. In `createHandlerCore`, read `const ip = event?.requestContext?.http?.sourceIp;` and, **before** the model call (right after the body parse / before/after the out-of-scope gate so blocked requests still never call Bedrock), check `if (ip && !limiter.allow(ip)) { stream.write(OUT_OF_SCOPE_MESSAGE_OR_RATE_MSG); stream.end(); return; }`. Note: the response is already committed 200 (streaming), so you cannot return a true 429 status here — write a short, distinct in-band message (NOT the error sentinel, to avoid the client error UI) such as "Too many requests — please wait a moment." Document this honestly: it stops the *paid Bedrock call* and frees the concurrency slot, which is the goal, even though the HTTP status is 200.

5.3 Honest limitations to record in README: per-container state resets on cold start and is **not shared across the up-to-5 concurrent containers**, so the effective global limit is ~`capacity × live-containers`. For durable/shared limiting, back the bucket with an on-demand DynamoDB table (atomic `UpdateItem` conditional decrement, TTL eviction) — adds one `AWS::DynamoDB::Table` and a `dynamodb:UpdateItem` IAM statement to `template.yaml`/`policy.json`. Recommend the in-memory version as the stopgap; reserve DynamoDB for when Option A is not pursued and durable limiting is required.

### 6. (Common) Tests, docs, and the acknowledged-risk section

6.1 Update `lambda/tutor/README.md` "Cost / abuse" note (currently ~lines 112–126): replace "For per-IP limits, front the Function URL with AWS WAF rate-based rules" (which implies WAF attaches to the Function URL — it does not) with the verified architecture: WAF requires CloudFront-in-front (Option A) with the AuthType-AWS_IAM/OAC + `x-amz-content-sha256` caveat, or the in-Lambda limiter (Option C). Update the deploy steps and add the OAC `add-permission` grant. Update `template.yaml`'s header comment (lines 7–11, 54–55, 76–79) to match whichever option ships.

6.2 Add tests (Node `node --test` for the lambda, jest for the web client) — see Testing section.

## File & Code Changes

| Action | File Path | Description of Change |
| --- | --- | --- |
| Modify | `/Users/cperez/dev/altivum-dev/quantum/lambda/tutor/template.yaml` | Option A: `AuthType: NONE` → `AWS_IAM`; add `PriceClass` param; update header/CORS comments to the verified WAF-needs-CloudFront reality. Option C: add a DynamoDB table + `dynamodb:UpdateItem` policy ONLY if choosing the durable limiter. |
| Create | `/Users/cperez/dev/altivum-dev/quantum/lambda/tutor/edge.yaml` | (Option A) us-east-1 stack: WAFv2 `WebACL` (Scope CLOUDFRONT, rate-based rule 300/60s/IP, Block), CloudFront `OriginAccessControl` (lambda/sigv4/always), CloudFront `Distribution` (Function URL origin, caching disabled, WAF attached), outputs DistributionDomainName/Id. |
| Create | `/Users/cperez/dev/altivum-dev/quantum/lambda/tutor/scripts/grant-oac.sh` | (Option A) Helper running `aws lambda add-permission` to grant the CloudFront service principal scoped to the distribution ARN. |
| Create | `/Users/cperez/dev/altivum-dev/quantum/lambda/tutor/rate-limit.mjs` | (Option C) Pure `createRateLimiter` factory (per-IP token bucket), dependency-injected `now` for testing. |
| Create | `/Users/cperez/dev/altivum-dev/quantum/lambda/tutor/rate-limit.test.mjs` | (Option C) `node --test` unit tests for the limiter (allow under cap, block over cap, refill over time, null-IP passthrough). |
| Modify | `/Users/cperez/dev/altivum-dev/quantum/lambda/tutor/index.mjs` | Option C: import + instantiate limiter at module scope; read `event.requestContext.http.sourceIp`; gate before the Bedrock call with a distinct in-band "too many requests" message (not the error sentinel). Add `rate-limit.mjs` to the `files` whitelist in `package.json`. Option A-2b alt: reject requests missing the CloudFront shared-secret header. |
| Modify | `/Users/cperez/dev/altivum-dev/quantum/lambda/tutor/index.test.mjs` | (Option C) Add a test: a synthetic burst from one `sourceIp` past the cap returns the rate message and makes NO model call; a different IP is unaffected. |
| Modify | `/Users/cperez/dev/altivum-dev/quantum/lambda/tutor/package.json` | (Option C) Add `rate-limit.mjs` to `files` so `sam build` packages it. |
| Create | `/Users/cperez/dev/altivum-dev/quantum/web/src/lib/sha256.ts` | (Option A) Pure `sha256Hex(s)` using `crypto.subtle`, guarded for non-secure/test contexts. |
| Create | `/Users/cperez/dev/altivum-dev/quantum/web/__tests__/sha256.test.ts` | (Option A) Jest test for `sha256Hex` against known SHA-256 vectors. |
| Modify | `/Users/cperez/dev/altivum-dev/quantum/web/src/components/ask-tutor.tsx` | (Option A) Compute and send `x-amz-content-sha256` over the exact JSON body in `ask()` (~lines 104–109); guard when `crypto.subtle` is absent. |
| Modify | `/Users/cperez/dev/altivum-dev/quantum/lambda/tutor/README.md` | Rewrite the "Cost / abuse" + deploy sections to the verified architecture (WAF requires CloudFront; AuthType AWS_IAM + OAC + x-amz-content-sha256 caveat; or in-Lambda limiter). Add the OAC grant step. |

## Testing & Validation

**Unit tests (must keep CI green — web `npm test`, lambda `node --test`):**
- `rate-limit.test.mjs` (Option C): allow N≤capacity in a burst; block the (capacity+1)th from the same IP; tokens refill after advancing the injected `now`; `allow(undefined)` returns true (never hard-fail a missing IP).
- `index.test.mjs` addition (Option C): a loop of requests with the same `event.requestContext.http.sourceIp` past the cap yields the rate message and `client.send` is never called for the blocked ones (mirrors existing "no model call" assertions in tests C/D); a second IP still gets through.
- `sha256.test.ts` (Option A): `sha256Hex("")` === `e3b0c442...`, and a known JSON body hashes to the expected hex (verifies the exact byte encoding CloudFront's OAC will recompute).
- Existing `ask-tutor` jest tests must still pass with the new header (the header addition must not change rendered output or the streaming/abort behavior).

**Template validation:**
- `cfn-lint lambda/tutor/template.yaml lambda/tutor/edge.yaml` → no errors. Confirm the WebACL is `Scope: CLOUDFRONT` and the OAC `OriginAccessControlOriginType: lambda`.

**Manual / end-to-end (per the project rule: green tests ≠ working — exercise the real path):**
- Option C local: `cd lambda/tutor && npm install && npm test`, then `sam local invoke` with a crafted event JSON containing `requestContext.http.sourceIp` repeated past the cap; confirm the rate message and no Bedrock call.
- Option A live: after deploy + the OAC grant, `curl -N` the CloudFront URL with a valid body **and** the correct `x-amz-content-sha256`; confirm a streamed grounded answer. Then hammer it (e.g. `for i in $(seq 1 400); do curl -s -o /dev/null -w '%{http_code}\n' ...; done`) and confirm 429s appear once the per-IP rate limit trips, while a real single learner is never blocked. Confirm the raw us-east-2 Function URL now returns 403 to an unsigned direct request (proving OAC closed the bypass).
- Verify the live tutor still streams token-by-token in the browser (CloudFront must not buffer — caching is disabled; observe incremental rendering in `<AskTutor />`).

**Rollback verification:**
- Option A: re-point `NEXT_PUBLIC_TUTOR_URL` back to the raw Function URL, set `AuthType` back to `NONE`, `sam delete` the `edge.yaml` stack, remove the `add-permission` statement. Confirm the tutor still streams directly (status quo restored).
- Option C: revert `index.mjs`/`package.json` and delete `rate-limit.mjs*`; `npm test` green; behavior identical to today. The limiter is fail-open (missing IP / any limiter error must not block legitimate traffic) — verify by forcing the limiter to throw and confirming the request still proceeds.

## Risk & Mitigation

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| OAC + `AuthType AWS_IAM` breaks the browser POST because the client doesn't send `x-amz-content-sha256` | High (if Step 2 skipped) | High (tutor 403s for everyone) | Ship the `sha256Hex` client change atomically with the AuthType flip; gate behind a staging CloudFront before re-pointing Amplify; or choose the AuthType-NONE + shared-secret variant (Decision Point 2). |
| CloudFront buffers the streamed response, degrading the token-by-token UX | Medium | Medium | Disable caching (managed `CachingDisabled` policy), forward only needed headers, and verify incremental streaming in the live browser test before cutover; keep rollback ready. |
| WAF rate threshold set too low → real learners hit 429 | Low | Medium | Start at 300 req/60s/IP (orders of magnitude above human use); set the rule `Action: Count` first to observe real traffic, then flip to `Block`; alarm on `BlockedRequests`. |
| In-Lambda limiter is per-container, so effective limit ≈ capacity×containers and resets on cold start | High (by design, Option C) | Low (still caps each container's paid calls) | Document honestly in README; recommend DynamoDB-backed bucket if a hard global cap is required; treat Option C as a stopgap, Option A as the durable fix. |
| Cross-region confusion: WAF for CloudFront must be us-east-1 while Lambda is us-east-2 | Medium | Medium | Split into `template.yaml` (us-east-2) + `edge.yaml` (us-east-1) stacks rather than one cross-region stack; document the two deploy regions in README. |
| New CloudFront distribution adds cost and a moving part | Medium | Low | PriceClass_100; caching disabled is fine (low volume); the distribution + WAF rate rule cost is negligible vs. the Bedrock spend it prevents. |
| Streaming response already committed 200 means Option C can't return a real 429 | High (Option C) | Low | Emit a distinct in-band "too many requests" message (not the error sentinel) — the goal (no paid Bedrock call, slot freed) is met regardless of HTTP status; document the 200 caveat. |

## Estimated Effort

- **Complexity:** Medium.
- **Time:** Option A (CloudFront + WAF, recommended durable fix) ≈ 1.5–3 days incl. the client `x-amz-content-sha256` change, two-region stack split, live streaming verification, and Amplify cutover. Option C (in-Lambda limiter stopgap) ≈ 0.5 day. Doing C now then A later is a sensible sequence.
- **Files affected:** 6 for Option A (template.yaml, edge.yaml, grant-oac.sh, ask-tutor.tsx, sha256.ts/test, README) or for Option C (rate-limit.mjs/test, index.mjs, index.test.mjs, package.json, README); ~11 distinct files total across both options. All are tutor-scoped — no other recommendation touches `lambda/tutor/*` or `ask-tutor.tsx`, so this can proceed in parallel (`canParallelize: true`, `dependsOn: []`).

## Decision Points
1. Pick the architecture: (A) CloudFront + WAF rate-based rule in front of the Function URL [recommended for a public edge endpoint], (C) in-Lambda per-IP token bucket as a low-cost stopgap, or do both (C now, A later). Option B (API Gateway) is rejected because HTTP API does not support Lambda response streaming.
2. If Option A: choose whether to flip AuthType to AWS_IAM + OAC (closes the Function URL to direct access but REQUIRES the browser client in ask-tutor.tsx to send the x-amz-content-sha256 body-hash header CloudFront's OAC demands for POST) OR keep AuthType NONE (CloudFront is then just a WAF chokepoint a determined attacker can bypass by hitting the raw Function URL, unless the handler rejects requests lacking a CloudFront shared-secret header). Recommended: AuthType AWS_IAM + OAC + a tiny SubtleCrypto SHA-256 in the client.
3. If Option A: confirm CloudFront price class / region. WAF for a Function-URL-backed CloudFront distribution must be a CLOUDFRONT-scope (us-east-1 / global) web ACL, even though the Lambda lives in us-east-2.
4. Whether to keep the existing out-of-stack CloudWatch 'quantum-tutor-high-invocations' alarm + SNS topic, or fold a tighter WAF BlockedRequests alarm alongside it.
5. For Option C only: the bucket capacity / refill rate (e.g. 5 requests / 60s per IP) and whether per-container in-memory state is acceptable (resets on cold start, not shared across the up-to-5 concurrent containers) or whether to back it with a tiny on-demand DynamoDB table (durable, shared, ~$0, but adds IAM + a resource).

---
