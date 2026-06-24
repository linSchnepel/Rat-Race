import 'dotenv/config';

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { runLinkedInWorkflow, runIndeedWorkflow, runZiprecruiterWorkflow } from './workflows/board.js';
import { runGoogleWorkflow } from './workflows/search.js';
import { logger } from './utils/logger.js';
import { exit } from 'process';
import { projectRoot } from './utils/paths.js';

// TODO: Loop instead of harcode these select values
const SEARCH_URL = process.env['LINKEDIN_SEARCH_URL'] ?? '';
const SEARCH_URL_REMOTE = process.env['LINKEDIN_SEARCH_URL_REMOTE'] ?? '';
const SEARCH_URL_INDEED = process.env['INDEED_SEARCH_URL'] ?? '';
const SEARCH_URL_ZIPRECRUITER = process.env['ZIPRECRUITER_SEARCH_URL'] ?? '';

const ASHBY_SEARCH_URL = process.env['ASHBY_SEARCH_URL'] ?? '';
const GREENHOUSE_SEARCH_URL = process.env['GREENHOUSE_SEARCH_URL'] ?? '';
const LEVER_SEARCH_URL = process.env['LEVER_SEARCH_URL'] ?? '';

async function runGoogle() {
  await runGoogleWorkflow(new Map([
    ["Ashby", ASHBY_SEARCH_URL],
    ["Greenhouse", GREENHOUSE_SEARCH_URL],
    ["Lever", LEVER_SEARCH_URL],
  ]))
  .catch((err) => { logger.error('Fatal error', err); process.exit(1); });
}

async function runBoardsSimple() {
  if (SEARCH_URL && SEARCH_URL_REMOTE) await runLinkedInWorkflow([SEARCH_URL, SEARCH_URL_REMOTE]);
  if (SEARCH_URL_INDEED) await runIndeedWorkflow(SEARCH_URL_INDEED);
  if (SEARCH_URL_ZIPRECRUITER) await runZiprecruiterWorkflow(SEARCH_URL_ZIPRECRUITER);
}

try {
  await runGoogle();
  //await runBoardsSimple();

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
  console.error('Fatal error:', err);
  process.exit(1);
}
