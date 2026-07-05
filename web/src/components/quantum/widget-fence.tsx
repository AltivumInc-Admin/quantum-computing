"use client";

import dynamic from "next/dynamic";
import React, { type ComponentType } from "react";

/**
 * Client boundary that lazily resolves a GUIDE fenced block (```q*) to its
 * interactive widget. Each widget is code-split into its own chunk via
 * next/dynamic, so a lesson page only downloads the widgets it actually renders
 * instead of all ~30. ssr:false because these widgets are browser-only (WebGL,
 * canvas, scroll, localStorage), matching the existing bloch-sphere-3d pattern;
 * a sized skeleton holds the space while the chunk loads to avoid layout shift.
 *
 * The set of tokens here MUST match WIDGET_LANGS in widget-langs.ts (which the
 * Server Component renderer imports to decide widget-vs-CodeBlock). A parity test
 * in widget-fence.test.tsx guards against drift.
 */

function WidgetSkeleton({ minH }: { minH: string }) {
  return (
    <div
      aria-hidden="true"
      className={`not-prose my-6 ${minH} animate-pulse rounded-card border border-gray-200/80 bg-gray-50/70 dark:border-gray-700/40 dark:bg-white/[0.02] motion-reduce:animate-none`}
    />
  );
}

const loadingFor = (minH: string) => function Loading() { return <WidgetSkeleton minH={minH} />; };

const compact = loadingFor("min-h-[240px]");
const medium = loadingFor("min-h-[360px]");
const tall = loadingFor("min-h-[460px]");
const vqeLoading = loadingFor("min-h-[520px]");

type SourceWidget = ComponentType<{ source: string }>;

function lazyWidget(
  factory: () => Promise<{ default: ComponentType<{ source: string }> }>,
  loading: () => React.JSX.Element,
): SourceWidget {
  return dynamic(factory, { ssr: false, loading });
}

// Two no-source widgets wrapped to share the FC<{source}> signature.
const BlochBuilder = lazyWidget(() => import("./bloch-builder-widget").then((m) => ({ default: m.BlochBuilder as unknown as ComponentType<{ source: string }> })), tall);
const DeviceTable = lazyWidget(() => import("./device-table").then((m) => ({ default: m.DeviceTable as unknown as ComponentType<{ source: string }> })), tall);

const WIDGETS: Record<string, SourceWidget> = {
  qsim: lazyWidget(() => import("./circuit-lab").then((m) => ({ default: m.CircuitLab })), tall),
  qscrub: lazyWidget(() => import("./wavefunction-scrubber").then((m) => ({ default: m.WavefunctionScrubber })), tall),
  qchallenge: lazyWidget(() => import("./challenge").then((m) => ({ default: m.Challenge })), tall),
  qpredict: lazyWidget(() => import("./predict-widget").then((m) => ({ default: m.PredictWidget })), tall),
  qblochtarget: lazyWidget(() => import("./bloch-target-widget").then((m) => ({ default: m.BlochTargetWidget })), tall),
  qcostestimate: lazyWidget(() => import("./cost-estimate-widget").then((m) => ({ default: m.CostEstimateWidget })), compact),
  quiz: lazyWidget(() => import("./quiz").then((m) => ({ default: m.Quiz })), tall),
  runnable: lazyWidget(() => import("./runnable-editor").then((m) => ({ default: m.RunnableEditor })), tall),
  qbloch: () => <BlochBuilder source="" />,
  qshots: lazyWidget(() => import("./shots-sampler").then((m) => ({ default: m.ShotsSampler })), tall),
  qcorr: lazyWidget(() => import("./correlation-demo").then((m) => ({ default: m.CorrelationDemo })), tall),
  qcost: lazyWidget(() => import("./cost-calculator").then((m) => ({ default: m.CostCalculator })), compact),
  qdevices: () => <DeviceTable source="" />,
  qtopo: lazyWidget(() => import("./topology-explorer").then((m) => ({ default: m.TopologyExplorer })), medium),
  qnoise: lazyWidget(() => import("./noise-visualizer").then((m) => ({ default: m.NoiseVisualizer })), medium),
  qgrover: lazyWidget(() => import("./grover-visualizer").then((m) => ({ default: m.GroverVisualizer })), medium),
  qft: lazyWidget(() => import("./qft-visualizer").then((m) => ({ default: m.QftVisualizer })), medium),
  qdj: lazyWidget(() => import("./dj-demo").then((m) => ({ default: m.DjDemo })), medium),
  qoptim: lazyWidget(() => import("./qaoa-explorer").then((m) => ({ default: m.QaoaExplorer })), tall),
  qencode: lazyWidget(() => import("./encoding-explorer").then((m) => ({ default: m.EncodingExplorer })), medium),
  qkernel: lazyWidget(() => import("./kernel-explorer").then((m) => ({ default: m.KernelExplorer })), medium),
  qbarren: lazyWidget(() => import("./barren-explorer").then((m) => ({ default: m.BarrenExplorer })), medium),
  qvqc: lazyWidget(() => import("./vqc-trainer").then((m) => ({ default: m.VqcTrainer })), tall),
  qjw: lazyWidget(() => import("./jw-explorer").then((m) => ({ default: m.JwExplorer })), medium),
  qham: lazyWidget(() => import("./hamiltonian-explorer").then((m) => ({ default: m.HamiltonianExplorer })), medium),
  qvqe: lazyWidget(() => import("./vqe-explorer").then((m) => ({ default: m.VqeExplorer })), vqeLoading),
  qpes: lazyWidget(() => import("./pes-explorer").then((m) => ({ default: m.PesExplorer })), tall),
  qjob: lazyWidget(() => import("./job-explorer").then((m) => ({ default: m.JobExplorer })), tall),
  qparam: lazyWidget(() => import("./param-compile-explorer").then((m) => ({ default: m.ParamCompileExplorer })), medium),
  qcheckpoint: lazyWidget(() => import("./checkpoint-explorer").then((m) => ({ default: m.CheckpointExplorer })), tall),
  qmetrics: lazyWidget(() => import("./metrics-explorer").then((m) => ({ default: m.MetricsExplorer })), medium),
  qcard: lazyWidget(() => import("./review-card").then((m) => ({ default: m.ReviewCard })), compact),
  qscrolly: lazyWidget(() => import("./scrolly-section").then((m) => ({ default: m.ScrollySection })), tall),
};

/** Token keys the registry actually handles — used by the parity test. */
export const REGISTERED_WIDGET_LANGS = Object.keys(WIDGETS);

export function WidgetFence({ language, source }: { language: string; source: string }) {
  const Widget = WIDGETS[language];
  if (!Widget) {
    return (
      <pre className="not-prose my-5 overflow-x-auto rounded-xl border border-gray-800 bg-gray-900 px-4 py-3.5 text-sm text-gray-200">
        {source}
      </pre>
    );
  }
  return <Widget source={source} />;
}
