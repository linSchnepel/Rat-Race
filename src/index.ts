import 'dotenv/config';
import { runLinkedInWorkflow } from './workflows/linkedin.js';
import { logger } from './utils/logger.js';

runLinkedInWorkflow().catch((err) => {
  logger.error('Fatal error', err);
  process.exit(1);
});