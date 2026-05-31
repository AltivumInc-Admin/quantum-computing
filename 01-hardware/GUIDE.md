# Quantum Hardware on Amazon Braket

## Learning Objectives

After completing this section, you will be able to:
- Explain the differences between trapped-ion, superconducting, and neutral-atom quantum computers
- Query Amazon Braket for available devices and their properties
- Choose the appropriate device for a given circuit based on connectivity, gate set, and cost
- Understand noise sources and their impact on computation fidelity
- Estimate costs before submitting tasks to real hardware

## Prerequisites

- Completed: 00-foundations (circuit building, gates, measurement)
- AWS credentials configured (run `make setup` to validate)

---

## Concepts

### Quantum Hardware Technologies

There is no single "best" quantum computer. Different physical implementations have different strengths, and Amazon Braket gives you access to multiple technologies through a unified API.

**Key differentiators between hardware:**
- Qubit connectivity (which qubits can directly interact)
- Native gate set (what operations the hardware performs directly)
- Gate fidelity (how accurately gates execute)
- Coherence time (how long qubits maintain their quantum state)
- Clock speed (how fast gates execute)
- Qubit count (total available qubits)

### IonQ — Trapped Ion Quantum Computers

**Technology:** Individual ions (charged atoms) trapped in electromagnetic fields. Qubit states are encoded in the energy levels of each ion. Gates are performed using precisely tuned laser pulses.

**Available on Braket:**
- IonQ Aria (25 qubits) — Production workhorse
- IonQ Forte (36 qubits) — Higher qubit count, enhanced performance

**Strengths:**
- All-to-all connectivity: Any qubit can interact with any other qubit directly. No need for SWAP chains to move information.
- High gate fidelity: Single-qubit gates >99.5%, two-qubit gates >97%
- Long coherence times: Qubits maintain state for seconds (vs. microseconds for superconducting)

**Trade-offs:**
- Slower clock speed: Gate operations take microseconds (vs. nanoseconds for superconducting)
- Fewer qubits than superconducting approaches (currently)

**Native gate set on Braket:** GPi, GPi2, MS (Molmer-Sorensen)

**Best for:** Algorithms requiring heavy qubit connectivity (QAOA on dense graphs), circuits where gate fidelity matters more than speed.

### IQM — Superconducting Quantum Computers

**Technology:** Superconducting circuits cooled to near absolute zero (~15 millikelvin). Qubits are tiny electrical circuits (transmons) that behave quantum mechanically at these temperatures. Gates are microwave pulses.

**Available on Braket:**
- IQM Garnet (20 qubits) — Square lattice topology

**Strengths:**
- Fast gate speed: Operations complete in nanoseconds
- Mature fabrication: Leverages semiconductor manufacturing techniques
- Good for circuits with local interactions

**Trade-offs:**
- Limited connectivity: Nearest-neighbor only (square lattice). Distant qubit interactions require SWAP chains, adding depth and error.
- Shorter coherence times: ~100 microseconds
- Lower two-qubit gate fidelity than trapped ions (improving rapidly)

**Native gate set on Braket:** CZ, PRx (parameterized rotation)

**Best for:** Circuits with nearest-neighbor structure, algorithms where speed matters, research on error mitigation.

### QuEra — Neutral Atom (Analog Hamiltonian Simulation)

**Technology:** Arrays of neutral atoms (rubidium) held in optical tweezers (focused laser beams). Qubits are encoded in atomic energy levels. Computation happens by evolving the system under a carefully designed Hamiltonian — this is analog quantum computing, fundamentally different from the gate model.

**Available on Braket:**
- QuEra Aquila (256 qubits) — Analog Hamiltonian Simulator

**Key difference:** Aquila does NOT run gate-based circuits. Instead, you define:
- Atom positions (the geometry of your problem)
- Time-dependent driving fields (Rabi frequency, detuning)
- The system evolves under the Rydberg Hamiltonian

**Strengths:**
- Large qubit count (256 atoms)
- Natural for optimization and simulation problems that map to geometric arrangements
- Programmable atom positions allow problem-specific configurations

**Best for:** Maximum Independent Set problems, quantum simulation of condensed matter systems, optimization problems with geometric structure.

### Managed Simulators (SV1, DM1, TN1)

Amazon Braket provides three fully managed classical simulators that run your quantum circuits on AWS infrastructure:

**SV1 — State Vector Simulator:**
- Simulates up to 34 qubits
- Exact simulation (no sampling noise from the simulator itself)
- Best for: Debugging circuits, verifying algorithms, circuits up to ~30 qubits
- Cost: \$0.075/minute

**DM1 — Density Matrix Simulator:**
- Simulates up to 17 qubits
- Supports noise modeling (depolarizing, amplitude damping, etc.)
- Best for: Studying noise effects, error mitigation research, small noisy circuits
- Cost: \$0.075/minute

**TN1 — Tensor Network Simulator:**
- Handles circuits with up to 50 qubits (depending on entanglement structure)
- Uses tensor network contraction — efficient for circuits with limited entanglement
- Best for: Large shallow circuits, circuits with 1D/2D local connectivity
- Cost: \$0.275/minute

**Local Simulator:**
- Runs on your machine (free)
- State vector simulation, up to ~25 qubits (depends on your RAM — each qubit doubles memory: 2^n complex amplitudes)
- Best for: Development, debugging, rapid iteration

### Device Properties and Selection

When choosing a device, consider:

| Factor | Local | SV1/DM1/TN1 | IonQ | IQM | QuEra |
|--------|-------|--------------|------|-----|-------|
| Cost | Free | \$/minute | \$/shot+task | \$/shot+task | \$/shot+task |
| Qubits | ~25 | 34/17/50 | 25-36 | 20 | 256 (analog) |
| Noise | None | Optional (DM1) | Real | Real | Real |
| Speed | Instant | Seconds-minutes | Minutes-hours (queue) | Minutes-hours (queue) | Minutes-hours (queue) |
| Gate model | Yes | Yes | Yes | Yes | No (analog) |

**Workflow recommendation:**
1. Develop and debug on local simulator (free, instant)
2. Validate at scale on SV1 (up to 34 qubits, exact)
3. Study noise effects on DM1 (add noise models)
4. Run on real QPU only when necessary (costly, queued)

### Cost Model

**QPU devices (IonQ, IQM, QuEra):**
- Per-task fee: \$0.30 (charged each time you submit a circuit)
- Per-shot fee: Varies by provider (see CLAUDE.md for current rates)
- Example: 1000 shots on IonQ = \$0.30 + (1000 x \$0.01) = \$10.30

**Managed simulators:**
- Per-minute billing (minimum varies)
- No per-shot charge
- Example: 2-minute SV1 run = \$0.15

---

## Hands-On Exercises

1. **`notebooks/01-device-discovery.ipynb`** — Use `AwsDevice.get_devices()` to list all available hardware. Inspect device properties: qubit count, native gates, connectivity, status, queue depth.

2. **`notebooks/02-ionq-exploration.ipynb`** — Submit a simple circuit to IonQ (or simulate locally). Examine native gate decomposition. Compare results across shot counts. (Cost warning included in notebook.)

3. **`notebooks/03-iqm-exploration.ipynb`** — Build circuits respecting nearest-neighbor topology. Observe how the transpiler adds SWAP gates for non-adjacent interactions. Compare circuit depth before/after transpilation.

4. **`notebooks/04-quera-analog.ipynb`** — Define atom arrangements with `AnalogHamiltonianSimulation`. Set driving fields (Rabi frequency, detuning). Solve a small Maximum Independent Set problem.

5. **`notebooks/05-simulator-comparison.ipynb`** — Run the same circuit on SV1, DM1 (with noise), TN1, and local simulator. Compare results, runtime, and cost. Understand when each is appropriate.

6. **`notebooks/06-noise-and-errors.ipynb`** — Add noise channels (depolarizing, amplitude damping) to circuits on DM1. Compare noisy vs. ideal results. Introduction to error mitigation (zero-noise extrapolation concept).

**Scripts:**
- `scripts/device_status.py` — Run from terminal: `python 01-hardware/scripts/device_status.py` to check current device availability without opening a notebook
- `scripts/cost_estimator.py` — Estimate costs: `python 01-hardware/scripts/cost_estimator.py --device ionq --shots 1000`

---

## References

### AWS Documentation
- [Amazon Braket supported devices](https://docs.aws.amazon.com/braket/latest/developerguide/braket-devices.html) — Complete list of available hardware and regions
- [Amazon Braket pricing](https://aws.amazon.com/braket/pricing/) — Current per-shot and per-task pricing for all devices
- [Testing with simulators](https://docs.aws.amazon.com/braket/latest/developerguide/braket-test.html) — SV1, DM1, TN1 capabilities and limits
- [IonQ device properties](https://docs.aws.amazon.com/braket/latest/developerguide/braket-devices-ionq.html) — Native gates, connectivity, specifications
- [IQM device properties](https://docs.aws.amazon.com/braket/latest/developerguide/braket-devices-iqm.html) — Topology, native gates, compilation
- [QuEra Aquila documentation](https://docs.aws.amazon.com/braket/latest/developerguide/braket-devices-quera.html) — Analog Hamiltonian simulation setup

### Video Resources
- [Trapped-Ion Quantum Computing Explained — IonQ](https://www.youtube.com/watch?v=F8OU-XtqkKs) — Chris Monroe, IonQ co-founder, 45 min, how trapped ion hardware works from physics up
- [Superconducting Quantum Computing — IBM Research](https://www.youtube.com/watch?v=OGPyyDlHwCY) — Jay Gambetta, 40 min, transmon physics and engineering challenges
- [Neutral Atom Quantum Computing — QuEra](https://www.youtube.com/watch?v=tnYkR3fTTW8) — Alex Keesling, 35 min, Rydberg atoms and analog simulation
- [Amazon Braket Hardware Overview — AWS re:Invent 2023](https://www.youtube.com/watch?v=d0cNmPHKPcY) — Richard Moulds, 45 min, comparing hardware on Braket with live demos
- [Quantum Error Correction Explained](https://www.youtube.com/watch?v=1WHJCOotCkI) — Veritasium, 25 min, accessible intro to why noise matters
- [How a Quantum Computer Works — Kurzgesagt](https://www.youtube.com/watch?v=-UlxHPIEVqA) — 10 min, excellent visual overview of hardware types

### Papers & Further Reading
- [Quantum Computing: An Applied Approach (Hidary)](https://link.springer.com/book/10.1007/978-3-030-83274-2) — Chapter 15 covers hardware platforms in detail
- [IonQ Aria Architecture Paper](https://arxiv.org/abs/2312.10847) — Technical details of the Aria system
- [Neutral atom quantum computing review (Henriet et al.)](https://arxiv.org/abs/2006.12326) — Comprehensive review of neutral atom approaches
- [Quantum Computing in the NISQ era and beyond (Preskill)](https://arxiv.org/abs/1801.00862) — Foundational paper on what's possible with noisy hardware
