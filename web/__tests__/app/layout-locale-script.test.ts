/**
 * @jest-environment jsdom
 */

/**
 * The pre-paint <html lang> script in src/app/layout.tsx duplicates the locale
 * storage key and the whole set of valid locale values as BARE STRING LITERALS. That
 * duplication is deliberate and documented — the script has to run before any module
 * graph loads, so it cannot import src/i18n. What it cannot be is UNCHECKED: nothing
 * tied those literals to the constants they mirror, and the file had no test at all.
 * Rename LOCALE_STORAGE_KEY or add a third locale and the script silently stops
 * setting `lang` for the affected case, with a fully green suite.
 *
 * So this reads the layout source, extracts the emitted script, asserts the literals
 * against the IMPORTED constants (a rename fails here), and then EXECUTES the script
 * in jsdom for every locale — behaviour, not just text matching.
 *
 * On the `new Function(script)` below: the input is this repository's own committed
 * layout.tsx, read at test time, and nothing is interpolated into it. Running the real
 * emitted string is the only way to prove the script WORKS rather than merely that it
 * contains the right substrings — the exact distinction that let it go untested.
 */
import { readFileSync } from "fs";
import path from "path";
import { LOCALE_STORAGE_KEY, LOCALES } from "@/i18n";

const LAYOUT = path.join(__dirname, "../../src/app/layout.tsx");
const source = readFileSync(LAYOUT, "utf8");

/** The single-quoted __html payload handed to dangerouslySetInnerHTML. */
const script = (() => {
  const m = /__html:\s*'((?:[^'\\]|\\.)*)'/.exec(source);
  if (!m) throw new Error("no inline __html script found in layout.tsx");
  return m[1];
})();

describe("layout.tsx pre-paint locale script", () => {
  it("reads the SAME storage key i18n/storage.ts writes", () => {
    expect(script).toContain(`localStorage.getItem("${LOCALE_STORAGE_KEY}")`);
  });

  it("accepts exactly the LOCALES set — no more, no fewer", () => {
    const compared = [...script.matchAll(/l===\s*"([^"]*)"/g)].map((m) => m[1]);
    // Both directions matter: a missing locale silently drops those learners back to
    // English, and a stale extra one would announce a language the app cannot render.
    expect(compared.sort()).toEqual([...LOCALES].sort());
  });

  it("sets documentElement.lang and swallows a storage throw", () => {
    // Private mode / blocked storage must not take the whole document down before
    // paint, which is why the body is wrapped in try/catch.
    expect(script).toContain("document.documentElement.lang");
    expect(script).toMatch(/^try\{/);
    expect(script).toMatch(/catch\(\w+\)\{\}$/);
  });

  it("actually applies each stored locale when run", () => {
    for (const locale of LOCALES) {
      document.documentElement.lang = "";
      localStorage.setItem(LOCALE_STORAGE_KEY, locale);
      new Function(script)();
      expect(document.documentElement.lang).toBe(locale);
    }
  });

  it("leaves lang alone for an unknown or absent stored value", () => {
    for (const stored of ["fr", "", "en-US", "null"]) {
      document.documentElement.lang = "en";
      localStorage.setItem(LOCALE_STORAGE_KEY, stored);
      new Function(script)();
      expect(document.documentElement.lang).toBe("en");
    }
    document.documentElement.lang = "en";
    localStorage.removeItem(LOCALE_STORAGE_KEY);
    new Function(script)();
    expect(document.documentElement.lang).toBe("en");
  });
});
