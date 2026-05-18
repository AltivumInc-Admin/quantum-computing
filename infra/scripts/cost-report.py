#!/usr/bin/env python3
"""Query AWS Cost Explorer for Amazon Braket spend in the current month."""

import boto3
from datetime import datetime, timedelta


def get_braket_costs():
    client = boto3.client("ce")

    today = datetime.utcnow()
    start_of_month = today.replace(day=1).strftime("%Y-%m-%d")
    end_date = (today + timedelta(days=1)).strftime("%Y-%m-%d")

    response = client.get_cost_and_usage(
        TimePeriod={"Start": start_of_month, "End": end_date},
        Granularity="MONTHLY",
        Metrics=["UnblendedCost"],
        Filter={
            "Dimensions": {
                "Key": "SERVICE",
                "Values": ["Amazon Braket"],
            }
        },
        GroupBy=[{"Type": "DIMENSION", "Key": "USAGE_TYPE"}],
    )

    print(f"Amazon Braket Costs: {start_of_month} to {end_date}")
    print("=" * 60)

    total = 0.0
    for group in response.get("ResultsByTime", [{}])[0].get("Groups", []):
        usage_type = group["Keys"][0]
        amount = float(group["Metrics"]["UnblendedCost"]["Amount"])
        if amount > 0:
            print(f"  {usage_type:<40} ${amount:.4f}")
            total += amount

    if total == 0:
        print("  No Braket charges this month.")
    else:
        print(f"\n  {'TOTAL':<40} ${total:.4f}")


if __name__ == "__main__":
    get_braket_costs()
