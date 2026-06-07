"use client";

import { useState } from "react";
import { DEVICES, sortDevices, type SortKey } from "./devices";

const TECHNOLOGIES = ["All", "Trapped ion", "Superconducting", "Neutral atom", "Simulator"] as const;

export function DeviceTable() {
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

  const ariaSort = (key: SortKey): "ascending" | "descending" | "none" => {
    if (key !== sortKey) return "none";
    return sortDir === "asc" ? "ascending" : "descending";
  };

  return (
    <div className="not-prose my-6 rounded-card border border-gray-200/80 dark:border-gray-700/40 bg-white dark:bg-[color-mix(in_oklab,var(--surface-1)_60%,transparent)] shadow-(--shadow-resting) overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 border-b border-gray-100 dark:border-gray-800 px-4 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-accent dark:text-accent-light">
          Devices
        </span>
        <div className="flex items-center gap-2">
          <label
            htmlFor="device-tech-filter"
            className="text-xs text-gray-500 dark:text-gray-400"
          >
            Technology
          </label>
          <select
            id="device-tech-filter"
            aria-label="Technology"
            value={tech}
            onChange={(e) => setTech(e.target.value)}
            className="text-xs rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-accent/50"
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
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
              <th
                aria-sort={ariaSort("model")}
                className="px-4 py-2 text-left font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap"
              >
                <button
                  onClick={() => handleSort("model")}
                  className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                >
                  Model
                  <SortIndicator active={sortKey === "model"} dir={sortDir} />
                </button>
              </th>
              <th
                aria-sort={ariaSort("technology")}
                className="px-4 py-2 text-left font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap"
              >
                <button
                  onClick={() => handleSort("technology")}
                  className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                >
                  Technology
                  <SortIndicator active={sortKey === "technology"} dir={sortDir} />
                </button>
              </th>
              <th className="px-4 py-2 text-left font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">
                Vendor
              </th>
              <th
                aria-sort={ariaSort("qubits")}
                className="px-4 py-2 text-left font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap"
              >
                <button
                  onClick={() => handleSort("qubits")}
                  className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                >
                  Qubits
                  <SortIndicator active={sortKey === "qubits"} dir={sortDir} />
                </button>
              </th>
              <th className="px-4 py-2 text-left font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">
                Connectivity
              </th>
              <th className="px-4 py-2 text-left font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">
                Gate model
              </th>
              <th className="px-4 py-2 text-left font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">
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
                    "border-b border-gray-100 dark:border-gray-800 last:border-0 transition-colors",
                    isAnalog
                      ? "bg-amber-50/60 dark:bg-amber-900/10"
                      : "hover:bg-gray-50 dark:hover:bg-gray-900/30",
                  ].join(" ")}
                >
                  <td className="px-4 py-2.5 font-mono font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">
                    {device.model}
                  </td>
                  <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                    {device.technology}
                  </td>
                  <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                    {device.vendor}
                  </td>
                  <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300 tabular-nums">
                    {device.qubits}
                  </td>
                  <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                    {device.connectivity}
                  </td>
                  <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300">
                    {device.gateModel ? "Yes" : "No"}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
                    {device.cost}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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
    <span className="text-accent dark:text-accent-light text-[10px] select-none" aria-hidden="true">
      {dir === "asc" ? "↑" : "↓"}
    </span>
  );
}
