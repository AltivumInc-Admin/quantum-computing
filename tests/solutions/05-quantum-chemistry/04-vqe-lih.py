"""Canonical solutions for 05-quantum-chemistry/notebooks/04-vqe-lih.ipynb.

Executed by tests/test_exercise_checks.py inside the notebook's namespace,
directly before each exercise's check cell. Everything runs locally on
PennyLane's default.qubit -- no AWS, no PySCF.
"""

SOLUTIONS = {
    1: """
# Widen the active space to 4 orbitals (8 qubits) for the same 2 electrons.
_H4, nq4 = qml.qchem.molecular_hamiltonian(
    ["Li", "H"], geom,
    active_electrons=2, active_orbitals=4, method="dhf",
)
fci4 = float(np.linalg.eigvalsh(qml.matrix(_H4, wire_order=range(nq4)))[0])

_hf4 = qml.qchem.hf_state(electrons=2, orbitals=nq4)
_singles4, _doubles4 = qml.qchem.excitations(electrons=2, orbitals=nq4)
_dev4 = qml.device("default.qubit", wires=nq4)

@qml.qnode(_dev4)
def _asd4_cost(p):
    qml.AllSinglesDoubles(p, wires=range(nq4), hf_state=_hf4,
                          singles=_singles4, doubles=_doubles4)
    return qml.expval(_H4)

_p4 = pnp.zeros(len(_singles4) + len(_doubles4), requires_grad=True)
_opt4 = qml.GradientDescentOptimizer(stepsize=0.4)
for _ in range(60):
    _p4 = _opt4.step(_asd4_cost, _p4)

asd4_gap_mha = (float(_asd4_cost(_p4)) - fci4) * 1000
print(f"nq4={nq4}  fci4={fci4:.6f} Ha  asd4_gap_mha={asd4_gap_mha:.4f}")
""",
    2: """
# Sweep StronglyEntanglingLayers depth, same HF start and optimizer each time.
@qml.qnode(dev)
def _hea_cost(_w):
    qml.BasisState(hf, wires=range(nq))
    qml.StronglyEntanglingLayers(_w, wires=range(nq))
    return qml.expval(H)

hea_layer_gaps = {}
for _L in (4, 6, 8):
    _shape = qml.StronglyEntanglingLayers.shape(n_layers=_L, n_wires=nq)
    _rng = np.random.default_rng(42)
    _w = pnp.array(_rng.normal(0.0, 0.1, _shape), requires_grad=True)
    _opt = qml.GradientDescentOptimizer(stepsize=0.4)
    for _ in range(60):
        _w = _opt.step(_hea_cost, _w)
    hea_layer_gaps[_L] = (float(_hea_cost(_w)) - fci_energy) * 1000

print(hea_layer_gaps)
""",
    3: """
# Rebuild the Hamiltonian at each separation and run the AllSinglesDoubles VQE.
bond_lengths = pnp.linspace(2.0, 4.5, 8, requires_grad=False)
pes_energies = []
for _d in bond_lengths:
    _g = pnp.array([[0.0, 0.0, 0.0], [0.0, 0.0, float(_d)]], requires_grad=False)
    _Hd, _nqd = qml.qchem.molecular_hamiltonian(
        ["Li", "H"], _g,
        active_electrons=2, active_orbitals=3, method="dhf",
    )
    _hfd = qml.qchem.hf_state(electrons=2, orbitals=_nqd)
    _s, _dd = qml.qchem.excitations(electrons=2, orbitals=_nqd)
    _devd = qml.device("default.qubit", wires=_nqd)

    @qml.qnode(_devd)
    def _cost(p):
        qml.AllSinglesDoubles(p, wires=range(_nqd), hf_state=_hfd,
                              singles=_s, doubles=_dd)
        return qml.expval(_Hd)

    _p = pnp.zeros(len(_s) + len(_dd), requires_grad=True)
    _opt = qml.GradientDescentOptimizer(stepsize=0.4)
    for _ in range(40):
        _p = _opt.step(_cost, _p)
    pes_energies.append(float(_cost(_p)))

print([f"{e:.4f}" for e in pes_energies])
""",
}
