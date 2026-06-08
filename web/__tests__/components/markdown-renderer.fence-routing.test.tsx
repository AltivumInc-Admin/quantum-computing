/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import React from "react";

// markdown-renderer.tsx imports react-markdown + the remark/rehype plugins at
// module load (ESM-only); the repo's jest runs in CommonJS, so mock them to
// avoid an import error. We do NOT use ReactMarkdown here — we exercise the
// REAL fence-routing branches in makeComponents().pre() directly.
jest.mock("react-markdown", () => ({ __esModule: true, default: () => null }));
jest.mock("remark-gfm", () => () => {});
jest.mock("remark-math", () => () => {});
jest.mock("rehype-katex", () => () => {});
jest.mock("rehype-highlight", () => () => {});

import { makeComponents } from "@/components/markdown-renderer";

// jsdom does not implement matchMedia; the widgets' reduced-motion hook needs it.
function mockMatchMedia(reduced: boolean) {
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: reduced,
    media: query,
    onchange: null,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }));
}

// Build the minimal hast node shape pre() inspects: node.children[0] is the
// <code> element carrying the language-* class and the fence body as text.
function renderFence(lang: string, body: string) {
  const components = makeComponents(new Map());
  const Pre = components.pre as React.ComponentType<{ node: unknown; children?: React.ReactNode }>;
  const node = {
    type: "element",
    children: [
      {
        type: "element",
        properties: { className: [`language-${lang}`] },
        children: [{ type: "text", value: body }],
      },
    ],
  };
  return render(<Pre node={node}>{null}</Pre>);
}

describe("markdown fence routing", () => {
  beforeEach(() => mockMatchMedia(false));

  it("routes a qbloch fence to the Build a state widget", () => {
    renderFence("qbloch", "");
    expect(screen.getByText(/build a state/i)).toBeInTheDocument();
  });

  it("routes a qshots fence to the Shots sampler widget", () => {
    renderFence("qshots", "qubits 1\nH 0");
    expect(screen.getByText(/shots sampler/i)).toBeInTheDocument();
  });

  it("routes a qcorr fence to the Correlation widget", () => {
    renderFence(
      "qcorr",
      JSON.stringify({ prompt: "p", entangled: "H 0\nCNOT 0 1", product: "H 0\nH 1" })
    );
    expect(screen.getByText(/^correlation$/i)).toBeInTheDocument();
  });

  it("routes a qcost fence to the cost calculator", () => {
    renderFence("qcost", "");
    expect(screen.getByText(/cost calculator/i)).toBeInTheDocument();
  });

  it("routes a qdevices fence to the device table", () => {
    renderFence("qdevices", "");
    expect(screen.getByText("Aria")).toBeInTheDocument();
  });

  it("routes a qtopo fence to the connectivity explorer", () => {
    renderFence("qtopo", JSON.stringify({ topology: "line", qubits: 5, gate: [0, 4] }));
    expect(screen.getByText(/SWAP/i)).toBeInTheDocument();
  });

  it("routes a qnoise fence to the noise visualizer", () => {
    renderFence("qnoise", "qubits 1\nH 0");
    expect(screen.getByText(/^noise$/i)).toBeInTheDocument();
  });

  it("routes a qgrover fence to the Grover widget", () => {
    renderFence("qgrover", JSON.stringify({ qubits: 3, marked: 5 }));
    expect(screen.getByText(/grover/i)).toBeInTheDocument();
  });

  it("routes a qft fence to the Fourier widget", () => {
    renderFence("qft", JSON.stringify({ qubits: 4, input: "period:4" }));
    expect(screen.getByText(/fourier/i)).toBeInTheDocument();
  });

  it("routes a qdj fence to the Deutsch-Jozsa widget", () => {
    renderFence("qdj", JSON.stringify({ qubits: 3 }));
    expect(screen.getByText(/deutsch/i)).toBeInTheDocument();
  });

  it("routes a qoptim fence to the QAOA widget", () => {
    renderFence("qoptim", JSON.stringify({ edges: [[0, 1], [1, 2], [2, 0]] }));
    expect(screen.getByText(/qaoa/i)).toBeInTheDocument();
  });

  it("routes a qencode fence to the Encoding widget", () => {
    renderFence("qencode", JSON.stringify({ x: [0.6, 0.9], encoding: "angle" }));
    expect(screen.getByText(/encoding/i)).toBeInTheDocument();
  });

  it("routes a qkernel fence to the Quantum kernel widget", () => {
    renderFence("qkernel", JSON.stringify({ dataset: "circles", map: "iqp" }));
    expect(screen.getByText(/quantum kernel/i)).toBeInTheDocument();
  });

  it("routes a qbarren fence to the Barren plateaus widget", () => {
    renderFence("qbarren", JSON.stringify({ depth: 2, samples: 80 }));
    expect(screen.getByText(/^barren plateaus$/i)).toBeInTheDocument();
  });

  it("routes a qvqc fence to the VQC widget", () => {
    renderFence("qvqc", JSON.stringify({ dataset: "blobs" }));
    expect(screen.getByText(/vqc/i)).toBeInTheDocument();
  });

  it("routes a qjw fence to the Jordan-Wigner widget", () => {
    renderFence("qjw", JSON.stringify({ modes: 4, electrons: 2 }));
    expect(screen.getByText("Jordan-Wigner mapping")).toBeInTheDocument();
  });

  it("routes a qham fence to the Hamiltonian widget", () => {
    renderFence("qham", JSON.stringify({ R: 0.75 }));
    expect(screen.getByText("H2 Hamiltonian")).toBeInTheDocument();
  });

  it("routes a qvqe fence to the VQE widget", () => {
    renderFence("qvqe", JSON.stringify({ R: 0.75 }));
    expect(screen.getByText("VQE energy landscape")).toBeInTheDocument();
  });

  it("routes a qpes fence to the energy-surface widget", () => {
    renderFence("qpes", JSON.stringify({ mark: 0.75 }));
    expect(screen.getByText("Potential energy surface")).toBeInTheDocument();
  });

  it("routes a qjob fence to the standalone-vs-hybrid widget", () => {
    renderFence("qjob", JSON.stringify({ iterations: 60 }));
    expect(screen.getByText("Standalone vs Hybrid Job")).toBeInTheDocument();
  });

  it("routes a qparam fence to the parametric-compilation widget", () => {
    renderFence("qparam", JSON.stringify({ iterations: 50 }));
    expect(screen.getByText("Parametric compilation")).toBeInTheDocument();
  });

  it("routes a qcheckpoint fence to the checkpointing widget", () => {
    renderFence("qcheckpoint", JSON.stringify({ iterations: 40, failAt: 27 }));
    expect(screen.getByText("Checkpointing")).toBeInTheDocument();
  });

  it("routes a qmetrics fence to the live-metrics widget", () => {
    renderFence("qmetrics", JSON.stringify({ R: 0.74 }));
    expect(screen.getByText("Live job metrics")).toBeInTheDocument();
  });

  it("does not route an unknown language to any widget (falls back to a code block)", () => {
    renderFence("python", "print('hi')");
    expect(screen.queryByText(/build a state/i)).toBeNull();
    expect(screen.queryByText(/shots sampler/i)).toBeNull();
    expect(screen.queryByText(/^correlation$/i)).toBeNull();
  });
});
