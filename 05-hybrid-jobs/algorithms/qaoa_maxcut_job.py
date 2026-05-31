"""Production QAOA MaxCut solver for Braket Hybrid Jobs.

Usage as a Hybrid Job:
    job = AwsQuantumJob.create(
        source_module="05-hybrid-jobs/algorithms/qaoa_maxcut_job.py",
        device="arn:aws:braket:::device/quantum-simulator/amazon/sv1",
        hyperparameters={"n_layers": "2", "n_shots": "1000", "maxiter": "100"},
        ...
    )
"""

import os
import json
import numpy as np
from braket.circuits import Circuit
from braket.jobs import save_job_result, load_job_checkpoint
from braket.jobs.metrics import log_metric


def qaoa_circuit(graph_edges, n_qubits, gammas, betas):
    """Build QAOA circuit for MaxCut."""
    circuit = Circuit()
    n_layers = len(gammas)

    # Initial superposition
    for q in range(n_qubits):
        circuit.h(q)

    for layer in range(n_layers):
        # Cost unitary: exp(-i * gamma * C)
        for i, j in graph_edges:
            circuit.cnot(i, j)
            circuit.rz(j, gammas[layer])
            circuit.cnot(i, j)

        # Mixer unitary: exp(-i * beta * B)
        for q in range(n_qubits):
            circuit.rx(q, 2 * betas[layer])

    return circuit


def maxcut_cost(bitstring, graph_edges):
    """Compute MaxCut cost for a given bitstring."""
    cost = 0
    for i, j in graph_edges:
        if bitstring[i] != bitstring[j]:
            cost += 1
    return cost


def main():
    # Load hyperparameters
    hp = json.loads(os.environ.get("AMZN_BRAKET_HP", "{}"))
    n_layers = int(hp.get("n_layers", 2))
    n_shots = int(hp.get("n_shots", 1000))
    maxiter = int(hp.get("maxiter", 100))

    # Load graph from input (or use default)
    input_dir = os.environ.get("AMZN_BRAKET_INPUT_DIR", "")
    graph_file = os.path.join(input_dir, "graph.json") if input_dir else None

    if graph_file and os.path.exists(graph_file):
        with open(graph_file) as f:
            graph_data = json.load(f)
        graph_edges = [tuple(e) for e in graph_data["edges"]]
        n_qubits = graph_data["n_nodes"]
    else:
        # Default: triangle graph
        graph_edges = [(0, 1), (1, 2), (0, 2)]
        n_qubits = 3

    # Setup device
    device_arn = os.environ.get("AMZN_BRAKET_DEVICE_ARN", None)
    if device_arn:
        from braket.aws import AwsDevice

        device = AwsDevice(device_arn)
    else:
        from braket.devices import LocalSimulator

        device = LocalSimulator()

    # Check for checkpoint
    checkpoint = load_job_checkpoint()
    if checkpoint:
        params = np.array(checkpoint["params"])
    else:
        params = np.random.uniform(0, np.pi, size=2 * n_layers)

    # Optimization loop
    from scipy.optimize import minimize

    best_cost = float("inf")
    best_params = params.copy()

    def cost_fn(params):
        nonlocal best_cost, best_params
        gammas = params[:n_layers]
        betas = params[n_layers:]

        circuit = qaoa_circuit(graph_edges, n_qubits, gammas, betas)

        if hasattr(device, "run"):
            s3 = (os.environ.get("AMZN_BRAKET_OUT_S3_BUCKET", ""), "jobs")
            try:
                task = device.run(circuit, s3_destination_folder=s3, shots=n_shots)
                result = task.result()
            except Exception:
                from braket.devices import LocalSimulator

                result = LocalSimulator().run(circuit, shots=n_shots).result()
        else:
            result = device.run(circuit, shots=n_shots).result()

        # Compute expected MaxCut cost
        counts = result.measurement_counts
        total = sum(counts.values())
        expected_cost = sum(
            maxcut_cost(bs, graph_edges) * count / total for bs, count in counts.items()
        )

        neg_cost = -expected_cost  # Minimize negative cost = maximize cut
        if neg_cost < best_cost:
            best_cost = neg_cost
            best_params = params.copy()

        log_metric(metric_name="maxcut_value", value=expected_cost)
        return neg_cost

    minimize(cost_fn, params, method="COBYLA", options={"maxiter": maxiter})

    # Save results
    gammas = best_params[:n_layers]
    betas = best_params[n_layers:]
    final_circuit = qaoa_circuit(graph_edges, n_qubits, gammas, betas)
    from braket.devices import LocalSimulator

    final_result = LocalSimulator().run(final_circuit, shots=n_shots * 10).result()
    counts = final_result.measurement_counts
    best_bitstring = max(counts, key=lambda bs: maxcut_cost(bs, graph_edges))

    save_job_result(
        {
            "optimal_params": best_params.tolist(),
            "best_cut_value": maxcut_cost(best_bitstring, graph_edges),
            "best_partition": best_bitstring,
            "n_edges": len(graph_edges),
            "graph_edges": graph_edges,
        }
    )


if __name__ == "__main__":
    main()
