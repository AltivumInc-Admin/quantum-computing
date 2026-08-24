"use client";

import { useId, useState } from "react";
import { useLocale, localeCode } from "@/i18n";
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
      <p className="eyebrow eyebrow-mut">{label}</p>
      <p className="mt-1 font-mono text-display-lg text-(--ink) tabular-nums">
        {formatCredits(credits)}
        <span className="ml-2 text-base font-mono text-gray-500 dark:text-gray-400">
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
  ariaLabel,
}: {
  presets: number[];
  value: number;
  onSelect: (v: number) => void;
  format: (v: number) => string;
  ariaLabel: string;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={ariaLabel}>
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
 * or a tutor model and a monthly question habit — and see the credits before you
 * ever commit to anything.
 *
 * The two panes model different things and must say so. Hardware: this is a
 * forecast in CREDITS from lib/pricing.ts, and it is not the math a learner meets
 * before a real submission — that pre-flight prices AWS dollars through
 * lib/qpu-budget.ts `costMicros`, off the separate table in
 * components/quantum/cost.ts. Different table, different currency, ~12.6% apart, so
 * do not describe the two as one estimate (pricing-page.test.tsx bars that claim in
 * the copy). Tutor: nothing is metered, and the deployed tutor answers on one
 * hardcoded model that takes no parameter from the client — so the model chips are a
 * what-if forecast, labelled and disclosed as one rather than a selector for
 * something purchasable today.
 */
export function CostEstimator() {
  const { t, locale } = useLocale();
  const loc = localeCode(locale);
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
          {t("pricingUi.priceHardware")}
        </h3>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          {t("pricingUi.priceHardwareBody")}
        </p>

        <div className="mt-6 space-y-5">
          <div>
            <label
              htmlFor={deviceId}
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
            >
              {t("pricingUi.backend")}
            </label>
            <select
              id={deviceId}
              value={deviceIdx}
              onChange={(e) => setDeviceIdx(Number(e.target.value))}
              className="w-full rounded-control border border-(--bd) bg-(--surface-2) px-3 py-2 text-sm text-(--ink) focus-ring"
            >
              {HARDWARE_RATES.map((r, i) => {
                const techKey =
                  r.technology === "Superconducting, 108 qubits"
                    ? "pricingUi.techSuperconducting108"
                    : r.technology === "Superconducting"
                      ? "pricingUi.techSuperconducting"
                      : r.technology === "Neutral-atom analog"
                        ? "pricingUi.techNeutralAtom"
                        : r.technology === "Trapped-ion"
                          ? "pricingUi.techTrappedIon"
                          : null;
                return (
                  <option key={r.name} value={i}>
                    {r.name} — {techKey ? t(techKey) : r.technology}
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor={shotsId}
                className="text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                {t("pricingUi.shots")}
              </label>
              <span className="text-sm tabular-nums text-gray-500 dark:text-gray-400">
                {shots.toLocaleString(loc)}
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
              // `focus-ring` + `aria-valuetext` are the shared slider contract
              // LabeledSlider single-sources for every widget slider; these two
              // pricing rows keep their own stacked layout, so they carry the
              // contract explicitly rather than announcing a bare number with
              // no visible focus affordance.
              className="slider w-full focus-ring"
              aria-valuetext={t("pricingUi.shotsValue", { n: shots.toLocaleString(loc) })}
            />
            <div className="mt-3">
              <PresetChips
                presets={SHOT_PRESETS}
                value={shots}
                onSelect={setShots}
                format={(v) => v.toLocaleString(loc)}
                ariaLabel={t("pricingUi.presets")}
              />
            </div>
          </div>
        </div>

        <Readout label={t("pricingUi.thisRun")} credits={runCredits} />
        <p className="mt-3 text-xs text-caption">
          {t("pricingUi.perShotPlusTask", {
            perShot: device.creditsPerShot,
            fee: TASK_FEE_CREDITS,
          })}
        </p>
      </div>

      {/* ---- AI tutor ---- */}
      <div className={paneChrome}>
        <h3 className="font-display text-display-md text-(--ink)">
          {t("pricingUi.priceTutorMonth")}
        </h3>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          {t("pricingUi.priceTutorBody")}
        </p>

        <div className="mt-6 space-y-5">
          <div>
            <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              {t("pricingUi.modelToPrice")}
            </span>
            {/* The chips model a future bill; they buy nothing. The disclosure sits
                above them — a buyer must meet it before the control, not a section
                later — and the group's accessible name carries the same framing. */}
            <p className="mb-2.5 text-xs text-caption">
              {t("pricingUi.modelNotSelectableYet")}
            </p>
            <div className="flex flex-wrap gap-2" role="group" aria-label={t("pricingUi.tutorModel")}>
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
                {t("pricingUi.questionsPerMonth")}
              </label>
              <span className="text-sm tabular-nums text-gray-500 dark:text-gray-400">
                {questions.toLocaleString(loc)}
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
              className="slider w-full focus-ring"
              aria-valuetext={t("pricingUi.questionsValue", { n: questions.toLocaleString(loc) })}
            />
            <div className="mt-3">
              <PresetChips
                presets={QUESTION_PRESETS}
                value={questions}
                onSelect={setQuestions}
                format={(v) => v.toLocaleString(loc)}
                ariaLabel={t("pricingUi.presets")}
              />
            </div>
          </div>
        </div>

        <Readout label={t("pricingUi.perMonthLabel")} credits={tutorCredits} suffix={t("pricingUi.perMoSuffix")} />
        <p className="mt-3 text-xs text-caption">
          {t(
            "pricingUi.aboutCreditsPerQ",
            {
              model: tutor.model,
              count: tutor.typicalCreditsPerQuestion,
              note:
                tutor.model === "Claude Haiku"
                  ? t("pricingUi.tutorNoteHaiku")
                  : tutor.model === "Claude Sonnet"
                    ? t("pricingUi.tutorNoteSonnet")
                    : tutor.model === "Claude Opus"
                      ? t("pricingUi.tutorNoteOpus")
                      : t("pricingUi.tutorNoteFable"),
            },
            tutor.typicalCreditsPerQuestion,
          )}
        </p>
      </div>
    </div>
  );
}
