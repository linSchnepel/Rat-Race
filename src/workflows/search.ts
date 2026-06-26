import { initBrowser, closeBrowser } from '../browser.js';
import { scrapeGoogleSearch } from '../sources/google.js';
import { readCompanies, appendCompanies } from '../storage/companyFile.js';
import { renderCompanies } from '../cli/render.js';
import { appendCompanies as appendHtml } from '../cli/renderHtml.ts'
import { logger } from '../utils/logger.js';
import { loadConfig } from '../utils/config.ts';

export async function runGoogleWorkflow(searchUrls: Map<string, string>): Promise<void> {
  if (!searchUrls.size) {
    throw new Error('No search URLs provided to runGoogleWorkflow.');
  }

  const config = loadConfig();
  logger.info('Starting Google search workflow…');

  await initBrowser({
    headless: config.HEADLESS !== false,
    timezone: config.TZ ?? 'America/Chicago',
    source: 'google',
  });

  try {
    try {
      for (const [name, url] of searchUrls) {
        await runOnce(url, name); // TODO: this name/source gets passed around a lot
      }
    } catch (err) {
      logger.error('Google workflow failed', err);
    }
  } finally {
    await closeBrowser();
    logger.info('Browser closed. Goodbye.');
  }
}

async function runOnce(searchUrl: string, source: string): Promise<void> {
  logger.info('--- Starting Google poll cycle ---');
  const cycleStart = Date.now();

  const found = await scrapeGoogleSearch(searchUrl, source);
  logger.info(`Google: found ${found.length} companies across all searches.`);

  if (found.length === 0) {
    logger.info('No companies found this cycle.');
    return;
  }

  // Dedupe against history
  const history = await readCompanies();
  const historicUrls = new Set(history.map((c) => c.companyName));
  const fresh = found.filter((c) => !historicUrls.has(c.companyName));

  logger.info(`${fresh.length} new companies not seen before.`);

  if (fresh.length === 0) {
    logger.info('No new companies this cycle.');
    return;
  }

  if (process.env.RAT_RACE_ROOT) {
    appendHtml(fresh);
  } else {
    renderCompanies(fresh);
  }
  
  await appendCompanies(fresh);
  logger.info(`Appended ${fresh.length} companies to company.jsonl.`);

  const elapsed = ((Date.now() - cycleStart) / 1000).toFixed(1);
  logger.info(`Google cycle complete in ${elapsed}s.`);
}