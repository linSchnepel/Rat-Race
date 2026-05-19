import { initBrowser, closeBrowser } from '../browser.js';
import { ensureLinkedInSession } from '../auth/linkedin.js';
import { fetchAndHydrateAllCards } from '../sources/linkedin.js';
import { filterCards } from '../core/filters.js';
import { dedupeCards, dedupeJobs, dedupeAgainstHistory } from '../core/dedupe.js';
import { readJobs, appendJobs } from '../storage/jobsFile.js';
import { render } from '../cli/render.js';
import { logger } from '../utils/logger.js';
import type { JobCard } from '../core/types.js';

const POLL_INTERVAL_MS = parseInt(process.env['POLL_INTERVAL_MS'] ?? '600000', 10);
const SEARCH_URL = process.env['LINKEDIN_SEARCH_URL'] ?? '';

export async function runLinkedInWorkflow(): Promise<void> {
  if (!SEARCH_URL) {
    throw new Error('LINKEDIN_SEARCH_URL is not set in your environment.');
  }

  logger.info('Starting LinkedIn job scout…');

  await initBrowser({
    headless: process.env['HEADLESS'] !== 'false',
    timezone: process.env['TZ'] ?? 'America/Chicago',
  });

  try {
    await ensureLinkedInSession();

    try {
      await runOnce();
    } catch (err) {
      logger.error('Initial poll cycle failed — will retry on next interval', err);
    }

    logger.info(`Polling every ${POLL_INTERVAL_MS / 1000}s. Press Ctrl+C to stop.`);
    const timer = setInterval(async () => {
      try {
        await runOnce();
      } catch (err) {
        logger.error('Poll cycle failed', err);
      }
    }, POLL_INTERVAL_MS);

    await new Promise<void>((resolve) => {
      process.once('SIGINT', () => { clearInterval(timer); resolve(); });
      process.once('SIGTERM', () => { clearInterval(timer); resolve(); });
    });
  } finally {
    await closeBrowser();
    logger.info('Browser closed. Goodbye.');
  }
}

async function runOnce(): Promise<void> {
  logger.info('--- Starting new poll cycle ---');
  const cycleStart = Date.now();

  // Fetch all pages and hydrate via the right panel — single browser session.
  // Returns fully hydrated JobRecords; no separate hydration loop needed.
  const allJobs = await fetchAndHydrateAllCards(SEARCH_URL);
  logger.info(`Fetched and hydrated ${allJobs.length} jobs across all pages.`);

  if (allJobs.length === 0) {
    logger.info('No jobs found this cycle.');
    return;
  }

  // Card-level filtering — operate on JobRecords directly since we skipped
  // the two-stage card/hydrate split. Cast to JobCard shape for the filter.
  const cardStubs: JobCard[] = allJobs.map((j) => ({
    source: j.source,
    url: j.url,
    externalId: j.externalId,
    title: j.title,
    company: j.company,
    location: j.locationRaw,
    teaser: j.teaser,
    easyApply: j.easyApply,
    boosted: j.isBoosted,
    fetchedAt: j.firstSeen,
  }));

  const filteredStubs = await filterCards(cardStubs);
  const filteredIds = new Set(filteredStubs.map((c) => c.externalId));
  const filteredJobs = allJobs.filter((j) => filteredIds.has(j.externalId));
  logger.info(`${filteredJobs.length} jobs survived filtering.`);

  // Dedupe within this run.
  const dedupedJobs = dedupeJobs(filteredJobs);
  logger.info(`${dedupedJobs.length} jobs after in-run deduplication.`);

  // Compare against historical jobs.jsonl.
  const history = await readJobs();
  const freshJobs = dedupeAgainstHistory(dedupedJobs, history);
  logger.info(`${freshJobs.length} new jobs not seen before.`);

  if (freshJobs.length === 0) {
    logger.info('No new jobs this cycle.');
    return;
  }

  render(freshJobs);
  await appendJobs(freshJobs);
  logger.info(`Appended ${freshJobs.length} jobs to jobs.jsonl.`);

  const elapsed = ((Date.now() - cycleStart) / 1000).toFixed(1);
  logger.info(`Cycle complete in ${elapsed}s.`);
}