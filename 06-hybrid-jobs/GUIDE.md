# Production Hybrid Quantum-Classical Jobs

Everything in this curriculum so far has run from a notebook on your laptop: build a circuit, submit it, wait, read the result. That is exactly how you should learn — and exactly how you should not run a real variational algorithm. A VQE that scans a molecule's bond lengths submits thousands of circuits, each waiting in a shared device queue, each iteration blocking on the last. Run that from a notebook and you will spend a weekend babysitting it. This final module is about handing that loop to AWS: packaging the VQE you built in module 05 as a managed **Hybrid Job** that gets priority access to the hardware, compiles once, checkpoints itself, streams its own metrics, and tears itself down when it is done.

## Learning Objectives

After completing this section, you will be able to:
- Decide when to use Braket Hybrid Jobs vs. standalone quantum tasks
- Create, submit, monitor, and retrieve results from hybrid jobs
- Use parametric compilation to accelerate iterative algorithms
- Implement checkpointing for fault-tolerant long-running jobs
- Build custom containers for specialized job environments
- Set up cost controls, monitoring, and production-grade error handling

## Prerequisites

- Completed: 00 through 05 (all previous sections)
- AWS credentials with Braket and IAM permissions (run `make deploy-infra`)
- Understanding of variational algorithms (VQE, QAOA, QML training loops)

---

## When a Job Earns Its Keep

The decision is not "hybrid jobs are better." A single circuit you are debugging interactively has no business inside a job — the container startup alone is pure overhead. The break-even is about *iteration*. A standalone task is fire-and-forget: you submit it and it joins the back of the device's general queue, behind everyone else on Earth. For one circuit, fine. For a five-hundred-iteration optimization where each step depends on the last, that queue wait is paid *five hundred times over*, and your classical optimizer sits idle between every one.

```qcard
{"id":"hybrid-break-even-iteration","prompt":"What is the key factor that determines whether a Braket Hybrid Job beats a standalone task on wall-clock time?","answer":"Iteration. In a standalone task each iteration rejoins the back of the device's general queue, so a high-iteration loop pays that queue wait once per step; a Hybrid Job gives priority access so iterations run back-to-back. High queue wait plus many iterations favors the job; a few quick iterations favors standalone."}
```

A Hybrid Job changes the economics. Braket spins up a managed classical instance, runs your script there, and — crucially — the quantum tasks it submits get **priority access**: they jump to the front of the device queue and run back-to-back. You trade a per-hour instance charge for the elimination of all that repeated queueing. Move the sliders below to feel the trade — where the queue wait is real and the iteration count is high, the job wins on wall-clock by a landslide; for a handful of quick iterations, the standalone path is cheaper and simpler.

```qjob
{ "iterations": 60, "shots": 1000, "provider": "IonQ", "instance": "ml.m5.large", "queueWaitSec": 45, "iterSec": 6 }
```

**Use a Hybrid Job when** your algorithm iterates between quantum and classical steps (VQE, QAOA, QML training), needs priority access, benefits from parametric compilation, runs longer than a few minutes, or wants checkpointing and metrics. **Use standalone tasks when** you are running a single circuit, exploring interactively, or genuinely do not need priority.

## Inside a Hybrid Job

When you call `AwsQuantumJob.create(...)`, Braket assembles a self-contained execution environment around your code:

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

You provide an algorithm script (the entry point), optional hyperparameters, and input data. Braket provides the container, the SDK, priority QPU access, and the metrics pipeline. While your script runs, the quantum tasks it submits carry a job token that marks them as priority work — without it, each iteration might wait minutes or hours in the general queue; with it, iterations complete one after another. When the script finishes, results land in S3, metrics and logs in CloudWatch, and the container is torn down so you stop paying for it.

```qcard
{"id":"hybrid-priority-job-token","prompt":"Inside a Hybrid Job, what gives the quantum tasks priority access to the device instead of waiting in the general queue?","answer":"A job token. While your script runs, every quantum task it submits carries a job token that marks it as priority work, so iterations jump to the front of the device queue and complete one after another."}
```

## Compile Once, Run a Thousand Times

There is a second, subtler tax on variational algorithms. On hardware that must transpile to native gates — superconducting QPUs especially — every circuit you submit is compiled before it runs, and compilation can dominate the per-iteration time. But a variational loop submits the *same circuit structure* every iteration; only the rotation angles change. Recompiling it each time is wasted work.

**Parametric compilation** fixes this. You declare the angles as free parameters, and Braket compiles the circuit once, then reuses the compiled program across iterations, substituting new parameter values each run:

```qcard
{"id":"hybrid-parametric-compilation","prompt":"How does parametric compilation accelerate a variational loop that submits the same circuit structure each iteration?","answer":"You declare the rotation angles as free parameters (`FreeParameter`), so Braket compiles the circuit once and then reuses the compiled program across iterations, substituting new parameter values each run. The compilation cost is paid once instead of per iteration."}
```

```python
from braket.circuits import Circuit, FreeParameter

theta = FreeParameter("theta")
circuit = Circuit().rx(0, theta).cnot(0, 1)

# First run: compiles and executes
result1 = device.run(circuit, shots=1000, inputs={"theta": 0.5})

# Subsequent runs: skips compilation, only updates the parameter
result2 = device.run(circuit, shots=1000, inputs={"theta": 0.7})
```

The compilation cost is paid once instead of per iteration — for a long optimization, the savings compound dramatically. Drag the iteration count up and watch the gap widen:

```qparam
{ "iterations": 50, "compileSec": 8, "runSec": 2 }
```

This same parameterized circuit is the literal inner loop of every hybrid job: one fixed structure, a fresh $\theta$ each step chosen by the classical optimizer. Play the optimizer's role — drag $\theta$ and scrub to watch the two-qubit variational state respond:

```qscrub
qubits 2
RY 0 theta
RY 1 theta
CNOT 0 1
```

## The Job Lifecycle and Its Metrics

A job moves through a fixed lifecycle: you **create** it, it **queues** for the device, the container spins up and **runs** your algorithm with priority quantum access, your script **logs metrics** as it goes, optionally **checkpoints** its state, and on **completion** writes results to S3 for **retrieval**. Three channels carry information in and out. *Hyperparameters* are key-value knobs (learning rate, layer count, shot count) passed into your script. *Input data* — training sets, molecular geometries, graphs — is staged from S3 into the container at startup. *Output artifacts and metrics* flow back out: files to S3, and numeric metrics streamed live to CloudWatch via `log_metric`.

That metrics stream is what turns a job from a black box into something you can watch. Logging the energy each VQE iteration gives you a live convergence curve — the same descent you drove by hand in module 05, now reporting itself from inside a running job. This is exactly what you would see in CloudWatch as the optimization homes in on the ground state; the dashed line is a `stopping_condition` you might set to halt early once converged:

```qmetrics
{ "R": 0.74, "threshold": -1.13 }
```

## Surviving Failure

A job that runs for hours is a job that can fail for hours' worth of reasons: a spot instance reclaimed, a transient device error, a timeout. Without protection, a failure at iteration 480 of 500 throws away every completed step — you restart from zero. **Checkpointing** is the cure. Your script periodically calls `save_job_checkpoint()` to persist its optimizer state; on restart, `load_job_checkpoint()` resumes from the last saved point, and only the work since that checkpoint is redone. The trade-off is granularity: checkpoint too rarely and a failure still costs you a lot; checkpoint every step and you add I/O overhead. Move the failure point and the checkpoint interval to see how much compute each strategy salvages:

```qcard
{"id":"hybrid-checkpointing","prompt":"How does checkpointing protect a long-running Hybrid Job from losing all progress when it fails mid-run?","answer":"The script periodically calls `save_job_checkpoint()` to persist its optimizer state; on restart, `load_job_checkpoint()` resumes from the last saved point, so only the work done since that checkpoint is redone rather than the entire run."}
```

```qcheckpoint
{ "iterations": 40, "failAt": 27, "every": 10 }
```

## Bringing Your Own Environment

The default Braket container ships the SDK and common packages, but real workloads have real dependencies — the chemistry stack from module 05 (OpenFermion, PySCF), a heavy ML framework, a pinned library version. For those you build a **custom container**: start from the Braket base image, add your dependencies, build and push to Amazon ECR, and pass the image URI to `AwsQuantumJob.create(image_uri=...)`. The `containers/` directory here has a working `Dockerfile` and a `build_and_push.sh` to do exactly that. Tasks submitted from inside your container still carry the job token, so they keep priority access and job-rate billing rather than being charged as standalone tasks.

## Keeping the Bill in Check

A Hybrid Job's cost is two streams added together: the classical **instance** (billed per hour for as long as the container runs) and the **quantum** tasks (the same per-task and per-shot rates as standalone — a job gives you priority, not a discount). The instance is the new variable to manage:

- `ml.m5.large` — the default, fine for most variational algorithms
- `ml.m5.xlarge` — more memory for larger problems
- `ml.p3.2xlarge` / `ml.g4dn.xlarge` — GPU, for classical ML components or CUDA-Q simulation

Control spend with `max_runtime` to cap duration, a `stopping_condition` to halt on a metric (the threshold you saw in the dashboard above), CloudWatch alarms, and AWS Budget alerts (templates in `infra/`). As a rule of thumb the instance runs **\$0.10–\$3.00/hour** depending on type, and the quantum charges are unchanged from standalone — so the cheapest job is the one that converges fast and shuts down promptly.

## PennyLane and CUDA-Q

PennyLane drops straight into a Hybrid Job — point its device at the job's QPU and let its optimizers drive the loop, logging each step:

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

For circuits beyond ~20 qubits on a simulator, **CUDA-Q** provides GPU-accelerated state-vector and tensor-network simulation — dramatically faster on a `ml.p3.2xlarge` or `ml.g4dn.xlarge`, and available as a Braket-provided container image.

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
- [Using parametric compilation to speed up Hybrid Jobs](https://docs.aws.amazon.com/braket/latest/developerguide/braket-jobs-parametric-compilation.html) — Compile-once-reuse for FreeParameter circuits
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

---

You have reached the end of the path: from a single qubit in `00-prereqs` to a fault-tolerant, cost-controlled, production VQE running itself on managed infrastructure. You can now build a circuit, choose the right hardware, run the canonical algorithms, train quantum models, fold a molecule onto qubits, and ship the whole thing as a job that scales. The frontier from here is no longer learning the tools — it is pointing them at a problem worth solving.
