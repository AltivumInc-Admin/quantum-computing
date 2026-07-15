import { Panel } from "./panel";
import type { RecordRow } from "@/lib/workspace";

/**
 * Z5 — RECORDS. The shortest solutions the learner has found ("Build a Bell pair …
 * 2 gates"), captured on every graded build-a-circuit Rep and surfaced nowhere else —
 * exactly the "artifact a peer would voluntarily show" the engagement law names. The
 * WHOLE panel is absent when no measurement exists. No pep talk.
 */
export function Records({ records }: { records: RecordRow[] }) {
  if (records.length === 0) return null;
  return (
    <Panel title="Records" id="ws-records" sub="shortest solutions you have found">
      <ul className="flex flex-col text-sm">
        {records.map((r) => (
          <li
            key={r.id}
            className="flex items-center justify-between gap-3 border-t border-gray-200/60 py-2 first:border-t-0 dark:border-white/[0.06]"
          >
            <span className="min-w-0 truncate text-gray-700 dark:text-gray-200">{r.title}</span>
            <span className="shrink-0 tabular-nums text-caption">
              {r.gates} {r.gates === 1 ? "gate" : "gates"}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
