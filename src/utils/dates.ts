// anti-bot detection
export function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function nowIso(): string {
  return new Date().toISOString();
}

// Parse a LinkedIn "2 hours ago", "3 days ago" into approximate date
export function parsePostedAge(raw: string): Date | null {
  const s = raw.toLowerCase().trim();
  const now = Date.now();

  const match = s.match(/^(\d+)\s+(second|minute|hour|day|week|month)s?\s+ago$/);
  if (!match) {
    return null;
  }

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
  if (!ms) {
    return null;
  }

  return new Date(now - value * ms);
}