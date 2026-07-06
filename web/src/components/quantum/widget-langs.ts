// Bare fence tokens (without the "language-" prefix) that route to an interactive
// widget instead of a CodeBlock. This lives in a plain (non-"use client") module so
// the Server Component markdown renderer can import the Set directly and decide
// widget-vs-CodeBlock at build time. The client registry in widget-fence.tsx maps
// each of these tokens to its lazily-loaded component; widget-fence.test.tsx asserts
// the two lists never drift.
export const WIDGET_LANGS = new Set<string>([
  "qsim",
  "qscrub",
  "qchallenge",
  "qpredict",
  "qblochtarget",
  "qcostestimate",
  "qdebug",
  "qexpect",
  "quiz",
  "runnable",
  "qbloch",
  "qshots",
  "qcorr",
  "qcost",
  "qdevices",
  "qtopo",
  "qnoise",
  "qgrover",
  "qft",
  "qdj",
  "qoptim",
  "qencode",
  "qkernel",
  "qbarren",
  "qvqc",
  "qjw",
  "qham",
  "qvqe",
  "qpes",
  "qjob",
  "qparam",
  "qcheckpoint",
  "qmetrics",
  "qcard",
  "qscrolly",
]);
