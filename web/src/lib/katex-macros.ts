// Shared bra-ket macros so authors write \ket{0} instead of \left|0\right\rangle.
// KaTeX renders these to HTML+CSS at build time (static-export safe). Used by the
// lesson MarkdownRenderer and the glossary InlineMarkdown so notation stays uniform.
export const KATEX_MACROS = {
  "\\ket": "\\left|#1\\right\\rangle",
  "\\bra": "\\left\\langle#1\\right|",
  "\\braket": "\\left\\langle#1\\middle|#2\\right\\rangle",
  "\\expval": "\\left\\langle#1\\right\\rangle",
};
