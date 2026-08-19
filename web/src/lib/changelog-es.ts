/**
 * Spanish twins for the changelog, keyed by ChangeEntry.id (see changelog.ts).
 *
 * Every id in CHANGELOG must appear here, and nothing else may — asserted in
 * BOTH directions by __tests__/lib/changelog.test.ts. The repo's other en/es
 * guard (__tests__/lib/i18n.test.ts) checks en ⊆ es only, which would let an
 * orphan for a renamed id sit here forever with CI green.
 *
 * A missing key does NOT fall back through the dictionary — this is a plain
 * Record, not a TranslationDict. The page falls back to the English entry
 * explicitly; the parity test is what keeps that path unused.
 */

export interface ChangeEntryEs {
  title: string;
  body: string;
}

export const CHANGELOG_ES: Record<string, ChangeEntryEs> = {
  "2026-08-19-grover-amplification": {
    title: "La búsqueda de Grover ahora amplifica correctamente con cuatro cúbits o más",
    body: "Los pasos de oráculo y difusión no hacían nada en circuitos de más de tres cúbits, así que el algoritmo devolvía una distribución uniforme en lugar de encontrar el elemento marcado. Ambos construyen ahora la operación correcta en cualquier tamaño, y la lección de Algoritmos demuestra una amplificación real.",
  },
};
