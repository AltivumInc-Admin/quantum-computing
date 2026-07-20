"use client";

import { useId, useState } from "react";
import { DEVICES, sortDevices, type SortKey } from "./devices";
import { costLabel } from "./cost";
import { fieldClass, LiveStatus, WidgetCard } from "./widget-ui";
import { useScrollRegion } from "@/hooks/use-scroll-region";

// Derived from the catalog, not hand-maintained: a device with a new technology
// family shows up under the filter automatically, and retiring the last device
// of a family retires its option instead of leaving one that yields an empty
// table. Set preserves DEVICES' insertion order, so the rendering is unchanged.
export const TECHNOLOGIES = ["All", ...new Set(DEVICES.map((d) => d.technology))];

export function DeviceTable() {
  const techId = useId();
  const [sortKey, setSortKey] = useState<SortKey>("model");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [tech, setTech] = useState<string>("All");
  const { regionProps } = useScrollRegion<HTMLDivElement>("Scrollable device table");

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const filtered = tech === "All" ? DEVICES : DEVICES.filter((d) => d.technology === tech);
  const sorted = sortDevices(filtered, sortKey, sortDir);
  const hasAnalog = sorted.some((d) => !d.gateModel);

  const sortProps = (key: SortKey, label: string) => ({
    sortBy: key,
    label,
    active: key === sortKey,
    dir: sortDir,
    onSort: handleSort,
  });

  return (
    <WidgetCard
      eyebrow="Devices"
      headerRight={
        <div className="flex items-center gap-2">
          <label htmlFor={techId} className="text-xs text-caption">
            Technology
          </label>
          <select
            id={techId}
            aria-label="Technology"
            value={tech}
            onChange={(e) => setTech(e.target.value)}
            className={`${fieldClass} px-2 py-1 text-xs`}
          >
            {TECHNOLOGIES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      }
    >
      <LiveStatus>
        {`${sorted.length} device${sorted.length === 1 ? "" : "s"} shown${
          tech === "All" ? "" : `, ${tech}`
        }.`}
      </LiveStatus>

      {/* Table. Seven nowrap columns overflow a phone's content box, so the
          wrapper is a labelled keyboard scroll region when (and only when) it
          actually scrolls — the sort buttons inside it suppress the browser's
          implicit focusable-scroller fallback. */}
      <div {...regionProps}>
        <table className="w-full text-sm border-collapse">
          <caption className="sr-only">
            Quantum devices by technology. Rows tinted amber are analog
            (non-gate-model) hardware.
          </caption>
          <thead>
            <tr className="border-b border-(--bd) bg-(--field)">
              <SortableTh {...sortProps("model", "Model")} />
              <SortableTh {...sortProps("technology", "Technology")} />
              <th scope="col" className="px-4 py-2 text-left font-medium text-caption whitespace-nowrap">
                Vendor
              </th>
              <SortableTh {...sortProps("qubits", "Qubits")} />
              <th scope="col" className="px-4 py-2 text-left font-medium text-caption whitespace-nowrap">
                Connectivity
              </th>
              <th scope="col" className="px-4 py-2 text-left font-medium text-caption whitespace-nowrap">
                Gate model
              </th>
              <th scope="col" className="px-4 py-2 text-left font-medium text-caption whitespace-nowrap">
                Cost
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((device) => {
              const isAnalog = !device.gateModel;
              return (
                <tr
                  key={device.model}
                  className={[
                    "border-b border-(--bd) last:border-0 transition-colors",
                    isAnalog
                      ? "bg-amber-50/60 dark:bg-amber-900/10"
                      : "hover:bg-gray-50 dark:hover:bg-gray-900/30",
                  ].join(" ")}
                >
                  <td className="px-4 py-2.5 font-mono font-medium text-(--ink) whitespace-nowrap">
                    {device.model}
                  </td>
                  <td className="px-4 py-2.5 text-caption whitespace-nowrap">
                    {device.technology}
                  </td>
                  <td className="px-4 py-2.5 text-caption whitespace-nowrap">
                    {device.vendor}
                  </td>
                  <td className="px-4 py-2.5 text-caption tabular-nums">
                    {device.qubits}
                  </td>
                  <td className="px-4 py-2.5 text-caption whitespace-nowrap">
                    {device.connectivity}
                  </td>
                  <td className="px-4 py-2.5 text-caption">
                    {device.gateModel ? "Yes" : "No"}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-caption whitespace-nowrap">
                    {costLabel(device.provider)}
                    {device.note ? ` (${device.note})` : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {hasAnalog && (
        <div className="flex items-center gap-1.5 border-t border-(--bd) px-4 py-2">
          <span
            className="inline-block h-3 w-3 rounded bg-amber-100 dark:bg-amber-900/30 ring-1 ring-amber-300/60 dark:ring-amber-700/40"
            aria-hidden="true"
          />
          <span className="text-[11px] text-caption">
            Analog (non-gate-model) device
          </span>
        </div>
      )}
    </WidgetCard>
  );
}

/**
 * One sortable header cell. Single-sources the aria-sort wiring and the
 * touch-target/focus class recipe that the Model/Technology/Qubits headers
 * previously maintained in three byte-identical copies. Declared at module
 * scope (not inside DeviceTable) so its element type is stable across renders —
 * a per-render component would remount the header on every sort click and drop
 * keyboard focus off the button the user just activated.
 */
function SortableTh({
  sortBy,
  label,
  active,
  dir,
  onSort,
}: {
  sortBy: SortKey;
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onSort: (key: SortKey) => void;
}) {
  return (
    <th
      scope="col"
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      className="px-4 py-2 text-left font-medium text-caption whitespace-nowrap"
    >
      <button
        onClick={() => onSort(sortBy)}
        aria-label={`Sort by ${label.toLowerCase()}`}
        className="flex items-center gap-1 -mx-2 -my-1 px-2 py-1 rounded hover:text-(--ink) transition-colors interactive focus-ring"
      >
        {label}
        <SortIndicator active={active} dir={dir} />
      </button>
    </th>
  );
}

function SortIndicator({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) {
    return (
      <span className="opacity-30 text-[10px] select-none" aria-hidden="true">
        ↕
      </span>
    );
  }
  return (
    <span className="text-accent-dark dark:text-accent-light text-[10px] select-none" aria-hidden="true">
      {dir === "asc" ? "↑" : "↓"}
    </span>
  );
}
