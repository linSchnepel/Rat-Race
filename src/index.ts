import 'dotenv/config';

import { writeFileSync } from 'fs';
import { join } from 'path';

import { runLinkedInWorkflow, runIndeedWorkflow, runZiprecruiterWorkflow } from './workflows/board.js';
import { runGoogleWorkflow } from './workflows/search.js';
import { logger } from './utils/logger.js';
import { projectRoot } from './utils/paths.js';
import { senicide } from './utils/cleanse.js';
import { loadConfig } from './utils/config.ts';
import { setupPage } from './cli/renderHtml.js';

const config = loadConfig();

async function runGoogle() {
  if (!config.ASHBY_SEARCH_URL || !config.GREENHOUSE_SEARCH_URL || !config.LEVER_SEARCH_URL) {
    logger.warn('No websearch URLs found.')
    return;
  }

  setupPage('companies');

  await runGoogleWorkflow(new Map([
    ["Ashby", config.ASHBY_SEARCH_URL],
    ["Greenhouse", config.GREENHOUSE_SEARCH_URL],
    ["Lever", config.LEVER_SEARCH_URL],
  ]))
  .catch((err) => { logger.error('Fatal error', err); process.exit(1); });
}

async function runBoardsSimple() {
  setupPage('jobs');

  if (config.LINKEDIN_SEARCH_URL && config.LINKEDIN_SEARCH_URL_2) await runLinkedInWorkflow([config.LINKEDIN_SEARCH_URL, config.LINKEDIN_SEARCH_URL_2]);
  if (config.INDEED_SEARCH_URL) await runIndeedWorkflow(config.INDEED_SEARCH_URL);
  if (config.ZIPRECRUITER_SEARCH_URL) await runZiprecruiterWorkflow(config.ZIPRECRUITER_SEARCH_URL);
}

export async function run() {
  try {
    const { removed, kept } = senicide();

    if (removed > 0) {
      logger.info(`Cleansed ${removed} old job entries. ${kept} remaining.`);
    } else {
      logger.info('no old data found');
    }
    
    //await runGoogle();
    await runBoardsSimple();

    writeFileSync(
      join(projectRoot, 'data', 'last_run.json'),
      JSON.stringify({
        date: new Date().toISOString().slice(0, 10),
        completedAt: new Date().toTimeString().slice(0, 8),
        status: 'success',
      })
    );

    process.exit(0);
  } catch (err) {
    logger.error('Fatal error:', err);
    process.exit(1);
  }
}

await run();
