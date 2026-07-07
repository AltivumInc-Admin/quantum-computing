import {
  computeCredentials,
  MASTERY_TIERS,
  CONSISTENCY_TIERS,
  HARDWARE_TIERS,
  type CredentialInput,
} from "@/lib/credentials";

const base: CredentialInput = {
  sections: [
    { slug: "00-prereqs", title: "Prerequisites", done: false },
    { slug: "01-foundations", title: "Foundations", done: false },
  ],
  mastery: 0,
  longestStreakWeeks: 0,
  hardwareRuns: 0,
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

  it("emits hardware tiers, earned by COMPLETED real-hardware runs", () => {
    const creds = computeCredentials({ ...base, hardwareRuns: 5 });
    const hardware = creds.filter((c) => c.group === "hardware");
    expect(hardware).toHaveLength(HARDWARE_TIERS.length);
    for (const c of hardware) {
      const threshold = Number(c.id.split(":")[1]);
      expect(c.earned).toBe(5 >= threshold);
    }
    // 5 runs clears the 1 and 5 tiers, not the 20 tier.
    expect(hardware.filter((c) => c.earned)).toHaveLength(2);
    expect(hardware.find((c) => c.id === "hardware:1")!.evidence).toMatch(/5 completed runs on IQM Garnet/);
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
