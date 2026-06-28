import { chromium } from 'patchright';
import { mkdir, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { adapters } from './auth/index.js';
import { projectRoot } from '../src/utils/paths.js';

export async function runAuth(
  target: string,
  onReady: () => void,
  waitForContinue: () => Promise<void>
): Promise<void> {
  console.log(`[runAuth] Starting auth for ${target}`);
  const adapter = adapters[target];
  if (!adapter) throw new Error(`Unknown adapter: ${target}`);

  const AUTH_FILE = join(projectRoot, `data/auth/${target}.json`);
  console.log(`[runAuth] Auth file path: ${AUTH_FILE}`);

  console.log(`[runAuth] Launching browser...`);
  const browser = await chromium.launch({ channel: 'chrome', headless: false });
  console.log(`[runAuth] Browser launched`);

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  console.log(`[runAuth] Navigating to ${adapter.loginUrl}`);

  await page.goto(adapter.loginUrl, { waitUntil: 'domcontentloaded' });
  console.log(`[runAuth] Page loaded, waiting for URL match...`);

  await page.waitForURL(adapter.waitForUrl, { timeout: 120_000 }).catch((e) => {
    console.log(`[runAuth] waitForURL timed out or failed: ${e.message}`);
  });

  const currentUrl = page.url();
  console.log(`[runAuth] Current URL: ${currentUrl}`);

  if (currentUrl.includes('/login') || currentUrl.includes('/authwall')) {
    await browser.close();
    throw new Error(`Still on login page for ${adapter.name}`);
  }

  onReady();

  // Wait for user to click Continue in the UI
  console.log(`[runAuth] Waiting for user to click Continue...`);
  await waitForContinue();

  const state = await context.storageState();
  await mkdir(dirname(AUTH_FILE), { recursive: true });
  await writeFile(AUTH_FILE, JSON.stringify(state, null, 2), 'utf-8');
  await browser.close();

  const cookies = state.cookies.filter((c) =>
    c.domain.includes(new URL(adapter.loginUrl).hostname.replace('www.', ''))
  );

  if (cookies.length === 0) {
    throw new Error(`No cookies saved for ${adapter.name}`);
  }
}