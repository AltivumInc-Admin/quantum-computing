# Production Hybrid Quantum-Classical Jobs

## Learning Objectives

After completing this section, you will be able to:
- Decide when to use Braket Hybrid Jobs vs. standalone quantum tasks
- Create, submit, monitor, and retrieve results from hybrid jobs
- Use parametric compilation to accelerate iterative algorithms
- Implement checkpointing for fault-tolerant long-running jobs
- Build custom containers for specialized job environments
- Set up cost controls, monitoring, and production-grade error handling

## Prerequisites

- Completed: 00 through 04 (all previous sections)
- AWS credentials with Braket and IAM permissions (run `make deploy-infra`)
- Understanding of variational algorithms (VQE, QAOA, QML training loops)

---

## Concepts

### When to Use Hybrid Jobs

**Use Hybrid Jobs when:**
- Your algorithm requires iterative quantum-classical communication (VQE, QAOA, QML training)
- You need priority QPU access (job tasks jump the queue)
- You want parametric compilation (compile once, vary parameters)
- The computation runs for more than a few minutes
- You need checkpointing, metrics, or reproducible environments

**Use standalone quantum tasks when:**
- You're running a single circuit (no iteration)
- You're exploring/debugging interactively
- You don't need priority access

### Hybrid Job Architecture

A Braket Hybrid Job runs in a managed container on EC2:

1. **You provide:** An algorithm script (entry point), optional hyperparameters, input data
2. **Braket provides:** Container environment, SDK, QPU priority access, metrics pipeline
3. **During execution:** Your script submits quantum tasks that get priority QPU access
4. **After completion:** Results stored in S3, metrics in CloudWatch, logs in CloudWatch Logs

```
+-------------------+        +-------------------+
|  Your Algorithm   | -----> | Quantum Device    |
|  (EC2 container)  | <----- | (QPU or Simulator)|
|                   |        +-------------------+
|  Classical logic  |
|  Optimization     |        +-------------------+
|  Data processing  | -----> | S3 Results Bucket |
+-------------------+        +-------------------+
        |
        v
+-------------------+
| CloudWatch Metrics|
+-------------------+
```

### Priority QPU Access

Tasks submitted from within a Hybrid Job get priority over tasks submitted directly:
- Your job's tasks go to the front of the device queue
- This is critical for iterative algorithms where latency between iterations matters
- Without priority, each iteration might wait minutes/hours in the general queue
- With priority, iterations complete back-to-back

### Parametric Compilation

For variational algorithms, the circuit structure stays the same — only parameters change:

```python
from braket.circuits import Circuit, FreeParameter

theta = FreeParameter("theta")
circuit = Circuit().rx(0, theta).cnot(0, 1)

# First run: compiles and executes
result1 = device.run(circuit, shots=1000, inputs={"theta": 0.5})

# Subsequent runs: skips compilation, only updates parameter
result2 = device.run(circuit, shots=1000, inputs={"theta": 0.7})
```

Parametric compilation saves significant time on hardware that requires transpilation (IQM, Rigetti). The circuit is compiled to native gates once, then only parameter values are updated.

### Job Lifecycle

1. **Create:** `AwsQuantumJob.create(...)` — defines script, device, hyperparameters
2. **Queued:** Job waits for the specified device to become available
3. **Running:** Container spins up, algorithm executes, quantum tasks get priority
4. **Metrics:** Your script logs metrics via `log_metric()` — visible in near-real-time
5. **Checkpointing:** Save intermediate state with `save_job_checkpoint()`
6. **Completion:** Results saved to S3, container terminated
7. **Retrieval:** Download results and artifacts

### Hyperparameters, Inputs, and Outputs

**Hyperparameters:** Key-value pairs passed to your algorithm (e.g., learning_rate, n_layers, n_shots). Accessed via `load_job_checkpoint()` or environment variables.

**Input data:** S3 paths to training data, molecular geometries, or graph structures. Automatically downloaded to the container at runtime.

**Output artifacts:** Files your script writes to the output directory. Automatically uploaded to S3 after completion.

**Metrics:** Numeric values logged during execution (loss, energy, fidelity). Stream to CloudWatch for real-time monitoring.

### Custom Containers

The default Braket container includes the SDK and common packages. For specialized dependencies (custom chemistry libraries, large ML frameworks), build a custom container:

1. Create Dockerfile based on Braket base image
2. Add your dependencies
3. Build and push to Amazon ECR
4. Reference the image URI in `AwsQuantumJob.create(image_uri=...)`

### Cost Management

**Instance selection:**
- `ml.m5.large`: Default, sufficient for most variational algorithms
- `ml.m5.xlarge`: More memory for larger problems
- `ml.p3.2xlarge`: GPU for classical ML components

**Cost controls:**
- Set `max_runtime` to cap job duration
- Use `stopping_condition` to halt based on metrics
- Monitor with CloudWatch alarms
- Set AWS Budget alerts (see infra/ templates)

**Approximate costs:**
- EC2 instance: $0.10-$3.00/hour depending on type
- QPU charges: Same per-task and per-shot rates as standalone
- Total: Job instance cost + quantum hardware cost

### PennyLane with Hybrid Jobs

PennyLane integrates naturally with Hybrid Jobs:

```python
import pennylane as qml
from braket.jobs import save_job_result
from braket.jobs.metrics import log_metric

dev = qml.device("braket.aws.qubit", device_arn=os.environ["AMZN_BRAKET_DEVICE_ARN"], ...)

@qml.qnode(dev)
def circuit(params):
    ...

optimizer = qml.AdamOptimizer(stepsize=0.1)
for step in range(100):
    params, cost = optimizer.step_and_cost(circuit, params)
    log_metric(metric_name="cost", value=cost, iteration_number=step)

save_job_result({"optimal_params": params.tolist(), "final_cost": float(cost)})
```

### CUDA-Q Integration

For GPU-accelerated quantum simulation within Hybrid Jobs:
- CUDA-Q provides GPU-based state vector and tensor network simulation
- Dramatically faster for circuits > 20 qubits on simulator
- Use `ml.p3.2xlarge` or `ml.g4dn.xlarge` instances
- Available as a Braket-provided container image

---

## Hands-On Exercises

1. **`notebooks/01-first-hybrid-job.ipynb`** — Create your first Hybrid Job: a simple bell-state circuit repeated with different parameters. Submit, monitor status, retrieve results from S3.

2. **`notebooks/02-parametric-compilation.ipynb`** — Compare execution time with and without parametric compilation for a variational circuit. Measure the speedup for 50 parameter updates.

3. **`notebooks/03-monitoring-metrics.ipynb`** — Log custom metrics (energy, loss) during a VQE job. View them in CloudWatch. Set up basic alerting.

4. **`notebooks/04-checkpointing.ipynb`** — Implement checkpointing in a long-running QAOA optimization. Simulate a failure. Restart from checkpoint. Verify correct resumption.

5. **`notebooks/05-custom-containers.ipynb`** — Build a custom container with extra chemistry libraries. Push to ECR. Run a job using the custom image.

6. **`notebooks/06-pennylane-jobs.ipynb`** — Run a full PennyLane variational training loop as a Hybrid Job. Use PennyLane optimizers, log training curves, retrieve optimal parameters.

7. **`notebooks/07-production-patterns.ipynb`** — Production-grade patterns: error handling, retries, timeout configuration, cost estimation before submission, result validation after completion.

**Algorithms (production scripts):**
- `algorithms/qaoa_maxcut_job.py` — Production QAOA solver: accepts graph as input, outputs optimal partition
- `algorithms/vqe_chemistry_job.py` — Production VQE: accepts molecular geometry, outputs ground state energy
- `algorithms/qml_training_job.py` — Production QML trainer: accepts dataset, outputs trained model parameters

**Containers:**
- `containers/Dockerfile` — Custom container with OpenFermion, PySCF, and additional chemistry tools
- `containers/build_and_push.sh` — Script to build the Docker image and push to ECR

---

## References

### AWS Documentation
- [Working with Amazon Braket Hybrid Jobs](https://docs.aws.amazon.com/braket/latest/developerguide/braket-jobs.html) — Complete Hybrid Jobs guide
- [Key concepts for Hybrid Jobs](https://docs.aws.amazon.com/braket/latest/developerguide/braket-jobs-concepts.html) — Inputs, outputs, metrics, checkpoints
- [Create a Hybrid Job](https://docs.aws.amazon.com/braket/latest/developerguide/braket-jobs-first.html) — Step-by-step creation walkthrough
- [Custom containers for Hybrid Jobs](https://docs.aws.amazon.com/braket/latest/developerguide/running-hybrid-jobs-in-own-container.html) — Building and using custom Docker images
- [Using PennyLane with Braket](https://docs.aws.amazon.com/braket/latest/developerguide/hybrid.html) — PennyLane integration guide
- [Using CUDA-Q with Braket](https://docs.aws.amazon.com/braket/latest/developerguide/braket-using-cuda-q.html) — GPU-accelerated simulation setup

### Video Resources
- [Amazon Braket Hybrid Jobs Deep Dive — AWS re:Invent 2023](https://www.youtube.com/watch?v=uKrNWHxEIow) — AWS Quantum team, 45 min, architecture and best practices for hybrid jobs
- [Running Variational Algorithms at Scale — AWS Quantum Blog](https://www.youtube.com/watch?v=jYLeHwXX8QQ) — 30 min, VQE and QAOA as Hybrid Jobs with parametric compilation
- [PennyLane + Braket Hybrid Jobs Tutorial](https://www.youtube.com/watch?v=7cOEqPPk7JQ) — Xanadu + AWS, 25 min, full PennyLane training loop as a job
- [Containerized Quantum Workloads on AWS](https://www.youtube.com/watch?v=fD-3WBNlnHY) — AWS Containers team, 35 min, Docker + ECR + Braket
- [Quantum-Classical Hybrid Algorithms Explained](https://www.youtube.com/watch?v=A2ozpWB7c2A) — IBM Research, 40 min, general theory of hybrid approaches
- [Cost Optimization for Quantum Computing on AWS](https://www.youtube.com/watch?v=d9ks9FvyQhE) — AWS, 20 min, budgeting and cost management strategies

### Papers & Further Reading
- [Amazon Braket: Quantum Computing Made Accessible (AWS whitepaper)](https://d1.awsstatic.com/whitepapers/quantum-computing-with-amazon-braket.pdf) — Architecture and service design
- [Optimizing parametric circuits for NISQ devices (Mitarai et al., 2018)](https://arxiv.org/abs/1803.00745) — Theory behind parametric compilation benefits
- [Scalable Quantum Simulation of Molecular Energies (O'Malley et al., 2016)](https://arxiv.org/abs/1512.06860) — Early demonstration of hybrid quantum-classical chemistry
- [PennyLane: Automatic differentiation of hybrid quantum-classical computations](https://arxiv.org/abs/1811.04968) — PennyLane framework paper
