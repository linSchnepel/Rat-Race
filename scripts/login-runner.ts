import { chromium } from 'patchright';
import { mkdir, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { adapters } from './auth/index.js';
import { projectRoot } from '../src/utils/paths.js';

export async function runAuth(
  target: string,
  waitForContinue: () => Promise<void>
): Promise<void> {
  const adapter = adapters[target];
  if (!adapter) throw new Error(`Unknown adapter: ${target}`);

  const AUTH_FILE = join(projectRoot, `data/auth/${target}.json`);

  const browser = await chromium.launch({ channel: 'chrome', headless: false });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto(adapter.loginUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForURL(adapter.waitForUrl, { timeout: 120_000 }).catch(() => {});

  const currentUrl = page.url();
  if (currentUrl.includes('/login') || currentUrl.includes('/authwall')) {
    await browser.close();
    throw new Error(`Still on login page for ${adapter.name}`);
  }

  // Wait for user to click Continue in the UI
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