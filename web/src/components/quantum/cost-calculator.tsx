"use client";

import { useId, useMemo, useState } from "react";
import { PRICING, Provider, estimateCost, isPerShot } from "./cost";
import { EyebrowLabel, WidgetCard, fieldClass } from "./widget-ui";

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
  const preset = useMemo(() => parseSource(source), [source]);

  const deviceId = useId();
  const tasksId = useId();
  const shotsId = useId();
  const minutesId = useId();

  const [provider, setProvider] = useState<Provider>(preset.provider ?? "IonQ");
  const [shotsStr, setShotsStr] = useState(String(preset.shots ?? 1000));
  const [tasksStr, setTasksStr] = useState("1");
  const [minutesStr, setMinutesStr] = useState("1");
  const toCount = (s: string) => {
    const n = Math.round(Number(s));
    return Number.isFinite(n) && n >= 1 ? n : 1;
  };
  const shots = toCount(shotsStr);
  const tasks = toCount(tasksStr);
  const minutes = toCount(minutesStr);

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
    <WidgetCard
      header={
        <div className="flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 px-4 py-2">
          <EyebrowLabel>Cost calculator</EyebrowLabel>
        </div>
      }
    >
      <div className="px-4 py-4 space-y-4">
        {/* Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Device picker */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor={deviceId}
              className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400"
            >
              Device
            </label>
            <select
              id={deviceId}
              aria-label="Device"
              value={provider}
              onChange={(e) => setProvider(e.target.value as Provider)}
              className={`${fieldClass} px-2 py-1.5 text-sm`}
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
              htmlFor={tasksId}
              className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400"
            >
              Tasks
            </label>
            <input
              id={tasksId}
              type="number"
              min={1}
              step={1}
              value={tasksStr}
              onChange={(e) => setTasksStr(e.target.value)}
              onBlur={() => setTasksStr(String(tasks))}
              className={`${fieldClass} px-2 py-1.5 text-sm`}
            />
          </div>

          {perShot ? (
            /* Shots — shown for QPU providers */
            <div className="flex flex-col gap-1 sm:col-span-2">
              <label
                htmlFor={shotsId}
                className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400"
              >
                Shots per task
              </label>
              <input
                id={shotsId}
                type="number"
                min={1}
                step={100}
                value={shotsStr}
                onChange={(e) => setShotsStr(e.target.value)}
                onBlur={() => setShotsStr(String(shots))}
                className={`${fieldClass} px-2 py-1.5 text-sm`}
              />
            </div>
          ) : (
            /* Minutes — shown for managed simulators */
            <div className="flex flex-col gap-1 sm:col-span-2">
              <label
                htmlFor={minutesId}
                className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400"
              >
                Minutes per task
              </label>
              <input
                id={minutesId}
                type="number"
                min={1}
                step={1}
                value={minutesStr}
                onChange={(e) => setMinutesStr(e.target.value)}
                onBlur={() => setMinutesStr(String(minutes))}
                className={`${fieldClass} px-2 py-1.5 text-sm`}
              />
            </div>
          )}
        </div>

        {/* Itemized breakdown */}
        <div className="rounded-md bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-700/50 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700/40">
                <th scope="col" className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Item</th>
                <th scope="col" className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">USD</th>
              </tr>
            </thead>
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
    </WidgetCard>
  );
}
