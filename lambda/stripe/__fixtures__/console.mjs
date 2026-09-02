// node:test has no spy sugar; the money modules report their refusals through
// console.error and the metric filters watch for the pinned phrases in them.

/** Capture console.error for the duration of `fn`; each entry is one call's argument list. */
export async function captureConsoleError(fn) {
  const original = console.error;
  const lines = [];
  console.error = (...args) => lines.push(args);
  try {
    await fn();
  } finally {
    console.error = original;
  }
  return lines;
}
