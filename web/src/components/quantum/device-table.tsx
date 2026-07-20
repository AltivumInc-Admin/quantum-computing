"use client";

import { useId, useState } from "react";
import { DEVICES, sortDevices, type SortKey } from "./devices";
import { costLabel } from "./cost";
import {
  cardShell,
  EyebrowLabel,
  fieldClass,
  LiveStatus,
} from "./widget-ui";

const TECHNOLOGIES = ["All", "Trapped ion", "Superconducting", "Neutral atom", "Simulator"] as const;

export function DeviceTable() {
  const techId = useId();
  const [sortKey, setSortKey] = useState<SortKey>("model");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [tech, setTech] = useState<string>("All");

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

  const ariaSort = (key: SortKey): "ascending" | "descending" | "none" => {
    if (key !== sortKey) return "none";
    return sortDir === "asc" ? "ascending" : "descending";
  };

  return (
    <div className={`not-prose my-6 overflow-hidden ${cardShell}`}>
      <LiveStatus>
        {`${sorted.length} device${sorted.length === 1 ? "" : "s"} shown${
          tech === "All" ? "" : `, ${tech}`
        }.`}
      </LiveStatus>

      {/* Header */}
      <div className="flex items-center justify-between gap-4 border-b border-(--bd) px-4 py-2">
        <EyebrowLabel strong>
          Devices
        </EyebrowLabel>
        <div className="flex items-center gap-2">
          <label
            htmlFor={techId}
            className="text-xs text-caption"
          >
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
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <caption className="sr-only">
            Quantum devices by technology. Rows tinted amber are analog
            (non-gate-model) hardware.
          </caption>
          <thead>
            <tr className="border-b border-(--bd) bg-(--field)">
              <th
                scope="col"
                aria-sort={ariaSort("model")}
                className="px-4 py-2 text-left font-medium text-(--mut) whitespace-nowrap"
              >
                <button
                  onClick={() => handleSort("model")}
                  aria-label="Sort by model"
                  className="flex items-center gap-1 -mx-2 -my-1 px-2 py-1 rounded hover:text-(--ink) transition-colors interactive focus-ring"
                >
                  Model
                  <SortIndicator active={sortKey === "model"} dir={sortDir} />
                </button>
              </th>
              <th
                scope="col"
                aria-sort={ariaSort("technology")}
                className="px-4 py-2 text-left font-medium text-(--mut) whitespace-nowrap"
              >
                <button
                  onClick={() => handleSort("technology")}
                  aria-label="Sort by technology"
                  className="flex items-center gap-1 -mx-2 -my-1 px-2 py-1 rounded hover:text-(--ink) transition-colors interactive focus-ring"
                >
                  Technology
                  <SortIndicator active={sortKey === "technology"} dir={sortDir} />
                </button>
              </th>
              <th scope="col" className="px-4 py-2 text-left font-medium text-(--mut) whitespace-nowrap">
                Vendor
              </th>
              <th
                scope="col"
                aria-sort={ariaSort("qubits")}
                className="px-4 py-2 text-left font-medium text-(--mut) whitespace-nowrap"
              >
                <button
                  onClick={() => handleSort("qubits")}
                  aria-label="Sort by qubits"
                  className="flex items-center gap-1 -mx-2 -my-1 px-2 py-1 rounded hover:text-(--ink) transition-colors interactive focus-ring"
                >
                  Qubits
                  <SortIndicator active={sortKey === "qubits"} dir={sortDir} />
                </button>
              </th>
              <th scope="col" className="px-4 py-2 text-left font-medium text-(--mut) whitespace-nowrap">
                Connectivity
              </th>
              <th scope="col" className="px-4 py-2 text-left font-medium text-(--mut) whitespace-nowrap">
                Gate model
              </th>
              <th scope="col" className="px-4 py-2 text-left font-medium text-(--mut) whitespace-nowrap">
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
                  <td className="px-4 py-2.5 text-(--mut) whitespace-nowrap">
                    {device.technology}
                  </td>
                  <td className="px-4 py-2.5 text-(--mut) whitespace-nowrap">
                    {device.vendor}
                  </td>
                  <td className="px-4 py-2.5 text-(--mut) tabular-nums">
                    {device.qubits}
                  </td>
                  <td className="px-4 py-2.5 text-(--mut) whitespace-nowrap">
                    {device.connectivity}
                  </td>
                  <td className="px-4 py-2.5 text-(--mut)">
                    {device.gateModel ? "Yes" : "No"}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-(--mut) whitespace-nowrap">
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
    </div>
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
