import { readFileSync } from "fs";
import path from "path";
import {
  computeCredentials,
  nextUnearnedTier,
  MASTERY_TIERS,
  CONSISTENCY_TIERS,
  HARDWARE_TIERS,
  type CredentialInput,
} from "@/lib/credentials";
import { translate } from "@/i18n/translate";
import type { TFunction } from "@/i18n/types";

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
  grandfatheredCapMicros: number;
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
    expect(need).toBe(LADDER.cheapestPath.costMicros); // the advertised price IS the real one
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

describe("computeCredentials — the Spanish path", () => {
  // The bug this covers: every one of these strings already had a Spanish
  // translation in the dictionary and the kernel referenced NONE of them, so a
  // Spanish learner read an entirely English credentials wall. The English
  // assertions above are the byte-for-byte wording spec; these are the proof the
  // translator is actually threaded through, not that it merely type-checks.
  const es: TFunction = (key, values, count) => translate("es", key, values, count);
  const esInput: CredentialInput = { ...base, t: es, locale: "es" };

  it("translates a completion medal's requirement and evidence", () => {
    const creds = computeCredentials({
      ...esInput,
      sections: [{ slug: "00-prereqs", title: "Prerrequisitos", done: true }],
    });
    const medal = creds.find((c) => c.group === "completion")!;
    // The module NAME is interpolated (the caller resolves it through
    // i18n/sectionTitle); the sentence around it is what the kernel translates.
    expect(medal.requirement).toBe("Completa el módulo Prerrequisitos");
    expect(medal.evidence).toBe("Módulo Prerrequisitos completado");
  });

  it("agrees Spanish number and gender on the mastery medals (singular and plural)", () => {
    const one = computeCredentials({ ...esInput, mastery: 1 }).find((c) => c.id === "mastery:1")!;
    expect(one.title).toBe("Primera retención");
    expect(one.requirement).toBe("Mantén 1 habilidad en retención comprobada");
    expect(one.evidence).toBe("1 habilidad en retención comprobada");

    const many = computeCredentials({ ...esInput, mastery: 15 });
    expect(many.find((c) => c.id === "mastery:15")!.title).toBe("Con fluidez");
    // Plural: "habilidades", which the English "s" suffix trick could not express.
    expect(many.find((c) => c.id === "mastery:15")!.evidence).toBe(
      "15 habilidades en retención comprobada",
    );
    expect(many.find((c) => c.id === "mastery:5")!.requirement).toBe(
      "Mantén 5 habilidades en retención comprobada",
    );
  });

  it("translates a consistency medal's streak evidence", () => {
    const creds = computeCredentials({ ...esInput, longestStreakWeeks: 12 });
    const medal = creds.find((c) => c.id === "consistency:12")!;
    expect(medal.title).toBe("Comprometido");
    expect(medal.evidence).toBe("Una racha de 12 semanas");
  });

  it("translates BOTH hardware metrics, keeping the shared completed-runs clause", () => {
    const creds = computeCredentials({ ...esInput, hardwareRuns: 4, hardwareShots: 1_247 });
    const runTier = creds.find((c) => c.id === "hardware:runs:3")!;
    expect(runTier.title).toBe("Serie de ejecuciones");
    expect(runTier.evidence).toBe("4 ejecuciones completadas en IQM Garnet");

    const shotTier = creds.find((c) => c.id === "hardware:shots:1000")!;
    expect(shotTier.title).toBe("Muestra profunda");
    // The lab record in Spanish: the sample AND the runs it was sampled across.
    // es-MX groups thousands with a comma, same as en-US.
    expect(shotTier.evidence).toBe(
      "1,247 disparos repartidos en 4 ejecuciones completadas en IQM Garnet",
    );

    // Singular agreement on the shared clause.
    const single = computeCredentials({ ...esInput, hardwareRuns: 1, hardwareShots: 1 });
    expect(single.find((c) => c.id === "hardware:runs:1")!.evidence).toBe(
      "1 ejecución completada en IQM Garnet",
    );
  });

  it("a Spanish shots tier NEVER renders the runs grammar either", () => {
    // The metric discriminant has to survive translation: two separate dictionary
    // keys, so no locale can collapse the shots demand into the runs sentence.
    const shotTier = computeCredentials(esInput).find((c) => c.id === "hardware:shots:1000")!;
    expect(shotTier.requirement).toBe("Ejecuta 1,000 disparos en total en hardware real");
    expect(shotTier.requirement).toMatch(/disparos/i);
    // "ejecuciones" is the runs noun — the shots medal must never demand them.
    // (The verb "Ejecuta" shares a root but not the noun, which is the point.)
    expect(shotTier.requirement).not.toMatch(/\bejecuciones\b/i);
    expect(shotTier.requirement).not.toMatch(/^completa/i);

    const runTier = computeCredentials(esInput).find((c) => c.id === "hardware:runs:3")!;
    expect(runTier.requirement).toBe("Completa 3 ejecuciones en hardware real");
    expect(runTier.requirement).not.toMatch(/disparo/i);
  });

  it("never leaks a raw dictionary key onto a Spanish medal", () => {
    // A missing tier key would render as "credentialsUi.tiers.mastery.30" — a
    // failure mode that looks like content, so it gets its own guard.
    const creds = computeCredentials({
      ...esInput,
      sections: [{ slug: "00-prereqs", title: "Prerrequisitos", done: true }],
      mastery: 50,
      longestStreakWeeks: 26,
      hardwareRuns: 4,
      hardwareShots: 1_247,
    });
    for (const c of creds) {
      for (const s of [c.title, c.requirement, c.evidence]) {
        expect(s).not.toMatch(/credentialsUi\./);
      }
    }
  });
});

describe("nextUnearnedTier — the Within-reach objective", () => {
  it("returns the first tier above the value and its distance", () => {
    // MASTERY_TIERS are 1/5/15/30/50. At 12 the next rung is Fluent (15), 3 away.
    const next = nextUnearnedTier(MASTERY_TIERS, 12);
    expect(next).toEqual({ tier: { n: 15, title: "Fluent" }, distance: 3 });
  });

  it("skips already-earned rungs (strictly greater than the value)", () => {
    // At exactly 5 (Practiced earned), the next is Fluent (15).
    expect(nextUnearnedTier(MASTERY_TIERS, 5)?.tier.n).toBe(15);
  });

  it("returns null when every tier is already reached", () => {
    expect(nextUnearnedTier(CONSISTENCY_TIERS, 26)).toBeNull(); // top tier is 26 weeks
    expect(nextUnearnedTier(MASTERY_TIERS, 999)).toBeNull();
  });

  it("returns the first tier from zero", () => {
    expect(nextUnearnedTier(CONSISTENCY_TIERS, 0)).toEqual({
      tier: { n: 4, title: "Consistent" },
      distance: 4,
    });
  });
});
