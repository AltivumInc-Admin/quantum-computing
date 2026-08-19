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
import {
  BANNED_CLAIMS,
  affirmativeHit,
  bannedClaimHits,
} from "../_support/changelog-ban-list";

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
  // The list and the matcher live in __tests__/_support/changelog-ban-list.ts,
  // because three surfaces must be scanned with the SAME list and three copies
  // would drift: the data strings here, the RENDERED page in both locales
  // (__tests__/components/changelog/changelog-page-content.test.tsx) and the
  // METADATA export (__tests__/app/changelog-page.test.tsx). Spec section 6 asks
  // for rendered text in both locales; data alone never reaches the page chrome
  // or the share-card copy.

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

  it.each(BANNED_CLAIMS)("never claims what it cannot deliver: $why", ({ pattern }) => {
    expect(allCopy().filter((r) => affirmativeHit(r.text, pattern)).map((r) => r.label)).toEqual([]);
  });
});

describe("the ban list's matcher", () => {
  const [PURCHASE, PURCHASE_ES, HARDWARE, HARDWARE_ES] = BANNED_CLAIMS;

  it("catches a plain affirmative claim (the guard is not inert)", () => {
    expect(affirmativeHit("You can buy credits today.", PURCHASE.pattern)).toBe(true);
  });

  it("catches evasions using house vocabulary — purchase", () => {
    // The site's own copy says "top up", "purchase", "topup" where the original
    // pattern only caught "buy".
    expect(affirmativeHit("You can now top up your wallet from the Pricing page.", PURCHASE.pattern)).toBe(true);
    expect(affirmativeHit("You can now purchase credits directly.", PURCHASE.pattern)).toBe(true);
    expect(affirmativeHit("Top up your balance to unlock premium features.", PURCHASE.pattern)).toBe(true);
  });

  it("catches evasions using house vocabulary — Spanish purchase", () => {
    expect(affirmativeHit("Ahora puedes recargar tu cartera desde la página de Precios.", PURCHASE_ES.pattern)).toBe(true);
    expect(affirmativeHit("Puedes adquirir créditos directamente.", PURCHASE_ES.pattern)).toBe(true);
  });

  it("catches hardware runs without a 'real' or 'actual' modifier", () => {
    expect(affirmativeHit("You can now run your circuit on hardware.", HARDWARE.pattern)).toBe(true);
    expect(affirmativeHit("Execute them on hardware directly from the browser.", HARDWARE.pattern)).toBe(true);
  });

  it("catches hardware runs in Spanish without a real/cuántico modifier", () => {
    expect(affirmativeHit("Ahora puedes ejecutar en hardware directamente.", HARDWARE_ES.pattern)).toBe(true);
  });

  it("does not match bare 'hardware' in curriculum contexts", () => {
    // The guard must not trip on legitimate entries about the Hardware section.
    // The pattern requires the run/execute action near "on hardware", not the word.
    expect(affirmativeHit("The Hardware lesson now covers IQM's connectivity graph.", HARDWARE.pattern)).toBe(false);
    expect(affirmativeHit("A new page on hardware noise and how it limits circuit depth.", HARDWARE.pattern)).toBe(false);
  });

  it("respects a negation in the same clause", () => {
    expect(affirmativeHit("You cannot buy credits yet.", PURCHASE.pattern)).toBe(false);
    expect(affirmativeHit("You still cannot top up your wallet.", PURCHASE.pattern)).toBe(false);
    expect(affirmativeHit("You can't purchase a subscription in this region yet.", PURCHASE.pattern)).toBe(false);
  });

  it("is not immunized by a negated mention EARLIER in the text", () => {
    // exec() on a non-global regex returns match #1 and stops, so the honest
    // first sentence used to cover every affirmative sentence after it.
    expect(affirmativeHit("You cannot buy credits yet. You can purchase a plan today.", PURCHASE.pattern)).toBe(true);
  });

  it("is not immunized by an honest LEADING CLAUSE of the same sentence", () => {
    // "X is not available yet, but you can now Y" is the single most common shape
    // this prose takes. A sentence-wide negation window let all of it through.
    expect(affirmativeHit("Credits are not sold yet, but you can now top up your wallet.", PURCHASE.pattern)).toBe(true);
    expect(affirmativeHit("Hardware is not open to everyone; you can run a circuit on hardware from any lesson.", HARDWARE.pattern)).toBe(true);
  });

  it("reports the matched text and the reason, so a failure names the defect", () => {
    expect(bannedClaimHits("You can buy credits today.", "en")).toEqual([
      `[en] advertised "buy credits" — ${PURCHASE.why}`,
    ]);
    expect(bannedClaimHits("Nothing here is for sale.", "en")).toEqual([]);
  });
});
