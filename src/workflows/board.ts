// Workflows for job board sites like linkedin

import { initBrowser, closeBrowser } from '../browser.js';
import { ensureLinkedInSession, ensureIndeedSession, ensureZiprecruiterSession } from '../auth/verify.js';

import { fetchAndHydrateAllCards as hydrateLinkedin } from '../sources/linkedin.js';
import { fetchAndHydrateAllCards as hydrateIndeed } from '../sources/indeed.js';
import { fetchAndHydrateAllCards as hydrateZiprecruiter } from '../sources/ziprecruiter.js';

import { filterCards } from '../core/filters.js';
import { dedupeCards, dedupeJobs, dedupeAgainstHistory } from '../core/dedupe.js';
import { readJobs, appendJobs } from '../storage/jobsFile.js';
import { render } from '../cli/render.js';
import { appendJobs as appendHtml } from '../cli/renderHtml.ts'
import { logger } from '../utils/logger.js';
import type { JobCard } from '../core/types.js';
import { delay } from '../utils/dates.ts';
import { loadConfig } from '../utils/config.ts';

const config = loadConfig();

export async function runLinkedInWorkflow(urls: [string, string]): Promise<void> {
  if (!urls || (urls.length != 2)  ) { // TODO: make this array dynamic
    throw new Error('LINKEDIN_SEARCH_URL is not set in the environment.');
  }

  logger.info('Starting LinkedIn job scout…');

  await initBrowser({
    headless: config.HEADLESS !== false,
    timezone: config.TZ ?? 'America/Chicago',
    source: 'linkedin'
  });

  try {
    await ensureLinkedInSession();

    try {
      await runOnce(urls[0], 'linkedin');
      await delay(1000);
      await runOnce(urls[1], 'linkedin');
    } catch (err) {
      logger.error('LinkedIn poll cycle failed.', err);
    }
  } finally {
    await closeBrowser();
    logger.info('Browser closed. Goodbye.');
  }
}

export async function runIndeedWorkflow(url: string): Promise<void> {
  if (!url) {
    throw new Error('INDEED_SEARCH_URL is not set in the environment.');
  }

  logger.info('Starting Indeed job scout…');

  await initBrowser({
    headless: false,
    timezone: process.env['TZ'] ?? 'America/Chicago',
    source: 'indeed'});

  try {
    await ensureIndeedSession();

    try {
      await runOnce(url, 'indeed');
    } catch (err) {
      logger.error('Indeed poll cycle failed.', err);
    }
  } finally {
    await closeBrowser();
    logger.info('Browser closed. Goodbye.');
  }
}

export async function runZiprecruiterWorkflow(url: string): Promise<void> {
  if (!url) {
    throw new Error('ZIPRECRUITER_SEARCH_URL is not set in your environment.');
  }

  logger.info('Starting Ziprecruiter job scout…');

  await initBrowser({
    headless: config.HEADLESS !== false,
    timezone: config.TZ ?? 'America/Chicago',
    source: 'ziprecruiter'});

  try {
    await ensureZiprecruiterSession();

    try {
      await runOnce(url, 'ziprecruiter');
    } catch (err) {
      logger.error('Ziprecruiter poll cycle failed.', err);
    }
  } finally {
    await closeBrowser();
    logger.info('Browser closed. Goodbye.');
  }
}

async function runOnce(url: string, type: string): Promise<void> {
  logger.info('--- Starting new poll cycle ---');
  const cycleStart = Date.now();

  // Fetch all pages and hydrate, no separate loop
  const allJobs = type === 'linkedin' ? await hydrateLinkedin(url) : type === 'indeed' ? await hydrateIndeed(url) : await hydrateZiprecruiter(url);
  logger.info(`Fetched and hydrated ${allJobs.length} jobs across all pages.`);

  if (allJobs.length === 0) {
    logger.info('No jobs found this cycle.');
    return;
  }

  // Card-level filtering
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

  const dedupedJobs = dedupeJobs(filteredJobs);
  logger.info(`${dedupedJobs.length} jobs after in-run deduplication.`);

  const history = await readJobs();
  const freshJobs = dedupeAgainstHistory(dedupedJobs, history);
  logger.info(`${freshJobs.length} new jobs not seen before.`);

  if (freshJobs.length === 0) {
    logger.info('No new jobs this cycle.');
    return;
  }

  if (process.env.RAT_RACE_ROOT) {
    appendHtml(freshJobs);
  } else {
    render(freshJobs);
  }
  
  await appendJobs(freshJobs);
  logger.info(`Appended ${freshJobs.length} jobs to jobs.jsonl.`);

  const elapsed = ((Date.now() - cycleStart) / 1000).toFixed(1);
  logger.info(`Cycle complete in ${elapsed}s.`);
}