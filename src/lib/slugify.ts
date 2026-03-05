/**
 * Deterministic slug generation for org names.
 * Lowercase, transliterate common chars, replace non-alphanumeric with hyphens,
 * collapse and trim hyphens.
 */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/&/g, "and")
    .replace(/\+/g, "plus")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // non-alphanumeric → hyphen
    .replace(/^-+|-+$/g, ""); // trim leading/trailing hyphens
}
