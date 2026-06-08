# Quantum Hardware on Amazon Braket

You spent the last two modules building flawless circuits on an ideal simulator — perfect gates,
perfect measurements, infinite patience, no bill. Real quantum computers are none of those
things. They are **noisy**, **sparsely wired**, **slow**, and **metered**. This module is about
meeting that reality: what today's machines actually are, how their imperfections bite your
circuits, and how to choose (and pay for) the right one.

Everything here runs live in your browser — the noise, the routing, and the cost are all
simulated or computed locally. Nothing submits a task or spends a cent.

> **You'll come away able to** tell trapped-ion, superconducting, and neutral-atom machines
> apart, read a device's connectivity and fidelity, reason about noise, climb the simulator
> ladder, and estimate cost before you ever touch a QPU. **You'll want first:** `01-foundations`
> (circuits, gates, measurement). To run the notebooks on real hardware you'll also need AWS
> credentials (`make setup`) — but none of this page requires them.

---

## Why there's no single "best" quantum computer

If one hardware approach were strictly better, there would only be one. Instead, every physical
implementation trades one virtue for another, and Amazon Braket hands you several of them behind
a single API so you can pick per problem. The axes that actually decide a circuit's fate:

- **Connectivity** — which qubits can directly interact. All-to-all means any pair entangles
  directly; a 2D lattice means distant qubits must be shuttled together first.
- **Gate fidelity** — how accurately each gate executes. Errors compound, so a long circuit on a
  98%-per-gate machine can be mostly noise by the end.
- **Coherence time** — how long a qubit holds its state before it decays. Your whole circuit must
  finish well inside it.
- **Clock speed** — how fast gates run (nanoseconds vs microseconds).
- **Qubit count** — how big a problem you can even express.

Hold these five in mind. Every device below is just a different point in this trade-off space —
and the next two sections show the two trade-offs that bite hardest.

## Noise — the defining reality of NISQ

We live in the **NISQ** era: Noisy Intermediate-Scale Quantum. "Noisy" is the operative word.
Real gates are slightly wrong, qubits slowly leak their state to the environment
(**decoherence**), and measurement itself can misread. The result: the clean probability peaks
your circuit *should* produce smear out toward random noise, more so the deeper the circuit.

Two canonical error models capture most of it. **Depolarizing** noise nudges a qubit toward the
maximally mixed state — a coin that forgets which way it was leaning. **Amplitude damping**
models energy loss — an excited $\ket{1}$ relaxing back toward $\ket{0}$, the way a real qubit
decays. **Fidelity** measures how close the noisy result stays to the ideal.

Watch it happen. Below is the Bell pair you built in foundations. At error rate 0 the two peaks
($\ket{00}$ and $\ket{11}$) are crisp and the fidelity is 100%. Push the slider, and watch the
distribution rot toward flat noise — then switch the channel from depolarizing to amplitude
damping and see how differently they corrupt:

```qnoise
qubits 2
H 0
CNOT 0 1
```

This is *the* reason quantum computing is hard, and why so much of the field is about error
mitigation and, eventually, error correction. Every circuit you run on real hardware is a race
against this decay.

```qcard
{"id":"hw-nisq-noise-1","prompt":"In the NISQ era, what happens to a circuit's ideal probability peaks as the circuit gets deeper, and why?","answer":"They smear out toward flat random noise. Real gates are slightly wrong, qubits leak their state to the environment (decoherence), and measurement can misread, so errors accumulate and grow worse the deeper the circuit runs."}
```

## Connectivity — the wiring constraint

The second tax is geometric. A two-qubit gate needs the two qubits to be physically adjacent. If
your hardware only wires up nearest neighbors and your algorithm wants qubit 0 to talk to qubit
8, the compiler must first **SWAP** the states along a chain of intermediate qubits to bring them
together — and every SWAP is three more two-qubit gates, adding depth and, per the section above,
more noise.

Drag the endpoints below on a 3×3 grid (IQM-style nearest-neighbor lattice) and watch the SWAP
chain the router has to insert. Then imagine the same gate on a trapped-ion machine, where every
qubit is already connected to every other: **zero** SWAPs.

```qcard
{"id":"hw-swap-tax-1","prompt":"On a nearest-neighbor (lattice) device, what must the compiler do to run a two-qubit gate between non-adjacent qubits, and what does it cost?","answer":"It inserts a chain of `SWAP` gates along the shortest path to bring the two qubits together. Each `SWAP` costs roughly three more two-qubit gates, adding circuit depth and noise. On an all-to-all machine this cost is zero."}
```

```qtopo
{"topology": "grid", "qubits": 9, "gate": [0, 8]}
```

Connectivity is why an algorithm that looks shallow on paper can balloon in depth on real
hardware — and why all-to-all machines are prized for densely connected problems.

## The three hardware families

With those two trade-offs in hand, the devices on Braket sort into three physical families, each
sitting at a different point in the space.

**IonQ — trapped ions.** Individual charged atoms held in electromagnetic fields; qubits encoded
in their energy levels, gates driven by laser pulses. *Aria* (25 qubits) and *Forte* (36) are on
Braket, with native gates GPi, GPi2, and the Mølmer–Sørensen (MS) entangler. Their superpower is
**all-to-all connectivity** (no SWAP tax) and high fidelity (single-qubit >99.5%, two-qubit
>97%) with coherence measured in *seconds*. The cost: slow, microsecond-scale gates, and fewer
qubits. Best for circuits where connectivity and fidelity matter more than raw speed.

**IQM — superconducting.** Tiny transmon circuits cooled to ~15 millikelvin, driven by microwave
pulses. *Garnet* (20 qubits, square lattice) is on Braket with native gates CZ and PRx. Gates run
in *nanoseconds* — orders of magnitude faster — and the fabrication leverages decades of
semiconductor manufacturing. The cost: **nearest-neighbor connectivity** (the SWAP tax above) and
~100-microsecond coherence. Best for circuits with local structure where speed wins.

**QuEra — neutral atoms (analog).** Arrays of rubidium atoms held in optical tweezers. *Aquila*
(256 atoms) is fundamentally different: it does **not** run gate circuits. Instead you place the
atoms in a geometry, drive them with time-dependent fields (Rabi frequency, detuning), and let
the system evolve under the Rydberg Hamiltonian — **analog** quantum computation. Its superpower
is scale (256 qubits) and a natural fit for problems with geometric structure, like Maximum
Independent Set. The cost: it's not a general gate-model machine.

The interactive table makes the trade-offs concrete — sort by qubit count, or filter to one
technology. Note that Aquila is the lone non-gate-model row:

```qdevices
```

## The simulator ladder — your defense

Given all of the above, you almost never start on a QPU. You climb a ladder of classical
simulators, each a defense against wasting time and money on real hardware:

- **Local simulator** (free, instant) — runs on your laptop, exact state-vector up to ~25 qubits
  (each qubit doubles memory: $2^n$ amplitudes). Your default for development and debugging.
- **SV1** (state vector, up to 34 qubits, $0.075/min) — exact, managed, for validating algorithms
  at a scale your laptop can't hold.
- **DM1** (density matrix, up to 17 qubits, $0.075/min) — the only simulator that models **noise**.
  This is where you study the decay you saw above before paying a real machine to show it to you.
- **TN1** (tensor network, up to ~50 qubits, $0.275/min) — efficient for large but lightly
  entangled circuits.

```qcard
{"id":"hw-dm1-noise-sim-1","prompt":"Which managed Braket simulator can model noise, and why can it when SV1 cannot?","answer":"`DM1`, the density-matrix simulator. A density matrix can represent mixed (noisy) states, so DM1 can apply noise channels like depolarizing and amplitude damping. `SV1` is an exact, noiseless state-vector simulator."}
```

The Bell pair you debug locally costs nothing and returns instantly:

```qsim
qubits 2
H 0
CNOT 0 1
```

The discipline, in order: **develop on Local → validate at scale on SV1 → study noise on DM1 →
run on a QPU only when the algorithm is proven.** Skipping rungs is how you burn a budget.

## Cost — the discipline

That last rung is metered, and the model has two shapes. QPUs charge **per task** (a flat fee each
time you submit a circuit, $0.30) plus **per shot** (each repetition; e.g. $0.01 on IonQ). Managed
simulators charge **per minute** of compute. The local simulator is free.

```qcard
{"id":"hw-cost-model-1","prompt":"How do QPUs charge for running a circuit on Amazon Braket, versus managed simulators?","answer":"QPUs charge per task (a flat fee each time you submit a circuit, e.g. $0.30) plus per shot (each repetition, e.g. $0.01 on IonQ). Managed simulators instead charge per minute of compute."}
```

The arithmetic matters: 1,000 shots on IonQ is $0.30 + 1{,}000 \times \$0.01 = \$10.30$ — per
task. Submit a 100-point parameter sweep and that's over a thousand dollars. Estimate before you
run:

```qcost
```

This is exactly why the workflow above exists, and why the project's rule is *local simulator
first, QPU only when validated, always with a cost estimate.*

## Choosing a device

Putting it together, a quick decision flow:

1. **Developing or debugging?** Local simulator. Always.
2. **Validating a gate circuit at scale, noiselessly?** SV1.
3. **Studying how noise affects results?** DM1.
4. **Large but lightly entangled circuit?** TN1.
5. **Ready for real hardware, densely connected problem (e.g. dense-graph QAOA)?** IonQ —
   all-to-all connectivity, high fidelity.
6. **Real hardware, local structure, speed matters?** IQM.
7. **Optimization or simulation with geometric structure (e.g. Maximum Independent Set)?** QuEra
   Aquila (analog).

Check yourself:

```quiz
{
  "questions": [
    {
      "q": "Your algorithm is QAOA on a dense graph where almost every qubit must interact with every other. Which hardware family fits best, and why?",
      "hint": "Dense interaction means many two-qubit gates between arbitrary pairs. Which connectivity avoids inserting SWAP chains for distant pairs?",
      "a": "A trapped-ion machine (IonQ Aria/Forte). Its all-to-all connectivity means any pair entangles directly — no SWAP overhead — which a dense interaction graph would otherwise incur heavily on a lattice device."
    },
    {
      "q": "Why develop and debug on the Local simulator before anything else?",
      "hint": "Think about the three things real hardware is that a laptop simulator is not: metered, queued, and slow to iterate.",
      "a": "It is free, instant, and has no queue, so you can iterate rapidly at zero cost. You reserve managed simulators and QPUs for circuits you have already validated locally."
    },
    {
      "q": "What does DM1 give you that SV1 does not?",
      "hint": "The names are the clue: state vector vs density matrix. One of those representations can express mixed (noisy) states.",
      "a": "Noise modeling. DM1 is a density-matrix simulator, so it can apply noise channels (depolarizing, amplitude damping, etc.) and show how they degrade results. SV1 is an exact, noiseless state-vector simulator."
    },
    {
      "q": "You want a CNOT between two qubits at opposite corners of a square-lattice device. What does that cost compared to the same gate on an all-to-all machine?",
      "hint": "On a lattice the two qubits aren't adjacent, so the router must bring them together first. What operation does that, and what is its overhead?",
      "a": "On the lattice the compiler inserts a chain of SWAP gates (each ~3 two-qubit gates) along the shortest path to make the qubits adjacent, adding depth and error. On an all-to-all machine the cost is zero — they are already connected."
    }
  ]
}
```

---

## Hands-On Exercises

1. **`notebooks/01-device-discovery.ipynb`** — Use `AwsDevice.get_devices()` to list all available hardware. Inspect device properties: qubit count, native gates, connectivity, status, queue depth.

2. **`notebooks/02-ionq-exploration.ipynb`** — Submit a simple circuit to IonQ (or simulate locally). Examine native gate decomposition. Compare results across shot counts. (Cost warning included in notebook.)

3. **`notebooks/03-iqm-exploration.ipynb`** — Build circuits respecting nearest-neighbor topology. Observe how the transpiler adds SWAP gates for non-adjacent interactions. Compare circuit depth before/after transpilation.

4. **`notebooks/04-quera-analog.ipynb`** — Define atom arrangements with `AnalogHamiltonianSimulation`. Set driving fields (Rabi frequency, detuning). Solve a small Maximum Independent Set problem.

5. **`notebooks/05-simulator-comparison.ipynb`** — Run the same circuit on SV1, DM1 (with noise), TN1, and local simulator. Compare results, runtime, and cost. Understand when each is appropriate.

6. **`notebooks/06-noise-and-errors.ipynb`** — Add noise channels (depolarizing, amplitude damping) to circuits on DM1. Compare noisy vs. ideal results. Introduction to error mitigation (zero-noise extrapolation concept).

**Scripts:**
- `scripts/device_status.py` — Run from terminal: `python 02-hardware/scripts/device_status.py` to check current device availability without opening a notebook
- `scripts/cost_estimator.py` — Estimate costs: `python 02-hardware/scripts/cost_estimator.py --device ionq --shots 1000`

## Where this goes next

You now know what real machines are and how to choose one. The next module, **`03-algorithms`**,
puts them to work: Deutsch–Jozsa, Grover's search, the Quantum Fourier Transform, and QAOA — the
circuits that make all this hardware worth building. You'll develop them on the simulator ladder
you just learned, exactly as the workflow prescribes.

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
