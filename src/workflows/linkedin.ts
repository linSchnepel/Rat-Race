import { initBrowser, closeBrowser } from '../browser.js';
import { ensureLinkedInSession } from '../auth/linkedin.js';
import { fetchListingCards, hydrateCard } from '../sources/linkedin.js';
import { filterCards } from '../core/filters.js';
import { dedupeCards, dedupeJobs, dedupeAgainstHistory } from '../core/dedupe.js';
import { readJobs, appendJobs } from '../storage/jobsFile.js';
import { render } from '../cli/render.js';
import { logger } from '../utils/logger.js';
import { randomDelay } from '../utils/dates.js';
import type { JobRecord } from '../core/types.js';

const POLL_INTERVAL_MS = parseInt(process.env['POLL_INTERVAL_MS'] ?? '600000', 10);
const SEARCH_URL = process.env['LINKEDIN_SEARCH_URL'] ?? '';

export async function runLinkedInWorkflow(): Promise<void> {
  if (!SEARCH_URL) {
    throw new Error('LINKEDIN_SEARCH_URL is not set in your environment.');
  }

  logger.info('Starting LinkedIn job scout…');

  // Initialize Patchright browser with the persistent Chrome profile.
  // Authentication comes from the profile's existing session — no cookie needed.
  await initBrowser({
    headless: process.env['HEADLESS'] !== 'false',
    timezone: process.env['TZ'] ?? 'America/Chicago',
  });

  try {
    // One-time session verification (cached by TTL in auth/linkedin.ts).
    await ensureLinkedInSession();

    // Run once immediately, then on the poll interval.
    // Catch here so a bad first run doesn't kill the process — it will retry
    // on the next poll cycle just like any other failure.
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

    // Keep process alive; clean up on SIGINT/SIGTERM.
    await new Promise<void>((resolve) => {
      process.once('SIGINT', () => {
        clearInterval(timer);
        resolve();
      });
      process.once('SIGTERM', () => {
        clearInterval(timer);
        resolve();
      });
    });
  } finally {
    await closeBrowser();
    logger.info('Browser closed. Goodbye.');
  }
}

async function runOnce(): Promise<void> {
  logger.info('--- Starting new poll cycle ---');
  const cycleStart = Date.now();

  // Step 1: Fetch listing page and parse cards.
  logger.info('Fetching listing page…');
  const cards = await fetchListingCards(SEARCH_URL);
  logger.info(`Found ${cards.length} cards on listing page.`);

  // Step 2: Early card-level filtering (blacklist, title, location).
  const filteredCards = await filterCards(cards);
  logger.info(`${filteredCards.length} cards survived filtering.`);

  // Step 3: Dedupe within this batch.
  const dedupedCards = dedupeCards(filteredCards);
  logger.info(`${dedupedCards.length} cards after in-run deduplication.`);

  if (dedupedCards.length === 0) {
    logger.info('No new cards to hydrate. Cycle complete.');
    return;
  }

  // Step 4: Hydrate each surviving card by visiting its detail page.
  logger.info(`Hydrating ${dedupedCards.length} jobs…`);
  const hydrated: JobRecord[] = [];

  for (const card of dedupedCards) {
    try {
      const job = await hydrateCard(card);
      if (job) hydrated.push(job);
    } catch (err) {
      logger.warn(`Failed to hydrate ${card.url}: ${err instanceof Error ? err.message : String(err)}`);
    }
    // Human-like delay between detail page visits.
    await randomDelay(3_000, 8_000);
  }

  logger.info(`Successfully hydrated ${hydrated.length} jobs.`);

  // Step 5: Dedupe hydrated jobs within this batch.
  const dedupedJobs = dedupeJobs(hydrated);

  // Step 6: Compare against historical jobs.jsonl.
  const history = await readJobs();
  const freshJobs = dedupeAgainstHistory(dedupedJobs, history);
  logger.info(`${freshJobs.length} new jobs not seen before.`);

  if (freshJobs.length === 0) {
    logger.info('No new jobs this cycle.');
    return;
  }

  // Step 7: Render to CLI.
  render(freshJobs);

  // Step 8: Persist to jobs.jsonl.
  await appendJobs(freshJobs);
  logger.info(`Appended ${freshJobs.length} jobs to jobs.jsonl.`);

  const elapsed = ((Date.now() - cycleStart) / 1000).toFixed(1);
  logger.info(`Cycle complete in ${elapsed}s.`);
}