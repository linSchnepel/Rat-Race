import { loadBlacklist } from '../storage/blacklistFile.js';
import { normalizeCompany, normalizeText } from './normalize.js';;
import { logger } from '../utils/logger.js';
import type { JobCard } from './types.js';

export async function filterCards(cards: JobCard[]): Promise<JobCard[]> {
  const blacklist = await loadBlacklist();

  const survivors: JobCard[] = [];

  logger.debug(`Received ${cards.length} cards from LinkedIn. Running filters…`);
  for (const card of cards) {
    const reason = getFilterReason(card, blacklist);

    if (reason) {
      logger.debug(`Filtered "${card.title}" @ "${card.company}": ${reason}`);
      continue;
    }

    survivors.push(card);
  }

  return survivors;
}

function getFilterReason(card: JobCard, blacklist: { companies: string[]; patterns: string[] }): string | null {
  const companyNorm = normalizeCompany(card.company);

  if (blacklist.companies.some((b) => normalizeCompany(b) === companyNorm)) {
    return 'blacklisted company';
  }

  if (blacklist.patterns.some((p) => new RegExp(p, 'i').test(card.company))) {
    return 'blacklisted pattern';
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