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

  it("does not route an unknown language to any widget (falls back to a code block)", () => {
    renderFence("python", "print('hi')");
    expect(screen.queryByText(/build a state/i)).toBeNull();
    expect(screen.queryByText(/shots sampler/i)).toBeNull();
    expect(screen.queryByText(/^correlation$/i)).toBeNull();
  });
});
