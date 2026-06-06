// A small, dependency-free slugger. Both the table-of-contents extractor and the
// markdown renderer slug heading text through here, so a TOC link's "#target"
// always matches the id the renderer stamps on the heading. Punctuation and
// inline markdown markers (*, `, _) are stripped, which keeps these slugs aligned
// with the plain text content a heading renders to.

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // drop punctuation/symbols (incl. * ` _-adjacent marks)
    .replace(/[\s_]+/g, "-") // whitespace/underscores → single hyphen
    .replace(/-+/g, "-") // collapse repeated hyphens
    .replace(/^-+|-+$/g, ""); // trim leading/trailing hyphens
}

/**
 * Stateful slug generator that disambiguates repeated headings the way GitHub
 * does: the first "Notes" becomes "notes", the next "notes-1", and so on.
 */
export class Slugger {
  private readonly seen = new Map<string, number>();

  slug(text: string): string {
    const base = slugify(text);
    const count = this.seen.get(base) ?? 0;
    this.seen.set(base, count + 1);
    return count === 0 ? base : `${base}-${count}`;
  }
}
