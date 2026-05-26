import 'dotenv/config';
import { runLinkedInWorkflow } from './workflows/linkedin.js';
import { logger } from './utils/logger.js';
import { runIndeedWorkflow } from './workflows/indeed.ts';
import { runZiprecruiterWorkflow } from './workflows/ziprecruiter.ts';

// TODO: Loop instead of harcode these select values
const SEARCH_URL = process.env['LINKEDIN_SEARCH_URL'] ?? '';
const SEARCH_URL_REMOTE = process.env['LINKEDIN_SEARCH_URL_REMOTE'] ?? '';
const SEARCH_URL_INDEED = process.env['INDEED_SEARCH_URL'] ?? '';
const SEARCH_URL_ZIPRECRUITER = process.env['ZIPRECRUITER_SEARCH_URL'] ?? '';

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const POLL_INTERVAL_MS = parseInt(process.env['POLL_INTERVAL_MS'] ?? '600000', 10);

async function pollLoop(): Promise<void> {
  while (true) {
    try {
      await runLinkedInWorkflow([SEARCH_URL, SEARCH_URL_REMOTE]);
      await delay(300000);

      await runIndeedWorkflow(SEARCH_URL_INDEED).catch((err) => {
        logger.error('Fatal error', err);
        process.exit(1);
      });
      await runZiprecruiterWorkflow(SEARCH_URL_ZIPRECRUITER);
    } catch (err) {
      logger.error('Poll cycle failed', err);
    }

    logger.info(`Waiting ${POLL_INTERVAL_MS / 1000}s before next cycle…`);
    await delay(POLL_INTERVAL_MS);
  }
}

pollLoop().catch((err) => {
  logger.error('Fatal error', err);
  process.exit(1);
});
