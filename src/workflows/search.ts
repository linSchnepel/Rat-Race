import { initBrowser, closeBrowser } from '../browser.js';
import { scrapeGoogleSearch } from '../sources/google.js';
import { readCompanies, appendCompanies } from '../storage/companyFile.js';
import { render } from '../cli/render.js';
import { logger } from '../utils/logger.js';
import type { CompanyRecord } from '../core/types.js';

export async function runGoogleWorkflow(searchUrls: string[]): Promise<void> {
  if (!searchUrls.length) {
    throw new Error('No search URLs provided to runGoogleWorkflow.');
  }

  logger.info('Starting Google search workflow…');

  await initBrowser({
    headless: process.env['HEADLESS'] !== 'false',
    timezone: process.env['TZ'] ?? 'America/Chicago',
    source: 'google',
  });

  try {
    try {
      await runOnce(searchUrls);
    } catch (err) {
      logger.error('Google workflow failed', err);
    }
  } finally {
    await closeBrowser();
    logger.info('Browser closed. Goodbye.');
  }
}

async function runOnce(searchUrls: string[]): Promise<void> {
  logger.info('--- Starting Google poll cycle ---');
  const cycleStart = Date.now();

  const found = await scrapeGoogleSearch(searchUrls);
  logger.info(`Google: found ${found.length} Ashby companies across all searches.`);

  if (found.length === 0) {
    logger.info('No companies found this cycle.');
    return;
  }

  // Dedupe against history
  const history = await readCompanies();
  const historicUrls = new Set(history.map((c) => c.jobBoardUrl));
  const fresh = found.filter((c) => !historicUrls.has(c.jobBoardUrl));
  logger.info(`${fresh.length} new companies not seen before.`);

  if (fresh.length === 0) {
    logger.info('No new companies this cycle.');
    return;
  }

  renderCompanies(fresh);
  await appendCompanies(fresh);
  logger.info(`Appended ${fresh.length} companies to company.jsonl.`);

  const elapsed = ((Date.now() - cycleStart) / 1000).toFixed(1);
  logger.info(`Google cycle complete in ${elapsed}s.`);
}

// TODO: Move this to logger.ts and add Chalk
function renderCompanies(companies: CompanyRecord[]): void {
  logger.info(`\n ${companies.length} new compan${companies.length === 1 ? 'y' : 'ies'} found\n`);
  for (const c of companies) {
    logger.info(`  ${c.companyName}`);
    logger.info(`  ${c.jobBoardUrl}`);
    logger.info('  ────────────────────────────────────────');
  }
}