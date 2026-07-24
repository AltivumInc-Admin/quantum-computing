import {
  translate,
  flattenKeys,
  getDict,
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
