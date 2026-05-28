import { loadBlacklist } from '../storage/blacklistFile.js';
import { normalizeCompany, normalizeTitle, normalizeText } from './normalize.js';
import { isRecruiterLike } from './recruiter.js';
import { logger } from '../utils/logger.js';
import type { JobCard } from './types.js';

export async function filterCards(cards: JobCard[]): Promise<JobCard[]> {
  const blacklist = await loadBlacklist();

  const blockedTitles: string[] = (process.env['BLOCKED_TITLES'] ?? '')
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

  const requireRemote = process.env['REQUIRE_REMOTE'] === 'true';

  const survivors: JobCard[] = [];

  logger.debug(`Received ${cards.length} cards from LinkedIn. Running filters…`);
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

function getFilterReason(card: JobCard, blacklist: { companies: string[]; patterns: string[] }, blockedTitles: string[], requireRemote: boolean): string | null {
  const companyNorm = normalizeCompany(card.company);
  const titleNorm = normalizeTitle(card.title);
  const locationNorm = card.location.toLowerCase();

  if (blacklist.companies.some((b) => normalizeCompany(b) === companyNorm)) {
    return 'blacklisted company';
  }

  if (blacklist.patterns.some((p) => new RegExp(p, 'i').test(card.company))) {
    return 'blacklisted pattern';
  }

  if (isRecruiterLike(card.company, card.title)) {
    return 'recruiter-like';
  }

  if (blockedTitles.some((t) => titleNorm.includes(t))) {
    return 'blocked title keyword';
  }

  if (requireRemote && !locationNorm.includes('remote')) {
    return 'not remote';
  }

  return null;
}

export function filterJob(job: import('./types.js').JobRecord, requiredTerms: string[]): boolean {
  if (requiredTerms.length === 0) {
    return true;
  }

  const haystack = normalizeText(
    [job.title, job.descriptionText ?? '', job.company].join(' ')
  );

  return requiredTerms.every((term) => haystack.includes(normalizeText(term)));
}