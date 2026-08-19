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
  "2026-08-19-example-scripts-correctness": {
    title:
      "Los ejemplos de Grover y VQE ya no dan respuestas silenciosamente incorrectas",
    body: "El ejemplo de búsqueda de Grover devolvía una distribución uniforme en lugar de encontrar el elemento marcado en circuitos de cuatro o más cúbits, y el ejemplo de VQE podía etiquetar mal los resultados de medición cuando un circuito omitía un cúbit. Ambos calculan ahora la respuesta correcta en cualquier tamaño — o se detienen con un error claro en vez de reportar un número equivocado.",
  },
  "2026-08-19-kernel-explorer-convention": {
    title:
      "El explorador de kernels ahora prepara los mismos estados que la biblioteca del curso",
    body: "El widget interactivo de kernels codificaba los datos con una convención de mapa de características distinta de la que enseña el curso, así que las mismas entradas producían estados cuánticos diferentes en el widget y en tu propio código. Ahora coinciden exactamente, y el deslizador de escala llega más lejos para que veas dónde empieza realmente la sobrecodificación.",
  },
  "2026-08-19-changelog-page": {
    title: "Un registro público de lo que cambia aquí",
    body: "Esta página enumera lo nuevo, lo que mejoró y lo que se corrigió, de lo más reciente a lo más antiguo, en inglés y en español. Está abierta a cualquiera: no hace falta una cuenta. El registro comienza con esta entrada; nada anterior aparece en la lista.",
  },
};
