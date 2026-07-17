"""Canonical solutions for 02-hardware/notebooks/01-device-discovery.ipynb.

Executed by tests/test_exercise_checks.py inside the notebook's namespace,
directly before each exercise's check cell.
"""

SOLUTIONS = {
    1: """
family_totals = {}
for _d in DEVICES:
    family_totals[_d["family"]] = family_totals.get(_d["family"], 0) + _d["qubits"]
family_ranking = sorted(family_totals, key=family_totals.get, reverse=True)
for _fam in family_ranking:
    print(f"{_fam:<28} {family_totals[_fam]}")
""",
    2: """
def choose_device(needs_noise, needs_all_to_all, n_qubits):
    if needs_noise:
        return "DM1"
    if needs_all_to_all:
        return "IonQ Forte"
    return "SV1" if n_qubits <= 34 else "TN1"

print(choose_device(needs_noise=True, needs_all_to_all=False, n_qubits=10))
print(choose_device(needs_noise=False, needs_all_to_all=True, n_qubits=20))
print(choose_device(needs_noise=False, needs_all_to_all=False, n_qubits=40))
""",
    3: """
def online_queue_report(devices):
    return [(d.name, d.queue_depth()) for d in devices if d.status == "ONLINE"]

if RUN_ON_AWS:
    for _name, _depth in online_queue_report(AwsDevice.get_devices()):
        print(f"{_name:24s} queue_depth={_depth}")
else:
    print("[RUN_ON_AWS is False] Helper defined; flip the flag to run it live.")
""",
}
