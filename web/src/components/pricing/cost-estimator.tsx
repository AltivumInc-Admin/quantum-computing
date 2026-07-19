"use client";

import { useId, useState } from "react";
import {
  HARDWARE_RATES,
  TASK_FEE_CREDITS,
  TUTOR_RATES,
  jobCredits,
  creditsToUsd,
  formatCredits,
  formatUsd,
} from "@/lib/pricing";

const SHOT_PRESETS = [100, 1000, 10000];
const QUESTION_PRESETS = [25, 100, 300];

/** Big credits-first readout shared by both estimator panes. */
function Readout({
  label,
  credits,
  suffix,
}: {
  label: string;
  credits: number;
  suffix?: string;
}) {
  return (
    <div aria-live="polite" className="mt-6 border-t border-gray-200/60 dark:border-white/[0.08] pt-5">
      <p className="text-xs font-semibold tracking-widest uppercase text-caption">{label}</p>
      <p className="mt-1 font-display text-display-lg text-(--ink) tabular-nums">
        {formatCredits(credits)}
        <span className="ml-2 text-base font-sans text-gray-500 dark:text-gray-400">
          {formatUsd(creditsToUsd(credits))}
          {suffix}
        </span>
      </p>
    </div>
  );
}

function PresetChips({
  presets,
  value,
  onSelect,
  format,
}: {
  presets: number[];
  value: number;
  onSelect: (v: number) => void;
  format: (v: number) => string;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Presets">
      {presets.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onSelect(p)}
          className={`rounded-chip px-3 py-1 text-sm font-medium tabular-nums interactive focus-ring ${
            value === p
              ? "chip-selected"
              : "border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 hover:border-accent/50"
          }`}
        >
          {format(p)}
        </button>
      ))}
    </div>
  );
}

/**
 * The pricing page's interactive estimator: pick a backend and a shot count —
 * or a tutor model and a monthly question habit — and see the exact credits
 * before you ever commit to anything. The same math runs as a pre-flight
 * estimate on every real submission.
 */
export function CostEstimator() {
  const [deviceIdx, setDeviceIdx] = useState(2); // IQM Garnet — the curriculum's workhorse
  const [shots, setShots] = useState(1000);
  const [modelIdx, setModelIdx] = useState(0);
  const [questions, setQuestions] = useState(100);
  const deviceId = useId();
  const shotsId = useId();
  const questionsId = useId();

  const device = HARDWARE_RATES[deviceIdx];
  const runCredits = jobCredits(device, shots);
  const tutor = TUTOR_RATES[modelIdx];
  const tutorCredits = tutor.typicalCreditsPerQuestion * questions;

  const paneChrome =
    "rounded-card border border-gray-200/60 dark:border-white/[0.06] bg-(--surface-1) p-6 sm:p-8 shadow-(--shadow-resting)";

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* ---- Quantum hardware ---- */}
      <div className={paneChrome}>
        <h3 className="font-display text-display-md text-(--ink)">
          Price a hardware run
        </h3>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          The same estimate appears before every real submission — nothing runs
          until you approve the number.
        </p>

        <div className="mt-6 space-y-5">
          <div>
            <label
              htmlFor={deviceId}
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
            >
              Backend
            </label>
            <select
              id={deviceId}
              value={deviceIdx}
              onChange={(e) => setDeviceIdx(Number(e.target.value))}
              className="w-full rounded-control border border-(--bd) bg-(--surface-2) px-3 py-2 text-sm text-(--ink) focus-ring"
            >
              {HARDWARE_RATES.map((r, i) => (
                <option key={r.name} value={i}>
                  {r.name} — {r.technology}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor={shotsId}
                className="text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Shots
              </label>
              <span className="text-sm tabular-nums text-gray-500 dark:text-gray-400">
                {shots.toLocaleString("en-US")}
              </span>
            </div>
            <input
              id={shotsId}
              type="range"
              min={100}
              max={10000}
              step={100}
              value={shots}
              onChange={(e) => setShots(Number(e.target.value))}
              className="slider w-full"
            />
            <div className="mt-3">
              <PresetChips
                presets={SHOT_PRESETS}
                value={shots}
                onSelect={setShots}
                format={(v) => v.toLocaleString("en-US")}
              />
            </div>
          </div>
        </div>

        <Readout label="This run" credits={runCredits} />
        <p className="mt-3 text-xs text-caption">
          {device.creditsPerShot} credits per shot + {TASK_FEE_CREDITS} credits
          per task.
        </p>
      </div>

      {/* ---- AI tutor ---- */}
      <div className={paneChrome}>
        <h3 className="font-display text-display-md text-(--ink)">
          Price a month of tutoring
        </h3>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Typical questions — long derivations cost proportionally more, and the
          margin shows the cost as you type.
        </p>

        <div className="mt-6 space-y-5">
          <div>
            <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Model
            </span>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Tutor model">
              {TUTOR_RATES.map((r, i) => (
                <button
                  key={r.model}
                  type="button"
                  onClick={() => setModelIdx(i)}
                  className={`rounded-chip px-3 py-1 text-sm font-medium interactive focus-ring ${
                    modelIdx === i
                      ? "chip-selected"
                      : "border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 hover:border-accent/50"
                  }`}
                >
                  {r.model.replace("Claude ", "")}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor={questionsId}
                className="text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Questions per month
              </label>
              <span className="text-sm tabular-nums text-gray-500 dark:text-gray-400">
                {questions.toLocaleString("en-US")}
              </span>
            </div>
            <input
              id={questionsId}
              type="range"
              min={10}
              max={1000}
              step={10}
              value={questions}
              onChange={(e) => setQuestions(Number(e.target.value))}
              className="slider w-full"
            />
            <div className="mt-3">
              <PresetChips
                presets={QUESTION_PRESETS}
                value={questions}
                onSelect={setQuestions}
                format={(v) => v.toLocaleString("en-US")}
              />
            </div>
          </div>
        </div>

        <Readout label="Per month" credits={tutorCredits} suffix=" / mo" />
        <p className="mt-3 text-xs text-caption">
          {tutor.model}: about {tutor.typicalCreditsPerQuestion}{" "}
          {tutor.typicalCreditsPerQuestion === 1 ? "credit" : "credits"} per
          question. {tutor.note}
        </p>
      </div>
    </div>
  );
}
