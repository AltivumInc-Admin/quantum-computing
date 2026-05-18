#!/usr/bin/env python3
"""Estimate costs for running quantum tasks on Amazon Braket devices."""

import argparse
import sys
sys.path.insert(0, "../..")
from lib.utils.cost import estimate_cost, format_cost_warning, PRICING


def main():
    parser = argparse.ArgumentParser(description="Estimate Amazon Braket task costs")
    parser.add_argument("--device", required=True, choices=list(PRICING.keys()),
                       help="Device/provider name")
    parser.add_argument("--shots", type=int, default=1000, help="Number of shots")
    parser.add_argument("--minutes", type=float, default=1.0,
                       help="Estimated runtime in minutes (for simulators)")
    parser.add_argument("--tasks", type=int, default=1, help="Number of tasks to submit")
    args = parser.parse_args()

    single_cost = estimate_cost(args.device, args.shots, args.minutes)
    total_cost = single_cost * args.tasks

    print(f"\n=== Cost Estimate: {args.device} ===")
    print(f"Shots per task: {args.shots}")
    print(f"Number of tasks: {args.tasks}")
    if "per_minute" in PRICING[args.device]:
        print(f"Estimated runtime: {args.minutes} min/task")
    print(f"\nCost per task: ${single_cost:.4f}")
    print(f"Total estimate: ${total_cost:.4f}")
    print(f"\n{format_cost_warning(args.device, args.shots, args.minutes)}")


if __name__ == "__main__":
    main()
