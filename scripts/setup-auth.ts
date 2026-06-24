import 'dotenv/config';

import { chromium } from 'patchright';
import { mkdir, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import * as readline from 'readline';

import { adapters } from './auth/index.js';
import { projectRoot } from '../src/utils/paths.js';

const __dirname = projectRoot;

// Usage: npx tsx scripts/setup-auth.ts linkedin
//        npx tsx scripts/setup-auth.ts indeed
const target = process.argv[2]?.toLowerCase();

if (!target) {
  console.error(`Usage: npx tsx scripts/setup-auth.ts <site>\nAvailable: ${Object.keys(adapters).join(', ')}`);
  process.exit(1);
}

const adapter = adapters[target];

const AUTH_FILE = join(__dirname, `./data/auth/${target}.json`);

async function main() {
  if (!adapter) {
    console.error(`Unknown site "${target}". Available: ${Object.keys(adapters).join(', ')}`);
    process.exit(1);
  }

  console.log(`\n=== ${adapter.name} Auth Setup ===\n`);
  console.log(`Opening Chrome. Log in to ${adapter.name}, then come back here.\n`);

  const browser = await chromium.launch({ channel: 'chrome', headless: false });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto(adapter.loginUrl, { waitUntil: 'domcontentloaded' });

  console.log('Waiting for you to log in...');
  await page.waitForURL(adapter.waitForUrl, { timeout: 120_000 }).catch(() => {});

  const currentUrl = page.url();
  if (currentUrl.includes('/login') || currentUrl.includes('/authwall')) {
    console.error('\nStill on login page - complete the login before continuing.');
    await browser.close();
    process.exit(1);
  }

  await prompt('\nPress Enter to save your session and close the browser...');

  const state = await context.storageState();
  await mkdir(dirname(AUTH_FILE), { recursive: true });
  await writeFile(AUTH_FILE, JSON.stringify(state, null, 2), 'utf-8');
  await browser.close();

  const cookies = state.cookies.filter((c) => c.domain.includes(new URL(adapter.loginUrl).hostname.replace('www.', '')));
  if (cookies.length === 0) {
    console.error(`\nWarning: no cookies found for ${adapter.name}. Login may not have completed.`);
    process.exit(1);
  }

  console.log(`\n✓ Session saved to ${AUTH_FILE} (${cookies.length} cookies)`);
}

function prompt(question: string): Promise<void> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, () => { rl.close(); resolve(); });
  });
}

main().catch((err) => { console.error('Setup failed:', err); process.exit(1); });