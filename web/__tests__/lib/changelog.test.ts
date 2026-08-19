import {
  CHANGELOG,
  SILENT,
  ENTRY_ID_PATTERN,
  sortedEntries,
  groupByMonth,
  monthLabel,
  type ChangeEntry,
} from "@/lib/changelog";
import { CHANGELOG_ES } from "@/lib/changelog-es";
import { getSectionBySlug } from "@/lib/sections";

const KINDS = ["new", "improved", "fixed"];

describe("changelog data integrity", () => {
  it("gives every entry a unique, permanent, URL-safe id", () => {
    const ids = CHANGELOG.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => !ENTRY_ID_PATTERN.test(id))).toEqual([]);
  });

  it("stamps every entry with a real, non-future ship date", () => {
    // `shipped` means visible to a learner IN PRODUCTION. No test can verify
    // that. What can be verified is that it is a real calendar date (2026-02-30
    // is not) and that nothing is announced before it exists.
    const today = new Date().toISOString().slice(0, 10);
    for (const e of CHANGELOG) {
      expect(e.shipped).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(new Date(`${e.shipped}T00:00:00Z`).toISOString().slice(0, 10)).toBe(e.shipped);
      expect(e.shipped.localeCompare(today)).toBeLessThanOrEqual(0);
    }
  });

  it("prefixes every id with its own ship date, so an id dates and sorts itself", () => {
    expect(CHANGELOG.filter((e) => !e.id.startsWith(`${e.shipped}-`)).map((e) => e.id)).toEqual([]);
  });

  it("is authored newest-first", () => {
    expect(CHANGELOG.map((e) => e.id)).toEqual(sortedEntries().map((e) => e.id));
  });

  it("links only to internal routes", () => {
    expect(
      CHANGELOG.filter((e) => e.href !== undefined && !e.href.startsWith("/")).map((e) => e.id),
    ).toEqual([]);
  });

  it("tags entries only with real curriculum sections", () => {
    expect(
      CHANGELOG.filter((e) => e.section && !getSectionBySlug(e.section)).map((e) => e.id),
    ).toEqual([]);
  });

  it("uses only the three learner-facing kinds", () => {
    expect(CHANGELOG.filter((e) => !KINDS.includes(e.kind)).map((e) => e.id)).toEqual([]);
  });

  it("writes in learner voice — no PR numbers, no file paths", () => {
    // This page is read by someone learning quantum computing, not by a
    // maintainer reading a diff. git already records the other version.
    for (const e of CHANGELOG) {
      const text = `${e.title} ${e.body}`;
      expect(text).not.toMatch(/#\d{2,}/);
      expect(text).not.toMatch(/\b[\w-]+\.(ts|tsx|mjs|py|json|ipynb)\b/);
    }
  });
});

describe("the SILENT ledger", () => {
  it("records a unique PR number and a real reason for every unannounced change", () => {
    const prs = SILENT.map((s) => s.pr);
    expect(new Set(prs).size).toBe(prs.length);
    for (const s of SILENT) {
      expect(Number.isInteger(s.pr)).toBe(true);
      expect(s.pr).toBeGreaterThan(0);
      expect(s.reason.trim().length).toBeGreaterThan(15);
    }
  });
});

describe("Spanish twin parity", () => {
  // BOTH directions, deliberately. The repo's only other en/es guard
  // (__tests__/lib/i18n.test.ts) computes enKeys.filter(k => !esKeys.has(k)) —
  // one-directional — so an orphaned Spanish key for a renamed id would sit
  // there forever with CI green.

  it("translates every entry", () => {
    expect(CHANGELOG.filter((e) => !CHANGELOG_ES[e.id]).map((e) => e.id)).toEqual([]);
  });

  it("carries no Spanish entry for an id that no longer exists", () => {
    const ids = new Set(CHANGELOG.map((e) => e.id));
    expect(Object.keys(CHANGELOG_ES).filter((k) => !ids.has(k))).toEqual([]);
  });

  it("gives every twin real prose, not an untranslated paste", () => {
    for (const e of CHANGELOG) {
      const es = CHANGELOG_ES[e.id];
      expect(es.title.trim().length).toBeGreaterThan(0);
      expect(es.body.trim().length).toBeGreaterThan(0);
      // Titles may legitimately coincide (a proper noun); a body of one to three
      // sentences that matches byte for byte is a paste, not a translation.
      expect(es.body).not.toBe(e.body);
    }
  });
});

describe("month grouping", () => {
  const sample: ChangeEntry[] = [
    { id: "2026-08-19-b", shipped: "2026-08-19", kind: "fixed", title: "B", body: "b" },
    { id: "2026-08-02-a", shipped: "2026-08-02", kind: "new", title: "A", body: "a" },
    { id: "2026-07-30-z", shipped: "2026-07-30", kind: "improved", title: "Z", body: "z" },
  ];

  it("groups newest month first, entries newest first inside it", () => {
    expect(groupByMonth(sample)).toEqual([
      { key: "2026-08", entries: [sample[0], sample[1]] },
      { key: "2026-07", entries: [sample[2]] },
    ]);
  });

  it("never merges the same month across different years", () => {
    const groups = groupByMonth([
      { id: "2026-08-01-x", shipped: "2026-08-01", kind: "new", title: "X", body: "x" },
      { id: "2025-08-01-y", shipped: "2025-08-01", kind: "new", title: "Y", body: "y" },
    ]);
    expect(groups.map((g) => g.key)).toEqual(["2026-08", "2025-08"]);
  });

  it("formats the month heading per locale — word order and case included", () => {
    // en-US "August 2026" vs es-MX "agosto de 2026": different word order AND
    // different capitalization. This is exactly why the label comes from Intl
    // and is never capitalized by hand with charAt(0).toUpperCase().
    expect(monthLabel("2026-08", "en-US")).toBe("August 2026");
    expect(monthLabel("2026-08", "es-MX")).toBe("agosto de 2026");
  });

  it("reads the month from the date string, never from a local-time Date", () => {
    // new Date("2026-08-01") is midnight UTC; formatting it west of UTC without
    // timeZone: "UTC" yields July. A changelog that files an entry under the
    // wrong month depending on the reader's clock is worse than no grouping.
    expect(monthLabel("2026-01", "en-US")).toBe("January 2026");
    expect(monthLabel("2026-12", "en-US")).toBe("December 2026");
  });
});

describe("rule 13 — the page may not advertise what the deployed system cannot do", () => {
  // A BAN list, deliberately not a presence assertion. The 2026-08-17 audit
  // established that locking a promise's PRESENCE in a test is exactly how a
  // withdrawn promise outlived its withdrawal. Re-verify these when the
  // storefront opens; do not delete them.
  const BANNED: { pattern: RegExp; why: string }[] = [
    {
      pattern: /\bbuy (credits|a plan|a subscription)\b/i,
      why: "the storefront is closed — no NEXT_PUBLIC_BILLING_URL in the live env",
    },
    {
      pattern: /\bcomprar? (créditos|un plan|una suscripción)\b/i,
      why: "the storefront is closed (Spanish)",
    },
    {
      pattern: /\brun (it |them )?on (real|actual) (quantum )?hardware\b/i,
      why: "LIFETIME_CAP_MICROS is 0 — no learner can run a QPU task",
    },
    {
      pattern: /\bejecutar? .{0,20}en hardware (real|cuántico)\b/i,
      why: "no learner can run a QPU task (Spanish)",
    },
    { pattern: /sponsor\w*/i, why: "the sponsored-QPU promise was withdrawn 2026-08-17" },
    { pattern: /patrocin\w*/i, why: "the sponsored-QPU promise was withdrawn (Spanish)" },
  ];

  // A denylist over raw text cannot see a negation, and the pricing page's guard
  // documents two real sentences that were honest and still matched. Narrow the
  // hit to affirmative constructions: ignore a match with a negation earlier in
  // the same sentence. A heuristic, and better than none.
  const NEGATION = /\b(no|not|never|cannot|can't|without|nunca|sin|tampoco|todavía no|aún no)\b/i;

  function affirmativeHit(text: string, pattern: RegExp): boolean {
    const m = pattern.exec(text);
    if (!m) return false;
    const sentenceStart = text.lastIndexOf(".", m.index) + 1;
    return !NEGATION.test(text.slice(sentenceStart, m.index));
  }

  function allCopy(): { label: string; text: string }[] {
    const rows: { label: string; text: string }[] = [];
    for (const e of CHANGELOG) {
      rows.push({ label: `${e.id} (en title)`, text: e.title });
      rows.push({ label: `${e.id} (en body)`, text: e.body });
    }
    for (const [id, v] of Object.entries(CHANGELOG_ES)) {
      rows.push({ label: `${id} (es title)`, text: v.title });
      rows.push({ label: `${id} (es body)`, text: v.body });
    }
    return rows;
  }

  it("scans both locales, and fails loudly if it is ever scanning nothing", () => {
    // Non-vacuity. If the data modules are restructured so this scan reads an
    // empty list, that must fail rather than pass green over zero strings —
    // the exact failure mode the pricing metadata guard was written to close.
    expect(allCopy()).toHaveLength(CHANGELOG.length * 2 + Object.keys(CHANGELOG_ES).length * 2);
    expect(allCopy().length).toBeGreaterThan(0);
  });

  it.each(BANNED)("never claims what it cannot deliver: $why", ({ pattern }) => {
    expect(allCopy().filter((r) => affirmativeHit(r.text, pattern)).map((r) => r.label)).toEqual([]);
  });

  it("still catches an affirmative claim (the guard is not inert)", () => {
    expect(affirmativeHit("You can buy credits today.", BANNED[0].pattern)).toBe(true);
    expect(affirmativeHit("You cannot buy credits yet.", BANNED[0].pattern)).toBe(false);
  });
});
