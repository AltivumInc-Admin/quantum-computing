"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

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

function WidgetSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="not-prose my-6 min-h-48 animate-pulse rounded-card border border-gray-200/80 bg-gray-50/70 dark:border-gray-700/40 dark:bg-white/[0.02] motion-reduce:animate-none"
    />
  );
}

const loading = () => <WidgetSkeleton />;

type SourceWidget = ComponentType<{ source: string }>;

// Each entry is its own lazily-loaded chunk. The two no-source widgets
// (BlochBuilder, DeviceTable) are wrapped to ignore the source prop so every
// registry value shares one FC<{ source: string }> signature.
const CircuitLab = dynamic(() => import("./circuit-lab").then((m) => m.CircuitLab), { ssr: false, loading });
const WavefunctionScrubber = dynamic(() => import("./wavefunction-scrubber").then((m) => m.WavefunctionScrubber), { ssr: false, loading });
const Challenge = dynamic(() => import("./challenge").then((m) => m.Challenge), { ssr: false, loading });
const Quiz = dynamic(() => import("./quiz").then((m) => m.Quiz), { ssr: false, loading });
const RunnableEditor = dynamic(() => import("./runnable-editor").then((m) => m.RunnableEditor), { ssr: false, loading });
const BlochBuilder = dynamic(() => import("./bloch-builder-widget").then((m) => m.BlochBuilder), { ssr: false, loading });
const ShotsSampler = dynamic(() => import("./shots-sampler").then((m) => m.ShotsSampler), { ssr: false, loading });
const CorrelationDemo = dynamic(() => import("./correlation-demo").then((m) => m.CorrelationDemo), { ssr: false, loading });
const CostCalculator = dynamic(() => import("./cost-calculator").then((m) => m.CostCalculator), { ssr: false, loading });
const DeviceTable = dynamic(() => import("./device-table").then((m) => m.DeviceTable), { ssr: false, loading });
const TopologyExplorer = dynamic(() => import("./topology-explorer").then((m) => m.TopologyExplorer), { ssr: false, loading });
const NoiseVisualizer = dynamic(() => import("./noise-visualizer").then((m) => m.NoiseVisualizer), { ssr: false, loading });
const GroverVisualizer = dynamic(() => import("./grover-visualizer").then((m) => m.GroverVisualizer), { ssr: false, loading });
const QftVisualizer = dynamic(() => import("./qft-visualizer").then((m) => m.QftVisualizer), { ssr: false, loading });
const DjDemo = dynamic(() => import("./dj-demo").then((m) => m.DjDemo), { ssr: false, loading });
const QaoaExplorer = dynamic(() => import("./qaoa-explorer").then((m) => m.QaoaExplorer), { ssr: false, loading });
const EncodingExplorer = dynamic(() => import("./encoding-explorer").then((m) => m.EncodingExplorer), { ssr: false, loading });
const KernelExplorer = dynamic(() => import("./kernel-explorer").then((m) => m.KernelExplorer), { ssr: false, loading });
const BarrenExplorer = dynamic(() => import("./barren-explorer").then((m) => m.BarrenExplorer), { ssr: false, loading });
const VqcTrainer = dynamic(() => import("./vqc-trainer").then((m) => m.VqcTrainer), { ssr: false, loading });
const JwExplorer = dynamic(() => import("./jw-explorer").then((m) => m.JwExplorer), { ssr: false, loading });
const HamiltonianExplorer = dynamic(() => import("./hamiltonian-explorer").then((m) => m.HamiltonianExplorer), { ssr: false, loading });
const VqeExplorer = dynamic(() => import("./vqe-explorer").then((m) => m.VqeExplorer), { ssr: false, loading });
const PesExplorer = dynamic(() => import("./pes-explorer").then((m) => m.PesExplorer), { ssr: false, loading });
const JobExplorer = dynamic(() => import("./job-explorer").then((m) => m.JobExplorer), { ssr: false, loading });
const ParamCompileExplorer = dynamic(() => import("./param-compile-explorer").then((m) => m.ParamCompileExplorer), { ssr: false, loading });
const CheckpointExplorer = dynamic(() => import("./checkpoint-explorer").then((m) => m.CheckpointExplorer), { ssr: false, loading });
const MetricsExplorer = dynamic(() => import("./metrics-explorer").then((m) => m.MetricsExplorer), { ssr: false, loading });
const ReviewCard = dynamic(() => import("./review-card").then((m) => m.ReviewCard), { ssr: false, loading });
const ScrollySection = dynamic(() => import("./scrolly-section").then((m) => m.ScrollySection), { ssr: false, loading });

const WIDGETS: Record<string, SourceWidget> = {
  qsim: CircuitLab,
  qscrub: WavefunctionScrubber,
  qchallenge: Challenge,
  quiz: Quiz,
  runnable: RunnableEditor,
  qbloch: () => <BlochBuilder />,
  qshots: ShotsSampler,
  qcorr: CorrelationDemo,
  qcost: CostCalculator,
  qdevices: () => <DeviceTable />,
  qtopo: TopologyExplorer,
  qnoise: NoiseVisualizer,
  qgrover: GroverVisualizer,
  qft: QftVisualizer,
  qdj: DjDemo,
  qoptim: QaoaExplorer,
  qencode: EncodingExplorer,
  qkernel: KernelExplorer,
  qbarren: BarrenExplorer,
  qvqc: VqcTrainer,
  qjw: JwExplorer,
  qham: HamiltonianExplorer,
  qvqe: VqeExplorer,
  qpes: PesExplorer,
  qjob: JobExplorer,
  qparam: ParamCompileExplorer,
  qcheckpoint: CheckpointExplorer,
  qmetrics: MetricsExplorer,
  qcard: ReviewCard,
  qscrolly: ScrollySection,
};

/** Token keys the registry actually handles — used by the parity test. */
export const REGISTERED_WIDGET_LANGS = Object.keys(WIDGETS);

export function WidgetFence({ language, source }: { language: string; source: string }) {
  const Widget = WIDGETS[language];
  if (!Widget) {
    // Drift fallback (a token in WIDGET_LANGS but missing from the registry):
    // show the raw source rather than dropping it. The parity test keeps this
    // from happening in practice.
    return (
      <pre className="not-prose my-5 overflow-x-auto rounded-xl border border-gray-800 bg-gray-900 px-4 py-3.5 text-sm text-gray-200">
        {source}
      </pre>
    );
  }
  return <Widget source={source} />;
}
