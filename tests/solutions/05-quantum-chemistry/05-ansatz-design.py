"""Canonical solutions for 05-quantum-chemistry/notebooks/05-ansatz-design.ipynb.

Executed by tests/test_exercise_checks.py inside the notebook's namespace,
directly before each exercise's check cell. Exercise 2 reuses the layer-aware
helpers Exercise 1's snippet defines (the harness runs the solutions in order).
"""

SOLUTIONS = {
    1: """
_hea_qubits = N_QUBITS

def _hea_energy_L(_flat, _nl):
    _params = _flat.reshape(_nl, _hea_qubits, 2)
    return hamiltonian_energy(
        statevector(hardware_efficient_ansatz(_hea_qubits, _nl, _params)), H2_TERMS
    )

def _hea_grad_L(_flat, _nl):
    _grad = np.zeros_like(_flat)
    for _i in range(len(_flat)):
        _plus = _flat.copy(); _plus[_i] += np.pi / 2
        _minus = _flat.copy(); _minus[_i] -= np.pi / 2
        _grad[_i] = 0.5 * (_hea_energy_L(_plus, _nl) - _hea_energy_L(_minus, _nl))
    return _grad

np.random.seed(0)
hea_layer_rows = []
for _nl in (1, 2, 3):
    _dim = _nl * _hea_qubits * 2
    _best_e, _best_x = np.inf, None
    for _restart in range(4):
        _x = np.random.uniform(-np.pi, np.pi, _dim)
        for _ in range(8):
            _x = _x - 0.2 * _hea_grad_L(_x, _nl)
        _e = _hea_energy_L(_x, _nl)
        if _e < _best_e:
            _best_e, _best_x = _e, _x.copy()
    _circ = hardware_efficient_ansatz(_hea_qubits, _nl, _best_x.reshape(_nl, _hea_qubits, 2))
    _cnots = sum(1 for _ins in _circ.instructions if _ins.operator.name == "CNot")
    hea_layer_rows.append((_nl, _circ.depth, _cnots, _best_e))
""",
    2: """
def _budget_energy(_nsteps, _nl=3, _restarts=3):
    _dim = _nl * N_QUBITS * 2
    np.random.seed(0)
    _best = np.inf
    for _restart in range(_restarts):
        _x = np.random.uniform(-np.pi, np.pi, _dim)
        for _ in range(_nsteps):
            _x = _x - 0.2 * _hea_grad_L(_x, _nl)
        _best = min(_best, _hea_energy_L(_x, _nl))
    return _best

step_budgets = [2, 8, 32]
energy_per_budget = [_budget_energy(_n) for _n in step_budgets]
""",
    3: """
def _singles_energy(_p):
    return hamiltonian_energy(
        statevector(uccsd_singles_circuit(4, 2, np.asarray(_p, dtype=float))), H2_TERMS
    )

def _singles_grad(_p):
    _p = np.asarray(_p, dtype=float)
    _grad = np.zeros_like(_p)
    for _i in range(len(_p)):
        _plus = _p.copy(); _plus[_i] += np.pi / 2
        _minus = _p.copy(); _minus[_i] -= np.pi / 2
        _grad[_i] = 0.5 * (_singles_energy(_plus) - _singles_energy(_minus))
    return _grad

_n_exc = 2 * (4 - 2)
np.random.seed(3)
singles_best_energy = np.inf
for _restart in range(6):
    _x = np.random.uniform(-np.pi, np.pi, _n_exc)
    for _ in range(40):
        _x = _x - 0.3 * _singles_grad(_x)
    singles_best_energy = min(singles_best_energy, _singles_energy(_x))
""",
}
