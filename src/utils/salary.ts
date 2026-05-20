export interface SalaryRange {
  min: number;
  max: number | null;
  currency: string;
  period: 'year' | 'hour' | 'month' | 'unknown';
  raw: string;
}

/**
 * Parse a salary string into a structured range.
 * Returns null if no salary can be extracted.
 */
export function parseSalary(raw: string): SalaryRange | null {
  if (!raw) return null;

  const text = raw.trim();
  const currency = /USD|CAD|GBP|EUR/i.exec(text)?.[0]?.toUpperCase() ?? 'USD';
  const period = detectPeriod(text);

  // Extract all numeric values — handles $180K, $114,100.00, 127000
  const numbers = extractNumbers(text);
  if (numbers.length === 0) return null;

  // Detect range separator: -, –, to, and
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
  const fmt = (n: number) =>
    n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : `$${n}`;

  const range = s.max ? `${fmt(s.min)} – ${fmt(s.max)}` : fmt(s.min);
  const period = s.period === 'hour' ? '/hr' : s.period === 'month' ? '/mo' : s.period === 'year' ? '/yr' : '';

  return `${range}${period}`;
}

function extractNumbers(text: string): number[] {
  // Match patterns like: $114,100.00 | $180K | 127000 | 193,975
  const pattern = /\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)\s*([Kk])?/g;
  const results: number[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const digits = parseFloat(match[1]!.replace(/,/g, ''));
    const multiplier = match[2] ? 1000 : 1;
    const value = digits * multiplier;
    // Sanity check: ignore values that look like years (2024) or percents
    if (value >= 1000) results.push(value);
  }

  return results;
}

function detectPeriod(text: string): SalaryRange['period'] {
  if (/\/hr|per hour|an hour|hourly/i.test(text)) return 'hour';
  if (/\/mo|per month|monthly/i.test(text))        return 'month';
  if (/\/yr|per year|a year|annual|salary/i.test(text)) return 'year';
  return 'unknown';
}