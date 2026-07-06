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

Decay needs a yardstick, and the Bell pair above is the classic one: its two-qubit correlation
has an exact ideal value, and how far a device falls short of it is one of the simplest
witnesses of lost fidelity. Compute the number the hardware is chasing:

```qexpect
{
  "id": "hw-readout-zz-1",
  "prompt": "An ideal device runs the Bell circuit (H 0, CNOT 0 1) many times and averages the product of the two ±1 readings. What is the ideal correlation ⟨Z₀Z₁⟩ it reports?",
  "program": "H 0\nCNOT 0 1",
  "observable": "Z 0 Z 1",
  "qubits": 2,
  "hint": "Every ideal shot reads 00 or 11 — never a disagreement. The product of the two ±1 readings is (+1)(+1) or (−1)(−1), which is +1 either way, so the shot average is exactly +1. Noise is what drags a real device's number below that ceiling."
}
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

Routing has one more sharp edge: a CNOT is not symmetric. Control and target are distinct
roles, and a gate wired backwards runs without complaint — it just computes the wrong thing.
Here is that failure on a chain like the one above; fix the wiring to match the intent:

```qdebug
{
  "id": "hw-debug-chain-cnot-1",
  "prompt": "On a nearest-neighbor chain 0–1–2, this circuit was meant to entangle the far ends through the middle qubit and produce the GHZ state (|000⟩ + |111⟩)/√2. Instead qubit 2 never budges — shots show only 000 and 110. One CNOT is wired against the intent. Fix it.",
  "qubits": 3,
  "broken": { "program": "H 0\nCNOT 0 1\nCNOT 2 1" },
  "target": { "program": "H 0\nCNOT 0 1\nCNOT 1 2" },
  "allowedGates": ["H", "CNOT"],
  "hint": "Read each CNOT as control first, target second. The last gate uses qubit 2 — still |0⟩ — as its control, so it never fires. The entanglement has to hop down the chain 0 → 1 → 2: the middle qubit must control the far one."
}
```

## The three hardware families

With those two trade-offs in hand, the devices on Braket sort into three physical families, each
sitting at a different point in the space.

**IonQ — trapped ions.** Individual charged atoms held in electromagnetic fields; qubits encoded
in their energy levels, gates driven by laser pulses. *Forte* (36 qubits) is on Braket — its
predecessor *Aria* (25 qubits) is now retired — with native gates GPi, GPi2, and the Mølmer–Sørensen (MS) entangler. Their superpower is
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

One way to feel the difference: an entangling chain that hops qubit to qubit. On Garnet's
lattice every link below needs adjacent qubits; on Forte the same gates land anywhere for free.
Either way, the machine is graded against the same ideal output — name it:

```qpredict
{
  "id": "hw-predict-ghz-1",
  "prompt": "A four-qubit entangling chain — H 0, then CNOT 0 1, CNOT 1 2, CNOT 2 3 — runs on an ideal machine. Which basis states appear with nonzero probability? (These are the peaks a noisy device only approximates.)",
  "program": "H 0\nCNOT 0 1\nCNOT 1 2\nCNOT 2 3",
  "mode": "nonzero-states",
  "hint": "Each CNOT passes the leading qubit's value one link down the chain, so all four bits always agree. Only the two unanimous states carry probability — the other fourteen are exactly zero, and any counts you see there on real hardware are pure error."
}
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

The ladder only works if you know the clean answer before noise ever touches it — that is what
the local rung hands you for free. Prove it on a lopsided circuit: predict the ideal histogram
that DM1 would then show you decaying:

```qpredict
{
  "id": "hw-predict-biased-1",
  "prompt": "Run ideally, this circuit produces a lopsided histogram; a noisy QPU only approximates it. Which single outcome sits on top?",
  "program": "X 0\nRY 1 1.0472",
  "mode": "top-outcome",
  "hint": "X pins qubit 0 — the leftmost bit — to 1. RY(π/3) tilts qubit 1 only partway: it stays |0⟩ with probability cos²(π/6) = 3/4. So three shots in four read 10. Noise flattens that peak toward the others, but it does not move it."
}
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
time you submit a circuit, $0.30) plus **per shot** (each repetition; e.g. $0.08 on IonQ). Managed
simulators charge **per minute** of compute. The local simulator is free.

```qcard
{"id":"hw-cost-model-1","prompt":"How do QPUs charge for running a circuit on Amazon Braket, versus managed simulators?","answer":"QPUs charge per task (a flat fee each time you submit a circuit, e.g. $0.30) plus per shot (each repetition, e.g. $0.08 on IonQ). Managed simulators instead charge per minute of compute."}
```

The arithmetic matters: 1,000 shots on IonQ (Forte) is $0.30 + 1{,}000 \times \$0.08 = \$80.30$ — per
task. Submit a 100-point parameter sweep and that's over eight thousand dollars. Estimate before you
run:

```qcost
```

This is exactly why the workflow above exists, and why the project's rule is *local simulator
first, QPU only when validated, always with a cost estimate.*

Now do the discipline itself: price a run in your head and commit before the breakdown is
revealed. Remember what the shots are for — each one is a sample, and the statistical error of
your histogram shrinks like $1/\sqrt{N}$ (the shot-noise story from Foundations) — so every
extra digit of precision is bought with real dollars:

```qcostestimate
{
  "id": "hw-cost-estimate-1",
  "prompt": "You submit one task of 2,000 shots to IonQ. What does it cost?",
  "provider": "IonQ",
  "shots": 2000,
  "tasks": 1,
  "hint": "Two meters run at once: a flat {perTask} the moment you submit the task, plus {perShot} for each of the {shots} shots inside it."
}
```

Keep straight what those shots are buying: not certainty, an average. Each shot returns ±1,
and the shot mean converges to the expectation value the device is estimating. For the
simplest superposition, work out where that average lands:

```qexpect
{
  "id": "hw-readout-plus-1",
  "prompt": "You pay for 1,000 shots of the one-gate circuit H 0 and average the ±1 readings of Z₀. What ideal value ⟨Z₀⟩ is that shot average converging to?",
  "program": "H 0",
  "observable": "Z 0",
  "hint": "H|0⟩ gives 0 and 1 with equal probability, so the +1 and −1 readings cancel in the long run: the expectation is 0, even though no single shot ever reads 0. Your finite-shot average just scatters around it, shrinking like 1/√N — that scatter is what more shots (and more dollars) buy down."
}
```

Now change providers. The task fee is universal, but the shot meter is not — and assuming
every QPU bills like IonQ is how estimates go wrong:

```qcostestimate
{
  "id": "hw-cost-iqm-1",
  "prompt": "You submit one task of 1,000 shots to IQM Garnet. What does it cost?",
  "provider": "IQM",
  "shots": 1000,
  "tasks": 1,
  "hint": "The per-shot rate is provider-specific: IQM charges {perShot} per shot, roughly a seventh of IonQ's rate. One flat {perTask} for the task, plus {shots} × {perShot}."
}
```

And the parameter sweep from above — the way budgets actually burn. Every point in a sweep is
its own task, and the flat fee rides along every single time:

```qcostestimate
{
  "id": "hw-cost-ionq-sweep-1",
  "prompt": "A 20-point parameter sweep on IonQ: 20 separate tasks of 100 shots each. What does the whole sweep cost?",
  "provider": "IonQ",
  "shots": 100,
  "tasks": 20,
  "hint": "The flat {perTask} is charged per task, not per experiment — twenty submissions pay it twenty times. Each point costs {perTask} + {shots} × {perShot}; the sweep is twenty of those."
}
```

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

Steps 5–7 all end at a metered machine, so close the loop with two more pricing calls you can
make cold. First IQM — where *how you batch the shots* changes the bill:

```qcostestimate
{
  "id": "hw-cost-iqm-batch-1",
  "prompt": "You split an IQM run into 5 tasks of 2,000 shots each. What do the 5 tasks cost in total?",
  "provider": "IQM",
  "shots": 2000,
  "tasks": 5,
  "hint": "Only the flat {perTask} cares how you split the run — five tasks pay it five times, while the shot meter ({shots} × {perShot} per task) tracks total shots. The same 10,000 shots in a single task would save four task fees: $1.20."
}
```

And QuEra — analog, no gate circuits, but the meter neither knows nor cares:

```qcostestimate
{
  "id": "hw-cost-quera-1",
  "prompt": "One task of 400 shots on QuEra Aquila (an analog run). What does it cost?",
  "provider": "QuEra",
  "shots": 400,
  "tasks": 1,
  "hint": "Analog is a different computing model, not a different billing model: Aquila meters exactly like the gate QPUs — one flat {perTask} at submission, plus {perShot} for each of the {shots} shots."
}
```

Check yourself:

```quiz
{
  "questions": [
    {
      "q": "Your algorithm is QAOA on a dense graph where almost every qubit must interact with every other. Which hardware family fits best, and why?",
      "hint": "Dense interaction means many two-qubit gates between arbitrary pairs. Which connectivity avoids inserting SWAP chains for distant pairs?",
      "a": "A trapped-ion machine (IonQ Forte). Its all-to-all connectivity means any pair entangles directly — no SWAP overhead — which a dense interaction graph would otherwise incur heavily on a lattice device."
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
