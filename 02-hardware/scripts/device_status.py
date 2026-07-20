#!/usr/bin/env python3
"""Check current Amazon Braket device availability.

Renders `lib.hardware.list_available_devices()` — the library function that already owns
this query — rather than re-implementing it against `AwsDevice.get_devices()`. `make
devices` runs this same script, so there is exactly one device-listing implementation.

Note that the list is the FULL fleet: OFFLINE and RETIRED devices are included, and the
Status column is what tells them apart.
"""

from lib.hardware import list_available_devices


def main():
    print("=== Amazon Braket Device Status ===\n")
    print(f"{'Device':<35} {'Provider':<12} {'Status':<10} {'Type'}")
    print("-" * 72)

    try:
        devices = sorted(list_available_devices(), key=lambda d: (d["provider"], d["name"]))
    except Exception as e:
        print(f"\nError querying devices: {e}")
        print("Make sure AWS credentials are configured: run 'make setup'")
        return

    for d in devices:
        dev_type = "QPU" if "qpu" in d["arn"] else "Simulator"
        print(f"{d['name']:<35} {d['provider']:<12} {d['status']:<10} {dev_type}")


if __name__ == "__main__":
    main()
