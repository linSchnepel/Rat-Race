export function normalizeCompany(raw: string): string {
  if (!raw) {
    return '';
  }

  return raw
    .toLowerCase()
    .replace(/\b(inc\.?|llc\.?|ltd\.?|corp\.?|co\.?|group|holdings|international|global)\b/g, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeTitle(raw: string): string {
  if (!raw) {
    return '';
  }

  return raw
    .toLowerCase()
    .replace(/\b(sr\.?|jr\.?|senior|junior|lead|principal|staff|associate|mid[-\s]?level)\b/g, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeLocation(raw: string): string {
  if (!raw) {
    return '';
  }

  return raw
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Linkedin specific
export function normalizeUrl(raw: string): string {
  if (!raw) {
    return '';
  }

  try {
    const url = new URL(raw.startsWith('http') ? raw : `https://www.linkedin.com${raw}`);
    // Keep only the path up through the job ID.
    const match = url.pathname.match(/\/jobs\/view\/\d+/);
    if (match) {
      return `https://www.linkedin.com${match[0]}/`;
    }

    return `${url.origin}${url.pathname}`;
  } catch {
    return raw;
  }
}

export function normalizeText(raw: string): string {
  if (!raw) {
    return '';
  }

  return raw
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}