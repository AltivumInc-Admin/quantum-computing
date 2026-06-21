"use client";

import { useState } from "react";
import { PRICING, Provider, estimateCost, isPerShot } from "./cost";

const PROVIDERS = Object.keys(PRICING) as Provider[];

function parseSource(source: string): { provider?: Provider; shots?: number } {
  try {
    const trimmed = source.trim();
    if (!trimmed) return {};
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const provider =
      typeof parsed.provider === "string" && parsed.provider in PRICING
        ? (parsed.provider as Provider)
        : undefined;
    const shots =
      typeof parsed.shots === "number" && Number.isFinite(parsed.shots) && parsed.shots > 0
        ? Math.round(parsed.shots)
        : undefined;
    return { provider, shots };
  } catch {
    return {};
  }
}

export function CostCalculator({ source }: { source: string }) {
  const preset = parseSource(source);

  const [provider, setProvider] = useState<Provider>(preset.provider ?? "IonQ");
  const [shots, setShots] = useState(preset.shots ?? 1000);
  const [tasks, setTasks] = useState(1);
  const [minutes, setMinutes] = useState(1);

  const perShot = isPerShot(provider);
  const total = estimateCost(provider, shots, minutes, tasks);
  const totalStr = `$${total.toFixed(2)}`;

  // Build itemized lines (values and rate annotations without $ prefix so the
  // bold total cell is the sole element matching /\$X\.XX/ in the DOM).
  const lines: { label: string; value: string }[] = [];
  if (perShot) {
    const p = PRICING[provider] as { perTask: number; perShot: number };
    lines.push({
      label: `Task fee — ${tasks} task${tasks !== 1 ? "s" : ""} at ${p.perTask.toFixed(4)} each`,
      value: (tasks * p.perTask).toFixed(4),
    });
    lines.push({
      label: `Shot fee — ${tasks} task${tasks !== 1 ? "s" : ""} x ${shots} shots at ${p.perShot.toFixed(5)}`,
      value: (tasks * p.perShot * shots).toFixed(4),
    });
  } else {
    const p = PRICING[provider] as { perMinute: number };
    lines.push({
      label: `Compute — ${minutes} min${minutes !== 1 ? "s" : ""} x ${tasks} task${tasks !== 1 ? "s" : ""} at ${p.perMinute.toFixed(4)}/min`,
      value: (p.perMinute * minutes * tasks).toFixed(4),
    });
  }

  return (
    <div className="not-prose my-6 rounded-card border border-gray-200/80 dark:border-gray-700/40 bg-white dark:bg-[color-mix(in_oklab,var(--surface-1)_60%,transparent)] shadow-(--shadow-resting) overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 px-4 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-accent dark:text-accent-light">
          Cost calculator
        </span>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Device picker */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="qcost-device"
              className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400"
            >
              Device
            </label>
            <select
              id="qcost-device"
              aria-label="Device"
              value={provider}
              onChange={(e) => setProvider(e.target.value as Provider)}
              className="rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 px-2 py-1.5 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-accent/40"
            >
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          {/* Tasks (always shown) */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="qcost-tasks"
              className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400"
            >
              Tasks
            </label>
            <input
              id="qcost-tasks"
              type="number"
              min={1}
              step={1}
              value={tasks}
              onChange={(e) => setTasks(Math.max(1, Math.round(Number(e.target.value))))}
              className="rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 px-2 py-1.5 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>

          {perShot ? (
            /* Shots — shown for QPU providers */
            <div className="flex flex-col gap-1 sm:col-span-2">
              <label
                htmlFor="qcost-shots"
                className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400"
              >
                Shots per task
              </label>
              <input
                id="qcost-shots"
                type="number"
                min={1}
                step={100}
                value={shots}
                onChange={(e) => setShots(Math.max(1, Math.round(Number(e.target.value))))}
                className="rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 px-2 py-1.5 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
          ) : (
            /* Minutes — shown for managed simulators */
            <div className="flex flex-col gap-1 sm:col-span-2">
              <label
                htmlFor="qcost-minutes"
                className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400"
              >
                Minutes per task
              </label>
              <input
                id="qcost-minutes"
                type="number"
                min={1}
                step={1}
                value={minutes}
                onChange={(e) => setMinutes(Math.max(1, Math.round(Number(e.target.value))))}
                className="rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 px-2 py-1.5 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
          )}
        </div>

        {/* Itemized breakdown */}
        <div className="rounded-md bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-700/50 overflow-hidden">
          <table className="w-full text-sm">
            <tbody>
              {lines.map((line, i) => (
                <tr
                  key={i}
                  className="border-b border-gray-100 dark:border-gray-700/40 last:border-0"
                >
                  <td className="px-3 py-2 text-gray-600 dark:text-gray-400 font-mono text-xs">
                    {line.label}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-gray-700 dark:text-gray-300 tabular-nums">
                    {line.value}
                  </td>
                </tr>
              ))}
              <tr className="bg-gray-100/60 dark:bg-gray-700/30">
                <td className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Total
                </td>
                <td
                  aria-live="polite"
                  aria-atomic="true"
                  className="px-3 py-2 text-right font-bold font-mono text-sm text-gray-900 dark:text-gray-100 tabular-nums"
                >
                  {totalStr}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Nudge */}
        <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
          Develop on LocalSimulator (free) first; move to a QPU only when validated.
        </p>
      </div>
    </div>
  );
}
