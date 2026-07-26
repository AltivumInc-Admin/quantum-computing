import {
  translate,
  flattenKeys,
  getDict,
  lookup,
  localeCode,
  pluralCategory,
  DEFAULT_LOCALE,
} from "@/i18n";

describe("translate", () => {
  it("resolves a plain nested key", () => {
    expect(translate("en", "nav.review")).toBe("Review");
    expect(translate("es", "nav.review")).toBe("Repasar");
  });

  it("interpolates template values", () => {
    expect(translate("en", "footer.tagline", { site: "QL" })).toContain("QL");
    expect(translate("es", "reviewCard.outcomeScheduled", { phrase: "mañana" })).toBe(
      "Próximo repaso mañana.",
    );
  });

  it("selects plural forms", () => {
    expect(translate("en", "review.trackedCount", { count: 1 }, 1)).toBe("1 card tracked");
    expect(translate("en", "review.trackedCount", { count: 3 }, 3)).toBe("3 cards tracked");
    expect(translate("es", "review.trackedCount", { count: 1 }, 1)).toBe(
      "1 tarjeta seguida",
    );
    expect(translate("es", "review.trackedCount", { count: 3 }, 3)).toBe(
      "3 tarjetas seguidas",
    );
  });

  it("falls back to English for a missing es key path (via unknown key on both)", () => {
    // Unknown key returns the key itself after both dicts miss.
    expect(translate("es", "does.not.exist")).toBe("does.not.exist");
  });

  it("falls back to English when locale is unknown", () => {
    expect(translate("fr" as "en", "nav.review")).toBe("Review");
  });
});

/**
 * The "faltan 1" defect. Both distance keys shipped as PLAIN STRINGS in both
 * dictionaries, so Spanish rendered a plural verb beside a singular count on every
 * track's last step — and distance === 1 is reachable on all three (mastery 4→5,
 * consistency 3→4, hardware 2→3 runs).
 *
 * Asserted in BOTH locales on purpose: English is uninflected here, so the English
 * rows are what pin the deliberate one===other pair (see the note in en.ts). If a
 * future edit collapses the English pair back to a plain string these rows keep
 * passing — which is exactly why the Spanish rows exist beside them.
 */
describe("Within-reach distance agreement", () => {
  it("selects the singular verb at distance 1 and the plural above it", () => {
    expect(translate("es", "workspaceUi.distanceToGo", { distance: 1 }, 1)).toBe("falta 1");
    expect(translate("es", "workspaceUi.distanceToGo", { distance: 2 }, 2)).toBe("faltan 2");
    expect(translate("es", "workspaceUi.distanceToGo", { distance: 12 }, 12)).toBe("faltan 12");
    expect(translate("en", "workspaceUi.distanceToGo", { distance: 1 }, 1)).toBe("1 to go");
    expect(translate("en", "workspaceUi.distanceToGo", { distance: 2 }, 2)).toBe("2 to go");
  });

  it("agrees the verb AND the unit noun in the hardware readout", () => {
    const es = (n: number) =>
      translate(
        "es",
        "workspaceUi.distanceUnitToGo",
        { distance: n, unit: translate("es", "workspaceUi.unitRun", {}, n) },
        n,
      );
    expect(es(1)).toBe("falta 1 ejecución");
    expect(es(2)).toBe("faltan 2 ejecuciones");
    const en = (n: number) =>
      translate(
        "en",
        "workspaceUi.distanceUnitToGo",
        { distance: n, unit: translate("en", "workspaceUi.unitRun", {}, n) },
        n,
      );
    expect(en(1)).toBe("1 run to go");
    expect(en(2)).toBe("2 runs to go");
  });

  it("keeps the two keys' leaf SHAPE identical across locales", () => {
    // The shape divergence is the root cause, not the wording: resolveLeaf() picks a
    // form per dictionary, so a plain-string English leaf beside a PluralForms Spanish
    // one renders fine and hides the asymmetry from every rendering test. Compare the
    // shapes directly.
    for (const key of ["workspaceUi.distanceToGo", "workspaceUi.distanceUnitToGo"]) {
      for (const locale of ["en", "es"] as const) {
        const leaf = lookup(getDict(locale), key);
        expect(typeof leaf).toBe("object"); // a PluralForms pair, never a bare string
        expect(Object.keys(leaf as object).sort()).toEqual(["one", "other"]);
      }
    }
  });
});

describe("pluralCategory", () => {
  it("treats 1 as one and everything else as other for en and es", () => {
    expect(pluralCategory("en", 1)).toBe("one");
    expect(pluralCategory("es", 1)).toBe("one");
    expect(pluralCategory("en", 0)).toBe("other");
    expect(pluralCategory("es", 2)).toBe("other");
  });
});

describe("localeCode", () => {
  it("maps en → en-US and es → es-MX", () => {
    expect(localeCode("en")).toBe("en-US");
    expect(localeCode("es")).toBe("es-MX");
  });
});

describe("dictionary completeness", () => {
  it("has every English key present in Spanish with a non-empty leaf", () => {
    const enKeys = flattenKeys(getDict("en")).sort();
    const esKeys = new Set(flattenKeys(getDict("es")));
    const missing = enKeys.filter((k) => !esKeys.has(k));
    expect(missing).toEqual([]);

    for (const key of enKeys) {
      const esVal = translate("es", key);
      expect(esVal.length).toBeGreaterThan(0);
      // Must not fall back to the raw key for known paths.
      expect(esVal).not.toBe(key);
    }
  });

  it("defaults locale constant is en", () => {
    expect(DEFAULT_LOCALE).toBe("en");
  });
});
