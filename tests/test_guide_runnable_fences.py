"""Executable contract for the ```runnable fences shipped in GUIDE.md.

A ```runnable fence renders as the inline Python sandbox (RunnableEditor): its
body is seeded into a Monaco editor and, when the learner clicks Run, executed
in their browser under Pyodide + qcsim. That makes it an executable content
surface exactly like a ``<!-- browser-runnable -->`` notebook — but until this
module it was the only one with no gate: a fence that imports something qcsim
cannot resolve, or that raises, ships silently and fails in the learner's
browser. ``web/__tests__/content/guide-reps.test.ts`` exists for precisely this
class of risk but its collector regex omits ``runnable``, and it could not
execute Python anyway.

The two checks mirror ``tests/test_notebook_contract.py``:

* ``test_runnable_fence_static_contract`` — the AST denylist from
  ``scripts/validate_runnable.py``, so a fence cannot import PennyLane, reach
  for real hardware, or call a Braket result type qcsim does not implement.
* ``test_runnable_fence_executes_under_qcsim`` — actually executes the fence
  under qcsim IN A SUBPROCESS, asserting it does not raise. The subprocess is
  load-bearing: ``tests/conftest.py`` imports ``braket`` at collection time, so
  an in-process ``import qcsim`` hits the ``if "braket" in sys.modules: return``
  guard and the aliases never register — which is exactly how this test spent
  months executing fences against the real SDK while its docstring claimed
  qcsim. The runner inserts ``qcsim/src`` directly (no install required) and
  asserts ``Circuit`` resolved to qcsim before executing anything, so the
  guarantee is itself tested rather than assumed.

ONE DELIBERATE DIVERGENCE from the notebook contract: ``vr.DIVERGENT_CALL_ATTRS``
(today just ``Circuit.state_vector()``) is NOT applied here. A runnable notebook
must work both in the browser and under the documented local path (where the
real Braket SDK is installed), so it has to use the portable helper. A
```runnable fence only ever executes in the browser, against qcsim, so
``state_vector()`` is the correct call there — and 01-foundations' fence uses it
with the divergence spelled out in the surrounding prose.
"""

from __future__ import annotations

import ast
import re
import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "scripts"))

import validate_runnable as vr  # noqa: E402

# Mirrors the fence token registered in web/src/components/quantum/widget-langs.ts
# and routed to RunnableEditor by widget-fence.tsx.
FENCE_RE = re.compile(r"^```runnable\n(.*?)\n```", re.MULTILINE | re.DOTALL)


def find_runnable_fences() -> list[tuple[str, str]]:
    """Return (id, source) for every ```runnable fence in a section GUIDE.md."""
    found: list[tuple[str, str]] = []
    for section in vr.SECTION_DIRS:
        guide = REPO_ROOT / section / "GUIDE.md"
        if not guide.is_file():
            continue
        text = guide.read_text(encoding="utf-8")
        for n, match in enumerate(FENCE_RE.finditer(text), start=1):
            line = text.count("\n", 0, match.start()) + 1
            found.append((f"{section}/GUIDE.md:{line}#{n}", match.group(1)))
    return found


FENCES = find_runnable_fences()
_IDS = [fence_id for fence_id, _ in FENCES]


def test_found_runnable_fences():
    """Guard against a regex regression silently emptying the suite."""
    assert FENCES, "no ```runnable fences discovered in any GUIDE.md"


def scan_source(source: str) -> list[str]:
    """qcsim-compatibility violations in one fence body (empty == clean)."""
    violations: list[str] = []
    tree = ast.parse(source)
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if vr._import_module_violation(alias.name):
                    violations.append(f"forbidden import '{alias.name}'")
        elif isinstance(node, ast.ImportFrom):
            if vr._import_module_violation(node.module):
                violations.append(f"forbidden import from '{node.module}'")
        elif isinstance(node, ast.Name):
            if node.id in vr.DENIED_NAMES:
                violations.append(f"forbidden name '{node.id}'")
        elif isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
            if node.func.attr in vr.DENIED_CALL_ATTRS:
                violations.append(
                    f"forbidden call '.{node.func.attr}()' (qcsim has no Braket result types)"
                )
    return violations


@pytest.mark.parametrize(("fence_id", "source"), FENCES, ids=_IDS)
def test_runnable_fence_static_contract(fence_id: str, source: str):
    """A shipped fence must not use APIs qcsim cannot run in the browser."""
    violations = scan_source(source)
    assert not violations, (
        f"{fence_id} is rendered as a runnable sandbox but violates the qcsim "
        "contract:\n  " + "\n  ".join(violations)
    )


@pytest.mark.parametrize(("fence_id", "source"), FENCES, ids=_IDS)
def test_runnable_fence_executes_under_qcsim(fence_id: str, source: str, tmp_path: Path):
    """Each fence executes end-to-end under qcsim without raising.

    A FRESH INTERPRETER is the only place the alias trick works from this
    suite: conftest.py imports ``braket`` at collection time, so qcsim's
    ``_register_braket_aliases`` no-ops in-process and an in-process exec runs
    the fence against the real SDK (the pre-2026-08-18 behaviour — silently,
    since every fence that runs under qcsim also runs under real Braket except
    for ``state_vector()``'s divergent return). ``qcsim/src`` is inserted
    directly so no editable install is needed, mirroring
    test_statevector_helper.py, and the runner ASSERTS the alias took before
    executing anything — if it did not, the test must fail rather than quietly
    prove the wrong engine. The fence runs in a fresh __main__ namespace,
    matching the runtime (runSerialized allocates one per Run).
    """
    fence_file = tmp_path / "fence.py"
    fence_file.write_text(source, encoding="utf-8")
    runner = (
        "import sys\n"
        f"sys.path.insert(0, {str(REPO_ROOT)!r})\n"
        f"sys.path.insert(1, {str(REPO_ROOT / 'qcsim' / 'src')!r})\n"
        "import qcsim  # registers braket.* aliases before any braket import\n"
        "from braket.circuits import Circuit\n"
        "assert Circuit.__module__.startswith('qcsim'), (\n"
        "    'fence would execute under the real SDK, not qcsim: ' + Circuit.__module__\n"
        ")\n"
        f"src = open({str(fence_file)!r}, encoding='utf-8').read()\n"
        f"exec(compile(src, {fence_id!r}, 'exec'), {{'__name__': '__main__'}})\n"
    )
    proc = subprocess.run(
        [sys.executable, "-c", runner],
        capture_output=True,
        text=True,
        cwd=str(REPO_ROOT),
        timeout=120,
    )
    assert proc.returncode == 0, (
        f"{fence_id} is rendered as a runnable sandbox but failed under qcsim:\n"
        f"stdout:\n{proc.stdout}\nstderr:\n{proc.stderr}"
    )
