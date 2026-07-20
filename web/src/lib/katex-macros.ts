// Shared bra-ket macros so authors write \ket{0} instead of \left|0\right\rangle.
// KaTeX renders these to HTML+CSS at build time (static-export safe). Used by the
// lesson MarkdownRenderer and the glossary InlineMarkdown so notation stays uniform.
export const KATEX_MACROS = {
  "\\ket": "\\left|#1\\right\\rangle",
  "\\bra": "\\left\\langle#1\\right|",
  "\\braket": "\\left\\langle#1\\middle|#2\\right\\rangle",
  "\\expval": "\\left\\langle#1\\right\\rangle",
};

/**
 * The whole rehype-katex option object, single-sourced across BOTH math
 * surfaces — the lesson MarkdownRenderer and the glossary InlineMarkdown —
 * so the two can never drift the way retyped option literals do.
 *
 * BUILD SAFETY: a malformed expression can never abort the static export.
 * rehype-katex 7 hard-sets `throwOnError: true` on its own render call (it
 * spreads these settings FIRST and then overrides), catches the ParseError
 * itself, and retries with `strict: 'ignore'`, emitting a red `.katex-error`
 * span. Passing `throwOnError: false` here does nothing — both call sites used
 * to, each with a comment crediting it for behaviour the plugin's internal
 * catch actually provides. Because the failure is silent by construction, CI's
 * build-smoke job greps the export for `katex-error` so a broken expression
 * cannot ship (one did, on /learn/02-hardware).
 */
export const KATEX_OPTIONS = { macros: KATEX_MACROS };
