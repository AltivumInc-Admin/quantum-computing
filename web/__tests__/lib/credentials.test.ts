import { readFileSync } from "fs";
import path from "path";
import {
  computeCredentials,
  MASTERY_TIERS,
  CONSISTENCY_TIERS,
  HARDWARE_TIERS,
  type CredentialInput,
} from "@/lib/credentials";

// The ONE shared contract between the money path (lambda/qpu) and the credential
// wall (web) — they live in different packages and cannot import each other. The
// Lambda's feasibility lock (qpu-core.test.mjs) asserts the REAL cap/price constants
// still match this file AND that every tier is co-earnable within the cap; the block
// below asserts HARDWARE_TIERS still matches it too. Neither suite hand-copies the
// other's numbers, so a change on EITHER side fails loudly here instead of shipping
// a medal the platform's own budget makes impossible to earn — which is exactly the
// bug this ladder replaced (a 20-run medal costing $8.90 under a $5.00 cap).
const LADDER = JSON.parse(
  readFileSync(
    path.join(__dirname, "../../../lambda/qpu/__fixtures__/hardware-ladder.json"),
    "utf8",
  ),
) as {
  lifetimeCapMicros: number;
  perTaskMicros: number;
  perShotMicros: number;
  maxShots: number;
  tiers: { n: number; title: string; metric: "runs" | "shots" }[];
  cheapestPath: { runs: number; shots: number; costMicros: number };
};

const base: CredentialInput = {
  sections: [
    { slug: "00-prereqs", title: "Prerequisites", done: false },
    { slug: "01-foundations", title: "Foundations", done: false },
  ],
  mastery: 0,
  longestStreakWeeks: 0,
  hardwareRuns: 0,
  hardwareShots: 0,
};

describe("computeCredentials", () => {
  it("emits one completion medal per section, earned by the section flag", () => {
    const creds = computeCredentials({
      ...base,
      sections: [
        { slug: "00-prereqs", title: "Prerequisites", done: true },
        { slug: "01-foundations", title: "Foundations", done: false },
      ],
    });
    const completion = creds.filter((c) => c.group === "completion");
    expect(completion).toHaveLength(2);
    expect(completion[0]).toMatchObject({ earned: true, title: "Prerequisites" });
    expect(completion[1]).toMatchObject({ earned: false, title: "Foundations" });
    expect(completion[0].evidence).toMatch(/Prerequisites/);
  });

  it("emits the mastery tiers, earned at/over each retention threshold", () => {
    const creds = computeCredentials({ ...base, mastery: 15 });
    const mastery = creds.filter((c) => c.group === "mastery");
    expect(mastery).toHaveLength(MASTERY_TIERS.length);
    // 15 retained clears the 1/5/15 tiers, not the 30/50 ones.
    for (const c of mastery) {
      const threshold = Number(c.id.split(":")[1]);
      expect(c.earned).toBe(15 >= threshold);
    }
    const earned = mastery.filter((c) => c.earned);
    expect(earned.at(-1)!.evidence).toMatch(/15 skills/);
  });

  it("emits the consistency tiers, earned by the LONGEST streak (never un-earns)", () => {
    const creds = computeCredentials({ ...base, longestStreakWeeks: 12 });
    const consistency = creds.filter((c) => c.group === "consistency");
    expect(consistency).toHaveLength(CONSISTENCY_TIERS.length);
    for (const c of consistency) {
      const weeks = Number(c.id.split(":")[1]);
      expect(c.earned).toBe(12 >= weeks);
    }
  });

  it("singularizes the first mastery medal's evidence (1 skill, not 1 skills)", () => {
    const first = computeCredentials({ ...base, mastery: 1 }).find((c) => c.id === "mastery:1")!;
    expect(first.earned).toBe(true);
    expect(first.evidence).toBe("1 skill in proven retention");
  });

  it("HARDWARE_TIERS matches the shared ladder fixture (no hand-copied constants)", () => {
    // The parity lock. If someone edits the ladder here, the Lambda's feasibility
    // lock must be re-run — and vice versa. This is the test that points them there.
    expect(HARDWARE_TIERS).toEqual(LADDER.tiers);
  });

  it("the ladder the wall advertises is EARNABLE inside the sponsored cap", () => {
    // The web-side half of the feasibility guarantee. cost(R,S) = TASK*R + SHOT*S —
    // cost depends only on the run count and the shot total, never on how the shots
    // are split across runs, so this is the true cheapest path to the WHOLE ladder.
    const runs = Math.max(...HARDWARE_TIERS.filter((t) => t.metric === "runs").map((t) => t.n));
    const shots = Math.max(...HARDWARE_TIERS.filter((t) => t.metric === "shots").map((t) => t.n));
    const need = LADDER.perTaskMicros * runs + LADDER.perShotMicros * shots;
    expect(shots).toBeLessThanOrEqual(LADDER.maxShots * runs); // the shots are placeable
    expect(need).toBeLessThanOrEqual(LADDER.lifetimeCapMicros); // and affordable
    expect(need).toBe(LADDER.cheapestPath.costMicros); // exactly the plan we advertise
  });

  it("emits hardware tiers: two counted in RUNS, the top one counted in SHOTS", () => {
    // 4 runs / 1,247 shots: clears both run tiers AND the 1,000-shot tier.
    const creds = computeCredentials({ ...base, hardwareRuns: 4, hardwareShots: 1_247 });
    const hardware = creds.filter((c) => c.group === "hardware");
    expect(hardware).toHaveLength(HARDWARE_TIERS.length);
    expect(hardware.every((c) => c.earned)).toBe(true);

    const runTier = hardware.find((c) => c.id === "hardware:runs:3")!;
    expect(runTier.title).toBe("Run series");
    expect(runTier.evidence).toBe("4 completed runs on IQM Garnet");

    const shotTier = hardware.find((c) => c.id === "hardware:shots:1000")!;
    expect(shotTier.title).toBe("Deep sample");
    // The evidence reads as a lab record: the sample AND the runs it came from.
    expect(shotTier.evidence).toBe("1,247 shots across 4 completed runs on IQM Garnet");
  });

  it("a shots tier NEVER renders the runs grammar ('Complete 1000 runs')", () => {
    // The structural bug this metric discriminant exists to prevent: rendered through
    // the old runs-only template, the 1,000-SHOT medal would have demanded 1,000 RUNS
    // — a worse lie than the unearnable medal it replaced.
    const shotTier = computeCredentials(base).find((c) => c.id === "hardware:shots:1000")!;
    expect(shotTier.requirement).toBe("Run 1,000 total shots on real hardware");
    expect(shotTier.requirement).toMatch(/shots/i);
    // It must never DEMAND runs: no plural "runs" noun, and not the "Complete N…"
    // grammar the run tiers use. (The verb "Run" is fine — that is what you do.)
    expect(shotTier.requirement).not.toMatch(/\bruns\b/i);
    expect(shotTier.requirement).not.toMatch(/^complete/i);
    // And the run tiers must never demand shots.
    const runTier = computeCredentials(base).find((c) => c.id === "hardware:runs:3")!;
    expect(runTier.requirement).toBe("Complete 3 runs on real hardware");
    expect(runTier.requirement).not.toMatch(/shots/i);
  });

  it("shots and runs are counted INDEPENDENTLY (many runs, too few shots)", () => {
    // The 1-shot-spam path the old run-count ladder rewarded: 8 runs buys both run
    // medals for ~$0.90 and still cannot reach Deep sample. The incentive inverts.
    const creds = computeCredentials({ ...base, hardwareRuns: 8, hardwareShots: 8 });
    const hardware = creds.filter((c) => c.group === "hardware");
    expect(hardware.find((c) => c.id === "hardware:runs:1")!.earned).toBe(true);
    expect(hardware.find((c) => c.id === "hardware:runs:3")!.earned).toBe(true);
    expect(hardware.find((c) => c.id === "hardware:shots:1000")!.earned).toBe(false);
  });

  it("one maxed 1,000-shot run banks Deep sample outright (the optimal play)", () => {
    const creds = computeCredentials({ ...base, hardwareRuns: 1, hardwareShots: 1_000 });
    const hardware = creds.filter((c) => c.group === "hardware");
    expect(hardware.find((c) => c.id === "hardware:shots:1000")!.earned).toBe(true);
    expect(hardware.find((c) => c.id === "hardware:runs:3")!.earned).toBe(false);
    // Singular, not "1 completed runs".
    expect(hardware.find((c) => c.id === "hardware:runs:1")!.evidence).toBe(
      "1 completed run on IQM Garnet",
    );
  });

  it("locked medals carry their requirement text and no evidence", () => {
    const creds = computeCredentials(base); // nothing earned
    for (const c of creds.filter((x) => !x.earned)) {
      expect(c.requirement.length).toBeGreaterThan(0);
      expect(c.evidence).toBe("");
    }
  });

  it("summarizes earned vs total", () => {
    const creds = computeCredentials({
      ...base,
      sections: [{ slug: "00-prereqs", title: "Prerequisites", done: true }],
      mastery: 5,
      longestStreakWeeks: 4,
    });
    const earned = creds.filter((c) => c.earned).length;
    // 1 completion + 2 mastery (1,5) + 1 consistency (4) = 4.
    expect(earned).toBe(4);
  });
});
