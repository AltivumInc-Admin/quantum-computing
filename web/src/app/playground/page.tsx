import type { Metadata } from "next";
import { PlaygroundBench } from "@/components/playground/playground-bench";

export const metadata: Metadata = {
  title: "Playground — Quantum Workspace",
  description:
    "A live four-qubit circuit sandbox: sketch a circuit in the qsim gate language and watch the exact quantum state respond as you type, sample measurement shots, export OpenQASM 3.0, and hand a finished circuit to real quantum hardware.",
};

export default function PlaygroundPage() {
  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-0 bg-atmosphere-light dark:bg-atmosphere" />
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <header className="mb-8">
          <p className="text-sm font-medium tracking-widest uppercase text-accent dark:text-accent-light mb-4">
            Sandbox
          </p>
          <h1 className="font-display text-display-xl tracking-tight text-gray-900 dark:text-white">
            Playground
          </h1>
          <p className="mt-4 text-lg text-gray-600 dark:text-gray-400 max-w-2xl leading-relaxed">
            Sketch circuits of up to four qubits and watch the exact quantum state respond
            as you type — no run button — then send a finished circuit to real hardware.
          </p>
        </header>
        <PlaygroundBench />
      </div>
    </div>
  );
}
