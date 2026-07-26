/**
 * Pure credential kernel — no storage, no clock. Turns the learner's already-
 * synced progress into a set of software-verified credentials (engraved medals),
 * each with an earned/locked state and an evidence line. All three groups are
 * derived from data that already merges cross-device, so there is no new store:
 *
 *   completion   — one medal per module, earned by the qc:section flag. Flags
 *                  never un-complete under the additive sync, so these are stable.
 *   mastery      — tiered by skills in proven retention (CardState stability).
 *                  Reflects CURRENT retention, so a medal CAN lapse if the
 *                  learner lets skills go — deliberately: a credential for
 *                  knowledge you have since forgotten fails the "would a peer
 *                  infer real skill?" test the whole platform is built on.
 *   consistency  — tiered by the LONGEST weekly streak (monotonic), so these
 *                  never un-earn once achieved.
 *   hardware     — the real-hardware track (IQM Garnet), reconciled from actual
 *                  Braket task provenance and PAID FOR BY THE PLATFORM. Two tiers
 *                  count COMPLETED runs; the top tier counts total SHOTS across
 *                  completed runs, because shots — not submissions — buy statistical
 *                  precision. A run's $0.30 task fee is flat and dominates the
 *                  $0.00145 shot fee, so a run-count top medal would pay learners to
 *                  spam 1-shot runs and penalise good experimental design. Monotonic:
 *                  hardware medals never lapse. The one credential a competitor
 *                  structurally can't copy: you ran on the real device.
 *
 * INVARIANT: every hardware tier must be earnable within LIFETIME_CAP_MICROS
 * (lambda/qpu/qpu-core.mjs). The ladder and the cap are pinned together by the
 * committed fixture lambda/qpu/__fixtures__/hardware-ladder.json, asserted from BOTH
 * sides (qpu-core.test.mjs's feasibility lock + credentials.test.ts). Do not add a
 * tier without it: the ladder this replaced (1/5/20 runs) shipped a 20-run medal
 * costing $8.90 under a $5.00 cap — a medal the platform's own budget made
 * impossible to earn, under a header promising "Each medal is earned, not awarded."
 */

import { translate } from "@/i18n/translate";
import { localeCode } from "@/i18n/locale-code";
import { DEFAULT_LOCALE } from "@/i18n/types";
import type { Locale, TFunction } from "@/i18n/types";

export type CredentialGroup = "completion" | "mastery" | "consistency" | "hardware";

export interface Credential {
  /** Stable id, e.g. "mastery:15" or "completion:01-foundations". */
  id: string;
  group: CredentialGroup;
  title: string;
  /** What it takes to earn it (shown on a locked medal). */
  requirement: string;
  earned: boolean;
  /** One-line proof when earned; "" when locked. */
  evidence: string;
}

export interface CredentialInput {
  sections: { slug: string; title: string; done: boolean }[];
  /** Skills currently in proven retention (see runbook.masteryCount). */
  mastery: number;
  /** The learner's longest weekly streak ever (see runbook.streak). */
  longestStreakWeeks: number;
  /** COMPLETED real-hardware runs (from the reconciled QPU task provenance). */
  hardwareRuns: number;
  /** Total shots across COMPLETED real-hardware runs. */
  hardwareShots: number;
  /** Optional translator; defaults to English so the pure unit tests stay
   *  deterministic (mirrors workspace.resolveValve). */
  t?: TFunction;
  /** Locale for Intl digit grouping ONLY — a dictionary leaf cannot express
   *  "1,000", so the 1,000-shot tier needs the BCP 47 tag as well as `t`.
   *  (es-MX groups with a comma too, so the grouped strings coincide; that is a
   *  coincidence of these two locales, not something to rely on.) */
  locale?: Locale;
}

/** Retention milestones. `title` is the tier's STABLE ENGLISH IDENTITY, not its
 *  display name: it is asserted verbatim by nextUnearnedTier's tests and (for
 *  HARDWARE_TIERS) deep-equal locked to the cross-package ladder fixture. The
 *  displayed name is looked up as `credentialsUi.tiers.<group>.<n>` instead, so
 *  no translation key may be stored on these objects.
 *  `title` names the rung on the Newcomer→Practitioner→SME ladder. */
export const MASTERY_TIERS: { n: number; title: string }[] = [
  { n: 1, title: "First retention" },
  { n: 5, title: "Practiced" },
  { n: 15, title: "Fluent" },
  { n: 30, title: "Deep" },
  { n: 50, title: "Command" },
];

/** Streak milestones, in weeks. */
export const CONSISTENCY_TIERS: { n: number; title: string }[] = [
  { n: 4, title: "Consistent" },
  { n: 12, title: "Committed" },
  { n: 26, title: "Relentless" },
];

/** Real-hardware milestones — the three artifacts of an experimental campaign: a
 *  result, a series, a sample. The top tier is measured in SHOTS, not runs (see the
 *  header): shots buy statistical precision, runs buy only the right to submit again.
 *  `metric` is a discriminant because the requirement grammar has to branch — a shots
 *  tier rendered through the runs template would read "Complete 1000 runs on real
 *  hardware", a worse lie than the one this ladder fixes.
 *  Pinned to the money constants by __fixtures__/hardware-ladder.json (see header). */
export const HARDWARE_TIERS: { n: number; title: string; metric: "runs" | "shots" }[] = [
  { n: 1, title: "Ran on real hardware", metric: "runs" },
  { n: 3, title: "Run series", metric: "runs" },
  { n: 1000, title: "Deep sample", metric: "shots" },
];

/**
 * The nearest tier the learner has NOT yet reached, and how far it is — the "Within
 * reach" objective. Tiers are ascending by `n`, so the first tier above the current
 * value is the next rung. Null when every tier is already earned (nothing is within
 * reach because it is all behind them). Pure; two lines; no storage.
 */
export function nextUnearnedTier<T extends { n: number }>(
  tiers: T[],
  value: number,
): { tier: T; distance: number } | null {
  const tier = tiers.find((t) => t.n > value);
  return tier ? { tier, distance: tier.n - value } : null;
}

export function computeCredentials(input: CredentialInput): Credential[] {
  const t: TFunction =
    input.t ?? ((key, values, count) => translate(DEFAULT_LOCALE, key, values, count));
  // Digit grouping is the one thing the dictionary cannot carry.
  const tag = localeCode(input.locale ?? DEFAULT_LOCALE);
  const num = (n: number) => n.toLocaleString(tag);
  const creds: Credential[] = [];

  // Completion — one per module. The section title arrives already localized
  // (the caller resolves it through i18n/sectionTitle), so it is interpolated,
  // never re-translated here.
  for (const s of input.sections) {
    creds.push({
      id: `completion:${s.slug}`,
      group: "completion",
      title: s.title,
      requirement: t("credentialsUi.completionRequirement", { title: s.title }),
      earned: s.done,
      evidence: s.done ? t("credentialsUi.completionEvidence", { title: s.title }) : "",
    });
  }

  // Mastery — retention milestones. The display title is DERIVED from the tier's
  // threshold, never read off `tier.title`: that field is the stable English
  // identity the fixture lock and the nextUnearnedTier tests assert against.
  for (const tier of MASTERY_TIERS) {
    const earned = input.mastery >= tier.n;
    creds.push({
      id: `mastery:${tier.n}`,
      group: "mastery",
      title: t(`credentialsUi.tiers.mastery.${tier.n}`),
      requirement: t("credentialsUi.masteryRequirement", { n: num(tier.n) }, tier.n),
      earned,
      evidence: earned
        ? t("credentialsUi.masteryEvidence", { n: num(input.mastery) }, input.mastery)
        : "",
    });
  }

  // Consistency — longest-streak milestones.
  for (const tier of CONSISTENCY_TIERS) {
    const earned = input.longestStreakWeeks >= tier.n;
    creds.push({
      id: `consistency:${tier.n}`,
      group: "consistency",
      title: t(`credentialsUi.tiers.consistency.${tier.n}`),
      requirement: t("credentialsUi.consistencyRequirement", { n: num(tier.n) }, tier.n),
      earned,
      evidence: earned
        ? t(
            "credentialsUi.consistencyEvidence",
            { n: num(input.longestStreakWeeks) },
            input.longestStreakWeeks,
          )
        : "",
    });
  }

  // Hardware — COMPLETED real-hardware runs and the shots inside them, both from
  // reconciled Braket task provenance (server aggregates, never a client tally).
  for (const tier of HARDWARE_TIERS) {
    const value = tier.metric === "shots" ? input.hardwareShots : input.hardwareRuns;
    const earned = value >= tier.n;
    // The shared clause: the run count is the provenance behind BOTH metrics, so a
    // shots medal still cites the runs it was sampled across ("a lab record").
    const runs = t(
      "credentialsUi.hardwareRunsEvidence",
      { n: num(input.hardwareRuns) },
      input.hardwareRuns,
    );
    creds.push({
      // id carries the metric: a runs-tier and a shots-tier can otherwise collide
      // on `n`. (Safe to change — the id is only a React key, never persisted.)
      id: `hardware:${tier.metric}:${tier.n}`,
      group: "hardware",
      title: t(`credentialsUi.tiers.hardware.${tier.metric}.${tier.n}`),
      // The metric discriminant still branches the GRAMMAR, now across two keys
      // rather than two template literals: a shots tier must never render the
      // runs template ("Complete 1000 runs on real hardware").
      requirement:
        tier.metric === "shots"
          ? t("credentialsUi.hardwareShotsRequirement", { n: num(tier.n) }, tier.n)
          : t("credentialsUi.hardwareRunsRequirement", { n: num(tier.n) }, tier.n),
      earned,
      evidence: !earned
        ? ""
        : tier.metric === "shots"
          ? t(
              "credentialsUi.hardwareShotsEvidence",
              { n: num(input.hardwareShots), runs },
              input.hardwareShots,
            )
          : runs,
    });
  }

  return creds;
}
