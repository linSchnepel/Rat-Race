import 'dotenv/config';
import { runLinkedInWorkflow } from './workflows/linkedin.js';
import { logger } from './utils/logger.js';

// TODO: Loop instead of harcode these select values
const SEARCH_URL = process.env['LINKEDIN_SEARCH_URL'] ?? '';
const SEARCH_URL_REMOTE = process.env['LINKEDIN_SEARCH_URL_REMOTE'] ?? '';

runLinkedInWorkflow(SEARCH_URL).catch((err) => {
  logger.error('Fatal error', err);
  process.exit(1);
});

runLinkedInWorkflow(SEARCH_URL_REMOTE).catch((err) => {
  logger.error('Fatal error', err);
  process.exit(1);
});