import { buildFingerprint, buildFuzzyFingerprint } from './fingerprint.js';
import { logger } from '../utils/logger.js';
import type { JobCard, JobRecord } from './types.js';

/**
 * Dedupe a batch of JobCards within the current run.
 * Uses externalId as the key — fastest and most reliable.
 */
export function dedupeCards(cards: JobCard[]): JobCard[] {
  const seen = new Set<string>();
  const result: JobCard[] = [];

  for (const card of cards) {
    if (seen.has(card.externalId)) {
      logger.debug(`Duplicate card dropped: ${card.externalId} (${card.title})`);
      continue;
    }
    seen.add(card.externalId);
    result.push(card);
  }

  return result;
}

/**
 * Dedupe a batch of hydrated JobRecords within the current run.
 * Uses fingerprint (exact) first, then fuzzy fingerprint to catch republished jobs.
 */
export function dedupeJobs(jobs: JobRecord[]): JobRecord[] {
  const exactSeen = new Set<string>();
  const fuzzySeen = new Set<string>();
  const result: JobRecord[] = [];

  for (const job of jobs) {
    if (exactSeen.has(job.fingerprint)) {
      logger.debug(`Exact duplicate job dropped: ${job.fingerprint} (${job.title} @ ${job.company})`);
      continue;
    }

    const fuzzy = buildFuzzyFingerprint({
      source: job.source,
      company: job.company,
      title: job.title,
    });

    if (fuzzySeen.has(fuzzy)) {
      logger.debug(`Fuzzy duplicate (republished?) dropped: ${job.title} @ ${job.company}`);
      // Mark as republished but still drop — we already have the other copy.
      continue;
    }

    exactSeen.add(job.fingerprint);
    fuzzySeen.add(fuzzy);
    result.push(job);
  }

  return result;
}

/**
 * Compare current-run jobs against the full historical jobs.jsonl records.
 * Returns only jobs that have never been seen before.
 *
 * Uses exact fingerprint match first, then fuzzy match to suppress republishes.
 * Updates lastSeen on existing records (handled in appendJobs, not here).
 */
export function dedupeAgainstHistory(
  fresh: JobRecord[],
  history: JobRecord[]
): JobRecord[] {
  const historicExact = new Set(history.map((j) => j.fingerprint));
  const historicFuzzy = new Set(
    history.map((j) =>
      buildFuzzyFingerprint({ source: j.source, company: j.company, title: j.title })
    )
  );

  return fresh.filter((job) => {
    if (historicExact.has(job.fingerprint)) {
      logger.debug(`Already in history (exact): ${job.title} @ ${job.company}`);
      return false;
    }

    const fuzzy = buildFuzzyFingerprint({
      source: job.source,
      company: job.company,
      title: job.title,
    });

    if (historicFuzzy.has(fuzzy)) {
      logger.debug(`Already in history (fuzzy/republished): ${job.title} @ ${job.company}`);
      return false;
    }

    return true;
  });
}