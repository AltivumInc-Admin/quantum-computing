/**
 * The curriculum, as an allowlist — the reason "no request path is ever stored"
 * survives per-notebook counting.
 *
 * summarizeDay reads request paths out of the access log the way it always has,
 * but what it may WRITE is bounded by the two sets below: seven section slugs
 * and forty-five notebook keys, all of them checked into this repository and
 * all of them already public in the URL of a lesson page. A path that is not in
 * here cannot become a key, so a scanner's probe, a query string, a stray
 * redirect and a future route nobody has reviewed are all structurally
 * incapable of reaching the table. That is a stronger promise than "we only
 * write paths we like", and index.test.mjs asserts it on the written row.
 *
 * Kept in lockstep with web/src/lib/content-manifest.json — the generated
 * single source of truth for the catalog — by curriculum.test.mjs, which
 * compares both directions. Adding a notebook to the curriculum without
 * updating this file fails the build rather than silently going uncounted.
 * The precedent is template.test.mjs pinning SiteHost to web/src/lib/site.ts.
 *
 * Pure and dependency-free, like classify.mjs: no fs, no network, no AWS.
 */

/** Section directory names, in curriculum order. The order is the measure. */
export const SECTION_SLUGS = [
  "00-prereqs",
  "01-foundations",
  "02-hardware",
  "03-algorithms",
  "04-quantum-ml",
  "05-quantum-chemistry",
  "06-hybrid-jobs",
];

export const SECTIONS = new Set(SECTION_SLUGS);

/** Position in the curriculum, or -1. Used only to pick the furthest reached. */
export const sectionIndex = (slug) => SECTION_SLUGS.indexOf(slug);

/** "<section>/<notebook stem>" for every notebook the curriculum ships. */
export const NOTEBOOKS = new Set([
  // 00-prereqs
  "00-prereqs/01-python-numpy-warmup",
  "00-prereqs/02-linear-algebra-for-quantum",
  "00-prereqs/03-probability-and-measurement",
  "00-prereqs/04-what-is-a-qubit",
  "00-prereqs/05-dirac-notation-decoded",
  "00-prereqs/06-bloch-sphere-playground",
  // 01-foundations
  "01-foundations/01-first-circuit",
  "01-foundations/02-single-qubit-gates",
  "01-foundations/03-multi-qubit-gates",
  "01-foundations/04-measurement-statistics",
  "01-foundations/05-circuit-composition",
  // 02-hardware
  "02-hardware/01-device-discovery",
  "02-hardware/02-ionq-exploration",
  "02-hardware/03-iqm-exploration",
  "02-hardware/04-quera-analog",
  "02-hardware/05-simulator-comparison",
  "02-hardware/06-noise-and-errors",
  // 03-algorithms
  "03-algorithms/01-deutsch-jozsa",
  "03-algorithms/02-grovers-search",
  "03-algorithms/03-qft",
  "03-algorithms/04-qpe",
  "03-algorithms/05-qaoa-maxcut",
  "03-algorithms/06-amplitude-estimation",
  // 04-quantum-ml
  "04-quantum-ml/01-data-encoding",
  "04-quantum-ml/02-quantum-kernels",
  "04-quantum-ml/03-variational-classifier",
  "04-quantum-ml/04-pennylane-braket",
  "04-quantum-ml/05-qnn-architecture",
  "04-quantum-ml/06-barren-plateaus",
  "04-quantum-ml/07-hybrid-ml-job",
  // 05-quantum-chemistry
  "05-quantum-chemistry/01-molecular-hamiltonians",
  "05-quantum-chemistry/02-fermion-qubit-mapping",
  "05-quantum-chemistry/03-vqe-h2",
  "05-quantum-chemistry/04-vqe-lih",
  "05-quantum-chemistry/05-ansatz-design",
  "05-quantum-chemistry/06-active-space",
  "05-quantum-chemistry/07-excited-states",
  "05-quantum-chemistry/08-hybrid-chemistry-job",
  // 06-hybrid-jobs
  "06-hybrid-jobs/01-first-hybrid-job",
  "06-hybrid-jobs/02-parametric-compilation",
  "06-hybrid-jobs/03-monitoring-metrics",
  "06-hybrid-jobs/04-checkpointing",
  "06-hybrid-jobs/05-custom-containers",
  "06-hybrid-jobs/06-pennylane-jobs",
  "06-hybrid-jobs/07-production-patterns",
]);
