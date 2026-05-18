import { loadBlacklist } from '../storage/blacklistFile.js';
import { normalizeCompany, normalizeTitle, normalizeText } from './normalize.js';
import { isRecruiterLike } from './recruiter.js';
import { logger } from '../utils/logger.js';
import type { JobCard } from './types.js';

/**
 * Filter a batch of JobCards, removing obvious junk before hydration.
 * Runs: blacklist → recruiter → title blocklist → location check.
 *
 * This is intentionally cheap — we're operating on card data only,
 * before we spend a page navigation on each survivor.
 */
export async function filterCards(cards: JobCard[]): Promise<JobCard[]> {
  const blacklist = await loadBlacklist();

  const blockedTitles: string[] = (process.env['BLOCKED_TITLES'] ?? '')
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

  const requireRemote = process.env['REQUIRE_REMOTE'] === 'true';

  const survivors: JobCard[] = [];

  for (const card of cards) {
    const reason = getFilterReason(card, blacklist, blockedTitles, requireRemote);
    if (reason) {
      logger.debug(`Filtered "${card.title}" @ "${card.company}": ${reason}`);
      continue;
    }
    survivors.push(card);
  }

  return survivors;
}

function getFilterReason(
  card: JobCard,
  blacklist: { companies: string[]; patterns: string[] },
  blockedTitles: string[],
  requireRemote: boolean
): string | null {
  const companyNorm = normalizeCompany(card.company);
  const titleNorm = normalizeTitle(card.title);
  const locationNorm = card.location.toLowerCase();

  // 1. Exact company blacklist
  if (blacklist.companies.some((b) => normalizeCompany(b) === companyNorm)) {
    return 'blacklisted company';
  }

  // 2. Pattern-based company blacklist (regex strings from blacklist.json)
  if (blacklist.patterns.some((p) => new RegExp(p, 'i').test(card.company))) {
    return 'blacklisted pattern';
  }

  // 3. Recruiter / staffing agency detection
  if (isRecruiterLike(card.company, card.title)) {
    return 'recruiter-like';
  }

  // 4. Blocked title keywords
  if (blockedTitles.some((t) => titleNorm.includes(t))) {
    return 'blocked title keyword';
  }

  // 5. Remote requirement
  if (requireRemote && !locationNorm.includes('remote')) {
    return 'not remote';
  }

  return null;
}

/**
 * Secondary filter run on hydrated JobRecords (post-hydration).
 * Used for checks that require the full description.
 */
export function filterJob(
  job: import('./types.js').JobRecord,
  requiredTerms: string[]
): boolean {
  if (requiredTerms.length === 0) return true;

  const haystack = normalizeText(
    [job.title, job.descriptionText ?? '', job.company].join(' ')
  );

  return requiredTerms.every((term) => haystack.includes(normalizeText(term)));
}