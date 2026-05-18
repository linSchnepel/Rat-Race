/**
 * Truncate a string to maxLength, appending "…" if cut.
 */
export function truncate(s: string, maxLength: number): string {
  if (s.length <= maxLength) return s;
  return s.slice(0, maxLength - 1) + '…';
}

/**
 * Strip HTML tags from a string and collapse whitespace.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Return true if a string looks like a URL.
 */
export function isUrl(s: string): boolean {
  try {
    new URL(s);
    return true;
  } catch {
    return false;
  }
}