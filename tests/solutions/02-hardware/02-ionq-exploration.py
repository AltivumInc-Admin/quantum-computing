"""Canonical solutions for 02-hardware/notebooks/02-ionq-exploration.ipynb.

Executed by tests/test_exercise_checks.py inside the notebook's namespace,
directly before each exercise's check cell.
"""

SOLUTIONS = {
    1: """
gpi_square_phase = (GPi(0.3) @ GPi(0.3))[0, 0]
for _phi in [0.3, 1.1, -2.0, np.pi / 5]:
    assert np.allclose(GPi(_phi) @ GPi(_phi), gpi_square_phase * I2)
print("GPi(phi)^2 =", np.round(gpi_square_phase, 6), "* I2 for every phi tested")
""",
    2: """
ms_thetas = np.linspace(0, np.pi / 2, 9)
ms_purities = []
for _theta in ms_thetas:
    _ms = np.cos(_theta) * np.eye(4, dtype=complex) - 1j * np.sin(_theta) * XX
    _psi_t = _ms @ psi00
    _rho_full = np.outer(_psi_t, _psi_t.conj()).reshape(2, 2, 2, 2)
    _rho0 = np.trace(_rho_full, axis1=1, axis2=3)
    ms_purities.append(float(np.real(np.trace(_rho0 @ _rho0))))
for _theta, _p in zip(ms_thetas, ms_purities):
    print(f"theta = {_theta:.3f}  purity = {_p:.4f}")
""",
    3: """
s_native = GPi(np.pi / 4) @ GPi(0)
s_phase = np.exp(1j * np.pi / 4)
_S = np.array([[1, 0], [0, 1j]], dtype=complex)
assert np.allclose(s_phase * s_native, _S)
print("S = exp(i*pi/4) * GPi(pi/4) @ GPi(0):")
print(np.round(s_phase * s_native, 4))
""",
}
