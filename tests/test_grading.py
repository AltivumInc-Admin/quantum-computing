"""Unit tests for the exercise self-check runtime (lib/grading.py)."""

from __future__ import annotations

import pytest

from lib.grading import (
    CORRECT_MARKER,
    NOT_ATTEMPTED_MARKER,
    NOT_YET_MARKER,
    STRICT_ENV,
    check,
)


def run_check(body, monkeypatch, capsys, strict=False):
    """Execute `body` inside a check block; return (raised, stdout)."""
    if strict:
        monkeypatch.setenv(STRICT_ENV, "1")
    else:
        monkeypatch.delenv(STRICT_ENV, raising=False)
    raised = None
    try:
        with check("Exercise 9"):
            body()
    except BaseException as exc:  # noqa: BLE001 - the point of the test
        raised = exc
    return raised, capsys.readouterr().out


def test_success_prints_correct_marker(monkeypatch, capsys):
    raised, out = run_check(lambda: None, monkeypatch, capsys)
    assert raised is None
    assert f"[check] Exercise 9: {CORRECT_MARKER}" in out


def test_name_error_is_guidance_not_traceback(monkeypatch, capsys):
    def body():
        raise NameError("name 'ghz5_counts' is not defined")

    raised, out = run_check(body, monkeypatch, capsys)
    assert raised is None
    assert NOT_ATTEMPTED_MARKER in out
    assert "ghz5_counts" in out
    assert CORRECT_MARKER not in out


def test_assertion_error_carries_the_message(monkeypatch, capsys):
    def body():
        raise AssertionError("counts should only contain all-0s or all-1s")

    raised, out = run_check(body, monkeypatch, capsys)
    assert raised is None
    assert NOT_YET_MARKER in out
    assert "all-0s or all-1s" in out


def test_bare_assertion_error_still_reads_cleanly(monkeypatch, capsys):
    def body():
        raise AssertionError()

    raised, out = run_check(body, monkeypatch, capsys)
    assert raised is None
    assert NOT_YET_MARKER in out


def test_other_exceptions_are_reported_not_raised(monkeypatch, capsys):
    def body():
        raise TypeError("unsupported operand")

    raised, out = run_check(body, monkeypatch, capsys)
    assert raised is None
    assert "TypeError" in out
    assert CORRECT_MARKER not in out


@pytest.mark.parametrize("exc", [AssertionError("x"), NameError("y"), ValueError("z")])
def test_strict_mode_reraises_everything(exc, monkeypatch, capsys):
    def body():
        raise exc

    raised, out = run_check(body, monkeypatch, capsys, strict=True)
    assert raised is exc
    assert out == ""


def test_keyboard_interrupt_always_propagates(monkeypatch, capsys):
    def body():
        raise KeyboardInterrupt()

    raised, _ = run_check(body, monkeypatch, capsys)
    assert isinstance(raised, KeyboardInterrupt)
