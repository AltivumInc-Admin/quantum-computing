"""Contract tests for the shared drill generator (lib/linalg_drills.py).

The drills are practice, not graded exercises, so nothing in the notebook
harness covers them. What they promise a learner is nonetheless exact, and
each promise is pinned here:

* the same ``(kind, level, seed)`` is the same problem, forever -- that is what
  makes a drill shareable ("try seed 7") and debuggable;
* every kind accepts a correct answer, computed here INDEPENDENTLY from the
  drill's own operands rather than from ``reveal()``, so a bug in the
  generator's arithmetic cannot agree with itself into a green test;
* a wrong answer is rejected and says WHICH entries are wrong and by how much,
  without printing the answer;
* level 3 "multiply" really does produce impossible products, and the drill
  accepts "undefined" for exactly those;
* the level dials (shape ranges, signs, small integers) hold across seeds;
* an omitted seed still yields a solvable problem, and prints the seed that
  reproduces it.

The last test guards the reason this module lives under ``lib/`` at all: it is
copied verbatim into the Pyodide lab, where only numpy exists.
"""

from __future__ import annotations

import ast
from pathlib import Path

import numpy as np
import pytest

from lib.linalg_drills import KINDS, LEVELS, Drill, drill

REPO_ROOT = Path(__file__).resolve().parent.parent
MODULE_PATH = REPO_ROOT / "lib" / "linalg_drills.py"

LEVEL_IDS = sorted(LEVELS)
# Enough seeds to see every branch of a level's generator without making the
# suite slow: each drill is a handful of integer draws.
SWEEP = range(60)


def expected_answer(d: Drill):
    """Recompute the answer from the drill's OPERANDS, never from reveal().

    Deliberately a second implementation: if this and the module ever disagree,
    one of them is wrong and the test says so.
    """
    operands = d.operands
    if d.kind == "add":
        return operands["A"] + operands["B"]
    if d.kind == "subtract":
        return operands["A"] - operands["B"]
    if d.kind == "scale":
        return d.scalar * operands["A"]
    if d.kind == "transpose":
        return operands["A"].T
    if d.kind == "matvec":
        return operands["A"] @ operands["v"]
    if d.kind == "submatrix":
        rows = [i - 1 for i in d.sub_rows]
        cols = [j - 1 for j in d.sub_cols]
        return operands["A"][np.ix_(rows, cols)]
    if d.kind == "multiply":
        a, b = operands["A"], operands["B"]
        return a @ b if a.shape[1] == b.shape[0] else False
    if d.kind == "defined":
        a, b = operands["A"], operands["B"]
        return (a.shape[0], b.shape[1]) if a.shape[1] == b.shape[0] else False
    raise AssertionError(f"test does not know how to answer {d.kind!r}")


def all_drills(level: int, seeds=SWEEP):
    for kind in KINDS:
        for seed in seeds:
            yield drill(kind, level=level, seed=seed)


# --------------------------------------------------------------- determinism


@pytest.mark.parametrize("kind", KINDS)
@pytest.mark.parametrize("level", LEVEL_IDS)
def test_same_seed_is_the_same_problem(kind, level):
    first = drill(kind, level=level, seed=11)
    second = drill(kind, level=level, seed=11)
    assert first.operands.keys() == second.operands.keys()
    for name, operand in first.operands.items():
        np.testing.assert_array_equal(operand, second.operands[name], err_msg=f"{kind}/{name}")
    assert first.scalar == second.scalar
    assert first.sub_rows == second.sub_rows
    assert first.sub_cols == second.sub_cols
    assert first.check(expected_answer(second)) is True, "the answers diverged"


@pytest.mark.parametrize("kind", KINDS)
def test_same_seed_prints_the_same_problem(kind, capsys):
    drill(kind, level=3, seed=5).show()
    first = capsys.readouterr().out
    drill(kind, level=3, seed=5).show()
    assert capsys.readouterr().out == first


def test_different_seeds_give_different_problems():
    """Not every pair need differ, but a whole sweep collapsing to one problem
    would mean the seed is not reaching the generator at all."""
    seen = {drill("multiply", level=2, seed=s).operands["A"].tobytes() for s in SWEEP}
    assert len(seen) > 1, "every seed produced the same matrix A"


def test_the_module_never_touches_the_global_numpy_random_state():
    """A notebook cell that calls np.random.seed must not change a seeded drill,
    and a drill must not disturb the notebook's own stream."""
    np.random.seed(0)
    before = drill("multiply", level=2, seed=42).operands["A"].copy()
    first_global = np.random.random()

    np.random.seed(0)
    drill("add", level=3, seed=1)
    after = drill("multiply", level=2, seed=42).operands["A"]
    second_global = np.random.random()

    np.testing.assert_array_equal(before, after)
    assert first_global == second_global, "a drill consumed the legacy global stream"


# ----------------------------------------------------------- correct answers


@pytest.mark.parametrize("kind", KINDS)
@pytest.mark.parametrize("level", LEVEL_IDS)
def test_a_correct_answer_is_accepted(kind, level):
    for seed in SWEEP:
        d = drill(kind, level=level, seed=seed)
        assert d.check(expected_answer(d)) is True, f"{kind} level {level} seed {seed}"


@pytest.mark.parametrize("kind", KINDS)
def test_a_correct_answer_is_accepted_as_a_plain_nested_list(kind):
    """Learners type lists, not arrays."""
    d = drill(kind, level=2, seed=3)
    answer = expected_answer(d)
    if isinstance(answer, bool):
        assert d.check(answer) is True
    elif isinstance(answer, tuple):
        assert d.check(list(answer)) is True
    else:
        assert d.check(np.asarray(answer).tolist()) is True


def test_a_column_vector_answer_is_accepted_for_matvec():
    d = drill("matvec", level=2, seed=8)
    column = [[int(v)] for v in expected_answer(d)]
    assert d.check(column) is True


def test_reveal_returns_the_answer_and_a_copy():
    d = drill("multiply", level=1, seed=4)
    revealed = d.reveal()
    np.testing.assert_array_equal(revealed, expected_answer(d))
    revealed[0, 0] += 100
    np.testing.assert_array_equal(d.reveal(), expected_answer(d))


# ------------------------------------------------------------ wrong answers


def test_a_wrong_answer_is_rejected_with_per_entry_feedback(capsys):
    d = drill("multiply", level=1, seed=6)
    wrong = np.asarray(expected_answer(d)).copy()
    wrong[0, 0] += 3
    wrong[1, 1] -= 5

    assert d.check(wrong) is False
    out = capsys.readouterr().out
    assert "r1c1" in out and "off by 3" in out
    assert "r2c2" in out and "off by 5" in out
    # The entries that were right are not named...
    assert "r1c2" not in out and "r2c1" not in out
    # ...and the answer itself is never printed.
    assert "answer:" not in out


def test_feedback_reports_magnitude_not_the_missing_value(capsys):
    """ "off by" is an absolute value on purpose: a signed gap would let the
    learner recover the answer by subtraction and skip the arithmetic."""
    d = drill("add", level=2, seed=9)
    wrong = np.asarray(expected_answer(d)).copy()
    wrong[0, 0] -= 4

    assert d.check(wrong) is False
    out = capsys.readouterr().out
    assert "off by 4" in out
    assert "off by -4" not in out


def test_a_wrong_shape_is_rejected_before_any_entry_talk(capsys):
    d = drill("transpose", level=3, seed=2)
    assert d.check([[1, 2], [3, 4], [5, 6], [7, 8], [9, 10]]) is False
    out = capsys.readouterr().out
    assert "Re-count" in out
    assert "off by" not in out


def test_a_ragged_or_non_numeric_answer_is_rejected_not_raised(capsys):
    d = drill("add", level=1, seed=1)
    assert d.check([[1, 2], [3]]) is False
    assert d.check([["a", "b"], ["c", "d"]]) is False
    assert "Traceback" not in capsys.readouterr().out


def test_matvec_feedback_numbers_entries_from_one(capsys):
    d = drill("matvec", level=2, seed=12)
    wrong = np.asarray(expected_answer(d)).copy()
    wrong[0] += 2
    assert d.check(wrong) is False
    out = capsys.readouterr().out
    assert "entry 1" in out
    assert "entry 0" not in out


# ------------------------------------------------------- undefined products


def split_by_definedness(kind: str):
    defined, undefined = [], []
    for seed in SWEEP:
        d = drill(kind, level=3, seed=seed)
        (undefined if expected_answer(d) is False else defined).append(d)
    return defined, undefined


def test_level_three_multiply_produces_both_kinds_of_product():
    defined, undefined = split_by_definedness("multiply")
    assert undefined, "level 3 multiply never produced an undefined product"
    assert defined, "level 3 multiply produced nothing but undefined products"


@pytest.mark.parametrize("sentinel", [False, None, "undefined"])
def test_an_undefined_product_accepts_saying_so(sentinel):
    _, undefined = split_by_definedness("multiply")
    d = undefined[0]
    assert d.check(sentinel) is True


def test_an_undefined_product_rejects_a_matrix_and_reveals_why(capsys):
    _, undefined = split_by_definedness("multiply")
    d = undefined[0]
    assert d.check([[0, 0], [0, 0]]) is False
    assert d.reveal() is None
    out = capsys.readouterr().out
    assert "column" in out and "row" in out


def test_a_defined_product_rejects_undefined():
    defined, _ = split_by_definedness("multiply")
    d = defined[0]
    assert d.check(False) is False
    assert d.check(expected_answer(d)) is True


def test_the_defined_kind_scores_both_shapes_and_refusals():
    defined, undefined = split_by_definedness("defined")
    assert defined and undefined, "the 'defined' kind must generate both cases"

    yes = defined[0]
    shape = expected_answer(yes)
    assert yes.check(shape) is True
    assert yes.check(tuple(reversed(shape))) is (shape[0] == shape[1])
    assert yes.check(False) is False
    assert yes.check(True) is True  # right about existence, silent on the shape
    assert yes.reveal() == shape

    no = undefined[0]
    assert no.check(False) is True
    assert no.check(True) is False
    assert no.check((2, 2)) is False
    assert no.reveal() is False


def test_the_defined_kind_never_prints_the_shape_when_rejecting(capsys):
    defined, _ = split_by_definedness("defined")
    d = defined[0]
    rows, cols = expected_answer(d)
    capsys.readouterr()
    assert d.check((cols + 1, rows + 1)) is False
    out = capsys.readouterr().out
    assert f"{rows} x {cols}" not in out


# ------------------------------------------------------------------- levels


@pytest.mark.parametrize("level", LEVEL_IDS)
def test_entries_are_small_integers_at_every_level(level):
    dials = LEVELS[level]
    for d in all_drills(level):
        for name, operand in d.operands.items():
            assert operand.dtype.kind in "iu", f"{d.kind}/{name} is not integral"
            assert operand.min() >= dials.low and operand.max() <= dials.high
        if d.scalar is not None:
            assert dials.low <= d.scalar <= dials.high
            assert d.scalar not in (0, 1), "scaling by 0 or 1 teaches nothing"


def test_level_one_is_small_non_negative_and_square():
    seen_shapes = set()
    for d in all_drills(1):
        for operand in d.operands.values():
            assert operand.min() >= 0, "level 1 carries no negative entries"
            seen_shapes.add(operand.shape)
    # Only the shape-question kind ("defined") may leave 2x2 at level 1.
    value_shapes = {
        operand.shape
        for d in all_drills(1)
        if d.kind != "defined"
        for operand in d.operands.values()
        if operand.ndim == 2
    }
    assert value_shapes == {(2, 2)}, f"level 1 must be 2x2, saw {sorted(value_shapes)}"
    assert seen_shapes, "no operands generated"


def test_level_two_adds_negatives_and_three_by_three():
    shapes, has_negative = set(), False
    for d in all_drills(2):
        if d.kind == "defined":
            continue
        for operand in d.operands.values():
            has_negative = has_negative or bool((operand < 0).any())
            if operand.ndim == 2:
                shapes.add(operand.shape)
    assert has_negative, "level 2 must produce negative entries"
    assert shapes == {(2, 2), (3, 3)}, f"level 2 must stay square in 2..3, saw {sorted(shapes)}"


def test_level_three_goes_rectangular_within_its_dimension_pool():
    pool = set(LEVELS[3].dims)
    shapes = set()
    for d in all_drills(3):
        for operand in d.operands.values():
            if operand.ndim == 2:
                shapes.add(operand.shape)
    assert shapes, "no operands generated"
    assert all(rows in pool and cols in pool for rows, cols in shapes), sorted(shapes)
    assert any(rows != cols for rows, cols in shapes), "level 3 never went rectangular"


def test_a_submatrix_is_always_a_proper_one_indexed_selection():
    for level in LEVEL_IDS:
        for d in all_drills(level, seeds=range(20)):
            if d.kind != "submatrix":
                continue
            rows, cols = d.operands["A"].shape
            assert d.sub_rows and d.sub_cols
            assert min(d.sub_rows) >= 1 and max(d.sub_rows) <= rows
            assert min(d.sub_cols) >= 1 and max(d.sub_cols) <= cols
            assert len(set(d.sub_rows)) == len(d.sub_rows)
            assert len(d.sub_rows) < rows and len(d.sub_cols) < cols
            assert list(d.sub_rows) == sorted(d.sub_rows)


def test_unknown_kind_and_level_are_refused_by_name():
    with pytest.raises(ValueError, match="unknown drill kind"):
        drill("determinant", level=1, seed=1)
    with pytest.raises(ValueError, match="unknown level"):
        drill("add", level=9, seed=1)


# ------------------------------------------------------------- printed form


@pytest.mark.parametrize("kind", KINDS)
def test_show_labels_rows_and_columns_from_one(kind, capsys):
    d = drill(kind, level=3, seed=17)
    d.show()
    out = capsys.readouterr().out
    assert "r1" in out and "c1" in out
    assert "r0" not in out and "c0" not in out
    # A 1-D vector prints as a column, so it is len(v) rows and one column.
    tallest = max(len(operand) for operand in d.operands.values())
    widest = max(1 if operand.ndim == 1 else operand.shape[1] for operand in d.operands.values())
    assert f"r{tallest}" in out and f"c{widest}" in out
    assert f"r{tallest + 1}" not in out, "row labels ran past the tallest operand"
    assert "check(your_answer)" in out


def test_show_prints_a_vector_as_a_column(capsys):
    d = drill("matvec", level=2, seed=13)
    d.show()
    out = capsys.readouterr().out
    length = len(d.operands["v"])
    assert f"v ({length} x 1)" in out


def test_nothing_the_module_prints_can_trip_the_notebook_harness():
    """tests/test_exercise_checks.py greps executed notebook output for the
    grading module's " correct." marker. A drill cell shares a notebook with
    check cells, so the drill's own vocabulary stays clear of it."""
    source = MODULE_PATH.read_text(encoding="utf-8")
    assert "correct." not in source


# ------------------------------------------------------------ browser-safety


def test_the_module_imports_only_numpy_and_the_standard_library():
    """web/jupyterlite-build/build.sh copies lib/ verbatim into the Pyodide lab,
    where the only third-party wheels are numpy (and qcsim). An import added
    here would fail in the browser and nowhere else."""
    allowed = {"__future__", "numpy", "dataclasses", "typing", "math", "itertools"}
    tree = ast.parse(MODULE_PATH.read_text(encoding="utf-8"))
    roots = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            roots.update(alias.name.split(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            assert node.level == 0, "no relative imports: lib/ is staged flat"
            roots.add((node.module or "").split(".")[0])
    unexpected = roots - allowed
    assert not unexpected, f"browser-unsafe imports in lib/linalg_drills.py: {sorted(unexpected)}"
    assert "lib" not in roots, "drills must not depend on lib.grading: practice is not graded"


# ----------------------------------------------------------- unseeded drills


def test_an_omitted_seed_prints_a_seed_that_reproduces_the_problem(capsys):
    d = drill("multiply", level=3)
    out = capsys.readouterr().out

    assert isinstance(d.seed, int)
    assert f"seed={d.seed}" in out, out

    same = drill("multiply", level=3, seed=d.seed)
    for name, operand in d.operands.items():
        np.testing.assert_array_equal(operand, same.operands[name])


@pytest.mark.parametrize("kind", KINDS)
def test_an_unseeded_drill_is_still_solvable_and_self_consistent(kind):
    d = drill(kind, level=2)
    assert d.check(expected_answer(d)) is True
    if kind == "defined":
        assert d.reveal() == expected_answer(d)
    else:
        np.testing.assert_array_equal(d.reveal(), expected_answer(d))


def test_unseeded_drills_are_not_all_the_same_problem(capsys):
    seeds = {drill("add", level=2).seed for _ in range(25)}
    capsys.readouterr()
    assert len(seeds) > 1, "the drawn seed is not varying"
