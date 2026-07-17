"""Canonical solutions for 02-hardware/notebooks/04-quera-analog.ipynb.

Executed by tests/test_exercise_checks.py inside the notebook's namespace,
directly before each exercise's check cell.
"""

SOLUTIONS = {
    1: """
_hex_angles = np.array([2 * np.pi * k / 6 + np.pi / 2 for k in range(6)])
hex_coords = np.stack(
    [ring_radius * np.cos(_hex_angles), ring_radius * np.sin(_hex_angles)], axis=1
)
_hex_nn = np.linalg.norm(hex_coords[0] - hex_coords[1])
_hex_nnn = np.linalg.norm(hex_coords[0] - hex_coords[2])
_hex_rb = 0.5 * (_hex_nn + _hex_nnn)
hex_edges = [
    (i, j)
    for i, j in combinations(range(6), 2)
    if np.linalg.norm(hex_coords[i] - hex_coords[j]) <= _hex_rb
]
hex_mis_size = max(
    sum(bits)
    for bits in product([0, 1], repeat=6)
    if all(not (bits[i] and bits[j]) for i, j in hex_edges)
)
print(f"hexagon blockade edges: {hex_edges}")
print(f"hexagon MIS size: {hex_mis_size}")
""",
    2: """
_dense_radius = 4.5e-6
_dense_angles = np.array([2 * np.pi * k / N + np.pi / 2 for k in range(N)])
dense_coords = np.stack(
    [_dense_radius * np.cos(_dense_angles), _dense_radius * np.sin(_dense_angles)],
    axis=1,
)
dense_edges = [
    (i, j)
    for i, j in combinations(range(N), 2)
    if np.linalg.norm(dense_coords[i] - dense_coords[j]) <= blockade_radius
]
dense_mis_size = max(
    sum(bits)
    for bits in product([0, 1], repeat=N)
    if all(not (bits[i] and bits[j]) for i, j in dense_edges)
)
print(f"dense-pentagon edge count: {len(dense_edges)} (every pair blockaded)")
print(f"dense-pentagon MIS size: {dense_mis_size}")
""",
    3: """
hub_coords = np.vstack([coords, [0.0, 0.0]])
hub_edges = [
    (i, j)
    for i, j in combinations(range(6), 2)
    if np.linalg.norm(hub_coords[i] - hub_coords[j]) <= blockade_radius
]
_hub_independent = [
    bits
    for bits in product([0, 1], repeat=6)
    if all(not (bits[i] and bits[j]) for i, j in hub_edges)
]
hub_mis_size = max(sum(bits) for bits in _hub_independent)
hub_in_any_mis = any(
    bits[5] for bits in _hub_independent if sum(bits) == hub_mis_size
)
print(f"hub edges: {len(hub_edges)}, MIS size: {hub_mis_size}")
print(f"center atom in any maximum independent set: {hub_in_any_mis}")
""",
    4: """
slow_t_max = 2 * t_max
slow_detuning = TimeSeries().put(0.0, delta_start).put(slow_t_max, delta_end)
_old_rate = (delta_end - delta_start) / t_max
_new_rate = (delta_end - delta_start) / slow_t_max
print("Slow detuning schedule  [time -> delta]:")
for _t, _v in zip(slow_detuning.times(), slow_detuning.values()):
    print(f"  t = {_t * 1e6:5.2f} us   delta = {_v / 1e6:6.2f} Mrad/s")
print(f"sweep rate: {_old_rate:.3e} -> {_new_rate:.3e} rad/s^2 (halved)")
""",
    5: """
def validate_register(candidate, max_atoms, min_spacing):
    sites = [tuple(float(c) for c in site.coordinate) for site in candidate]
    if len(sites) > max_atoms:
        return False
    return all(
        np.hypot(x2 - x1, y2 - y1) >= min_spacing
        for (x1, y1), (x2, y2) in combinations(sites, 2)
    )


register_ok = validate_register(register, 256, 4.0e-6)
print(f"pentagon register within Aquila's published limits: {register_ok}")

if RUN_ON_AWS:
    _paradigm = AwsDevice(AQUILA_ARN).properties.paradigm
    register_ok = validate_register(
        register,
        int(_paradigm.qubitCount),
        float(_paradigm.lattice.geometry.spacingRadialMin),
    )
    print(f"validated against live paradigm limits: {register_ok}")
""",
}
