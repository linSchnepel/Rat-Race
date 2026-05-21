import { initBrowser, closeBrowser } from '../browser.js';
import { ensureIndeedSession } from '../auth/indeed.js';
import { fetchAndHydrateAllCards } from '../sources/indeed.js';
import { filterCards } from '../core/filters.js';
import { dedupeCards, dedupeJobs, dedupeAgainstHistory } from '../core/dedupe.js';
import { readJobs, appendJobs } from '../storage/jobsFile.js';
import { render } from '../cli/render.js';
import { logger } from '../utils/logger.js';
import type { JobCard } from '../core/types.js';

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function runIndeedWorkflow(url: string): Promise<void> {
  if (!url) {
    throw new Error('INDEED_SEARCH_URL is not set in your environment.');
  }

  logger.info('Starting Indeed job scout…');

  // include source string here

  await initBrowser({
    headless: process.env['HEADLESS'] !== 'false',
    timezone: process.env['TZ'] ?? 'America/Chicago',
    source: 'indeed'});

  try {
    await ensureIndeedSession();

    try {
      await runOnce(url);
    } catch (err) {
      logger.error('Initial poll cycle failed — will retry on next interval', err);
    }

  } finally {
    await closeBrowser();
    logger.info('Browser closed. Goodbye.');
  }
}

async function runOnce(url: string): Promise<void> {
  logger.info('--- Starting new poll cycle ---');
  const cycleStart = Date.now();

  // Fetch all pages and hydrate via the right panel — single browser session.
  // Returns fully hydrated JobRecords; no separate hydration loop needed.
  const allJobs = await fetchAndHydrateAllCards(url);
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