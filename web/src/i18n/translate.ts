import type {
  DictNode,
  Locale,
  PluralForms,
  TranslateValues,
  TranslationDict,
} from "./types";
import { DEFAULT_LOCALE } from "./types";
import { pluralCategory } from "./pluralize";
import { en } from "./locales/en";
import { es } from "./locales/es";

const DICTS: Record<Locale, TranslationDict> = { en, es };

function isPluralForms(node: DictNode): node is PluralForms {
  return (
    typeof node === "object" &&
    node !== null &&
    "one" in node &&
    "other" in node &&
    typeof (node as PluralForms).one === "string" &&
    typeof (node as PluralForms).other === "string"
  );
}

/** Walk a dotted key path; returns undefined if any segment is missing. */
export function lookup(dict: TranslationDict, key: string): DictNode | undefined {
  const parts = key.split(".");
  let cur: DictNode | undefined = dict;
  for (const p of parts) {
    if (cur === undefined || typeof cur === "string" || isPluralForms(cur)) {
      return undefined;
    }
    cur = cur[p];
  }
  return cur;
}

function interpolate(template: string, values?: TranslateValues): string {
  if (!values) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
    const v = values[name];
    return v === undefined || v === null ? `{{${name}}}` : String(v);
  });
}

function resolveLeaf(
  node: DictNode | undefined,
  count: number | undefined,
  locale: Locale,
): string | undefined {
  if (node === undefined) return undefined;
  if (typeof node === "string") return node;
  if (isPluralForms(node)) {
    const cat = pluralCategory(locale, count ?? 0);
    return node[cat];
  }
  return undefined;
}

/**
 * Pure translation lookup.
 *
 * Fallback chain: locale dict → English dict → key itself (dev warn).
 * Never throws; never returns undefined.
 */
export function translate(
  locale: Locale,
  key: string,
  values?: TranslateValues,
  count?: number,
): string {
  const primary = DICTS[locale] ?? DICTS[DEFAULT_LOCALE];
  let leaf = resolveLeaf(lookup(primary, key), count, locale);

  if (leaf === undefined && locale !== DEFAULT_LOCALE) {
    leaf = resolveLeaf(lookup(DICTS[DEFAULT_LOCALE], key), count, DEFAULT_LOCALE);
  }

  if (leaf === undefined) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn(`[i18n] missing key: ${key}`);
    }
    return key;
  }

  // Always inject count into values when provided so {{count}} works.
  const merged =
    count !== undefined ? { count, ...values } : values;
  return interpolate(leaf, merged);
}

/** Flatten every leaf key path for completeness tests. */
export function flattenKeys(
  dict: TranslationDict,
  prefix = "",
): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(dict)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string" || isPluralForms(v)) {
      out.push(path);
    } else {
      out.push(...flattenKeys(v as TranslationDict, path));
    }
  }
  return out;
}

export function getDict(locale: Locale): TranslationDict {
  return DICTS[locale] ?? DICTS[DEFAULT_LOCALE];
}
