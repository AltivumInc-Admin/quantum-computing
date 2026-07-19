// Shared core for turning inline Markdown into the plain text it renders to.
// Two surfaces consume it with caller-specific extras: extract-headings.ts
// (TOC labels + slug source; adds an ATX-closer trim and a wholesale sweep of
// leftover unpaired markers) and content.ts (card teasers / meta descriptions;
// adds underscore emphasis). Keeping the link-unwrap + paired-marker core here
// means a markdown-edge fix (nested emphasis, reference links, ...) lands once
// instead of silently missing one of the two near-duplicate strippers.

/**
 * Unwrap [text](url) / ![alt](url) links to their label ([^\]]* so an
 * empty-label link vanishes instead of surviving literally) and unwrap paired
 * `code`, **bold**, and *italic* markers. Order matters: links first (their
 * labels may carry markers), then code, then bold before italic.
 */
export function stripLinksAndEmphasis(text: string): string {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1") // [label](url) / ![alt](url) -> label
    .replace(/`([^`]+)`/g, "$1") // `code` -> code
    .replace(/\*\*([^*]+)\*\*/g, "$1") // **bold** -> bold
    .replace(/\*([^*]+)\*/g, "$1"); // *italic* -> italic
}
