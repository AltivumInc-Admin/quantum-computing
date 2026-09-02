/**
 * Tests for the shared day-retrieval.
 *
 * fetchWindow is injected, so these run with no AWS, no CLI and no credentials
 * — the same arrangement classify.test.mjs has, and the reason both callers can
 * share one implementation without either growing a fixture on disk.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { MAX_BISECTIONS, SIZE_REFUSAL, fetchDayCsv } from "./retrieve.mjs";

const HEADER = "date,time,c-ip";
const line = (t) => `2026-08-19,${t},198.51.100.4`;

test("one call when the API is willing", async () => {
  const windows = [];
  const csv = await fetchDayCsv("2026-08-19", async (a, b) => {
    windows.push([a, b]);
    return [HEADER, line("10:00:00")].join("\n");
  });
  assert.deepEqual(windows, [["2026-08-19T00:00:00Z", "2026-08-19T23:59:59Z"]]);
  assert.equal(csv.split("\n").length, 2);
});

test("a size refusal halves the window and stitches ONE valid CSV back together", async () => {
  // The header must appear exactly once, or parseLog reads the second one as a
  // data row of the wrong field count and silently counts it as malformed.
  let refusedFullDay = false;
  const csv = await fetchDayCsv("2026-08-19", async (startIso) => {
    if (!refusedFullDay) {
      refusedFullDay = true;
      throw new Error("Unable to complete request for the given time range");
    }
    return [HEADER, line(startIso.slice(11, 19))].join("\n");
  });

  const lines = csv.split("\n");
  assert.equal(lines.filter((l) => l === HEADER).length, 1, "exactly one header survives");
  assert.equal(lines.length, 3, "header plus both halves' rows");
});

test("it gives up after a bounded number of halvings, rather than forever", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      fetchDayCsv("2026-08-19", async () => {
        calls++;
        throw new Error("Please reduce time range and try again");
      }),
    /reduce time range/,
  );
  // The first half to reach the depth limit throws, and that propagates
  // immediately — so a doomed day costs one call per level, not a whole tree.
  assert.equal(calls, MAX_BISECTIONS + 1);
});

test("any other failure propagates untouched — narrowing would hide it", async () => {
  // Retrying a wrong app id or a dead credential four times in smaller windows
  // turns one clear error into four and reports the last one.
  let calls = 0;
  await assert.rejects(
    () =>
      fetchDayCsv("2026-08-19", async () => {
        calls++;
        throw new Error("AccessDeniedException: not authorized to perform amplify:GenerateAccessLogs");
      }),
    /AccessDeniedException/,
  );
  assert.equal(calls, 1, "a real failure is not retried");
  assert.equal(SIZE_REFUSAL.test("AccessDeniedException"), false);
});
