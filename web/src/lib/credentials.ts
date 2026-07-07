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
 *   hardware     — tiered by COMPLETED real-hardware runs (IQM Garnet), reconciled
 *                  from actual Braket task provenance. The one credential a
 *                  competitor structurally can't copy: you ran on the real device.
 */

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
}

/** Retention milestones. `label` names the rung on the Newcomer→Practitioner→SME ladder. */
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

/** Real-hardware-run milestones. */
export const HARDWARE_TIERS: { n: number; title: string }[] = [
  { n: 1, title: "Ran on real hardware" },
  { n: 5, title: "Hardware regular" },
  { n: 20, title: "Hardware veteran" },
];

export function computeCredentials(input: CredentialInput): Credential[] {
  const creds: Credential[] = [];

  // Completion — one per module.
  for (const s of input.sections) {
    creds.push({
      id: `completion:${s.slug}`,
      group: "completion",
      title: s.title,
      requirement: `Complete the ${s.title} module`,
      earned: s.done,
      evidence: s.done ? `Completed the ${s.title} module` : "",
    });
  }

  // Mastery — retention milestones.
  for (const t of MASTERY_TIERS) {
    const earned = input.mastery >= t.n;
    creds.push({
      id: `mastery:${t.n}`,
      group: "mastery",
      title: t.title,
      requirement: `Hold ${t.n} skill${t.n === 1 ? "" : "s"} in proven retention`,
      earned,
      evidence: earned
        ? `${input.mastery} skill${input.mastery === 1 ? "" : "s"} in proven retention`
        : "",
    });
  }

  // Consistency — longest-streak milestones.
  for (const t of CONSISTENCY_TIERS) {
    const earned = input.longestStreakWeeks >= t.n;
    creds.push({
      id: `consistency:${t.n}`,
      group: "consistency",
      title: t.title,
      requirement: `Practice ${t.n} weeks in a row`,
      earned,
      evidence: earned ? `A ${input.longestStreakWeeks}-week streak` : "",
    });
  }

  // Hardware — completed real-hardware runs (from reconciled task provenance).
  for (const t of HARDWARE_TIERS) {
    const earned = input.hardwareRuns >= t.n;
    creds.push({
      id: `hardware:${t.n}`,
      group: "hardware",
      title: t.title,
      requirement: `Complete ${t.n} run${t.n === 1 ? "" : "s"} on real hardware`,
      earned,
      evidence: earned
        ? `${input.hardwareRuns} completed run${input.hardwareRuns === 1 ? "" : "s"} on IQM Garnet`
        : "",
    });
  }

  return creds;
}
