/**
 * Normalize a company name for stable comparison.
 * Strips legal suffixes, punctuation, and excess whitespace.
 */
export function normalizeCompany(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\b(inc\.?|llc\.?|ltd\.?|corp\.?|co\.?|group|holdings|international|global)\b/g, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalize a job title for comparison.
 * Removes level indicators and common noise words.
 */
export function normalizeTitle(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\b(sr\.?|jr\.?|senior|junior|lead|principal|staff|associate|mid[-\s]?level)\b/g, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalize a location string.
 * Collapses state abbreviations and strips parentheticals.
 */
export function normalizeLocation(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\(.*?\)/g, '')         // remove parenthetical (e.g. "(Remote)")
    .replace(/\s*,\s*/g, ', ')       // normalize comma spacing
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalize a LinkedIn job URL to its canonical /jobs/view/<id>/ form.
 * Strips tracking params and query strings.
 */
export function normalizeUrl(raw: string): string {
  if (!raw) return '';
  try {
    const url = new URL(raw.startsWith('http') ? raw : `https://www.linkedin.com${raw}`);
    // Keep only the path up through the job ID.
    const match = url.pathname.match(/\/jobs\/view\/\d+/);
    if (match) {
      return `https://www.linkedin.com${match[0]}/`;
    }
    // Fallback: return origin + pathname without query/hash.
    return `${url.origin}${url.pathname}`;
  } catch {
    return raw;
  }
}

/**
 * Normalize arbitrary text for loose matching:
 * lowercase, collapse whitespace, strip punctuation.
 */
export function normalizeText(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}