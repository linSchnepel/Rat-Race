export interface SalaryRange {
  min: number;
  max: number | null;
  currency: string;
  period: 'year' | 'hour' | 'month' | 'unknown';
  raw: string;
}

export function parseSalary(raw: string): SalaryRange | null {
  if (!raw) {
    return null;
  }

  const text = raw.trim();
  const currency = /USD|CAD|GBP|EUR/i.exec(text)?.[0]?.toUpperCase() ?? 'USD';
  const period = detectPeriod(text);

  // Handles $180K, $114,100.00, 127000
  const numbers = extractNumbers(text);

  if (numbers.length === 0) {
    return null;
  }

  // -, –, to, and
  const hasRange = /[\-–]|(\bto\b)|(\band\b)/i.test(text);

  return {
    min: numbers[0]!,
    max: hasRange && numbers.length > 1 ? numbers[1]! : null,
    currency,
    period,
    raw: text,
  };
}

export function formatSalary(s: SalaryRange): string {
  const fmt = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : `$${n}`;

  const range = s.max ? `${fmt(s.min)} – ${fmt(s.max)}` : fmt(s.min);
  const period = s.period === 'hour' ? '/hr' : s.period === 'month' ? '/mo' : s.period === 'year' ? '/yr' : '';

  return `${range}${period}`;
}

function extractNumbers(text: string): number[] {
  if (!text) {
    return [];
  }
    // Tries to thoroughly clean non-salary numbers
    const cleaned = text.replace(/\b401?/gi, '')
      .replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, '')
      .replace(/\b\d{4}-\d{2}-\d{2}\b/g, '')
      .replace(/\b\d+\s+months?\b/gi, '')
      .replace(/\b\d+\s+roles?\b/gi, '')
      .replace(/\b\d+\s+years?\s+(?!of\s+exp|exp)/gi, '')
      .replace(/\bmaximum\s+of\s+\d+\b/gi, '')
      .replace(/\bup\s+to\s+\d+\b/gi, '');

    // Aggressively looks for only $, comma formatting, or k
    const pattern = /\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)\s*([Kk])?|(\d{1,3}(?:,\d{3})+(?:\.\d+)?)\s*([Kk])?|(\d+(?:\.\d+)?)\s*([Kk])\b/g;
    const results: number[] = [];
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(cleaned)) !== null) {
      const raw = match[1] ? match[1] : '';
      const digits = Number.parseFloat(raw.replace(/,/g, ""));
      if (Number.isNaN(digits)) continue;

      const multiplier = match[2] ? 1000 : 1;
      const value = digits * multiplier;

      if (Number.isFinite(value) && value >= 10) {
        results.push(value);
      }
    }

    return results;
}

// +- 30 character range
function extractSalaryPhrase(text: string): string | null {
  const pattern =
    /(?:\$[\d,. ]+(?:[Kk])?(?:\s*[-–]\s*\$?[\d,. ]+(?:[Kk])?)?)\s*(?:per\s+)?(?:an?\s+)?(hour|hr|year|yr|month|mo|annually|hourly)\b|(?:per\s+|an?\s+)(hour|hr|year|yr|month|mo)\b[^.]{0,40}\$[\d,.]+/gi;

  const match = pattern.exec(text);
  return match ? match[0] : null;
}

// Explicitly checks for common period indicators
function detectPeriod(text: string): SalaryRange['period'] {
  if (/\/\s*hr\b|per\s+hour|an?\s+hour|hourly|\$[\d,.]+\s*\/\s*h\b/i.test(text)) {
    return 'hour';
  } else if (/\/\s*yr\b|per\s+year|an?\s+year|annually|a\s+year/i.test(text)) {
    return 'year';
  } else if (/\/\s*mo\b|per\s+month|an?\s+month/i.test(text)) {
    return 'month';
  } else {
    return 'unknown';
  }
}