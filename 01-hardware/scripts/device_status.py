#!/usr/bin/env python3
"""Check current Amazon Braket device availability and queue depth."""

from braket.aws import AwsDevice


def main():
    print("=== Amazon Braket Device Status ===\n")
    print(f"{'Device':<35} {'Provider':<12} {'Status':<10} {'Qubits':<8} {'Type'}")
    print("-" * 85)

    try:
        devices = AwsDevice.get_devices()
        for d in sorted(devices, key=lambda x: x.provider_name):
            qubits = getattr(d.properties, "qubitCount", "N/A") if hasattr(d.properties, "qubitCount") else "N/A"
            dev_type = "QPU" if "qpu" in d.arn else "Simulator"
            print(f"{d.name:<35} {d.provider_name:<12} {d.status:<10} {str(qubits):<8} {dev_type}")
    except Exception as e:
        print(f"\nError querying devices: {e}")
        print("Make sure AWS credentials are configured: run 'make setup'")


if __name__ == "__main__":
    main()
