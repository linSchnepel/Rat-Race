/**
 * Sleep for a random duration between minMs and maxMs.
 * Used to add human-like delays between page navigations.
 */
export function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Format a Unix timestamp (ms) as a human-readable local string.
 */
export function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Return an ISO 8601 string for the current moment.
 */
export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Parse a LinkedIn "posted age" string like "2 hours ago", "3 days ago"
 * into an approximate Date. Returns null if unparseable.
 */
export function parsePostedAge(raw: string): Date | null {
  const s = raw.toLowerCase().trim();
  const now = Date.now();

  const match = s.match(/^(\d+)\s+(second|minute|hour|day|week|month)s?\s+ago$/);
  if (!match) return null;

  const value = parseInt(match[1]!, 10);
  const unit = match[2]!;

  const unitMs: Record<string, number> = {
    second: 1_000,
    minute: 60_000,
    hour: 3_600_000,
    day: 86_400_000,
    week: 7 * 86_400_000,
    month: 30 * 86_400_000,
  };

  const ms = unitMs[unit];
  if (!ms) return null;

  return new Date(now - value * ms);
}