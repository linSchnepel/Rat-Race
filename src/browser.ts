import { chromium, BrowserContext, Page } from 'patchright';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { projectRoot } from './utils/paths.js';

export function getAuthFile(source: string): string {
  return join(projectRoot, `data/auth/${source}.json`);
}

let context: BrowserContext | null = null;

export interface BrowserOptions {
  headless?: boolean;
  timezone?: string;
  locale?: string;
}

// Launch a Patchright Chrome instance using saved storageState
// This is because the job board sites require login
export async function initBrowser(opts: BrowserOptions & { source?: string } = {}): Promise<void> {
  if (context) {
    throw new Error('Browser already initialized. Call closeBrowser() first.');
  }

  const authFile = getAuthFile(opts.source ?? 'linkedin');

  if (!existsSync(authFile)) {
    throw new Error(`Auth file not found at ${authFile}.`);
  }

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: opts.headless ?? true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });

  context = await browser.newContext({
    storageState: authFile,
    viewport: { width: 1440, height: 900 },
    locale: opts.locale ?? 'en-US',
    timezoneId: opts.timezone ?? 'America/Chicago',
  });
}

// Open a new Page inside the browser context
export async function getPage(): Promise<Page> {
  if (!context) {
    throw new Error('Browser not initialized. Call initBrowser() first.');
  }

  const page = await context.newPage();

  // Block heavyweight assets
  await page.route('**/*', (route) => {
    const type = route.request().resourceType();

    if (['image', 'media', 'font'].includes(type)) {
      return route.abort();
    }

    return route.continue();
  });

  return page;
}

export async function closeBrowser(): Promise<void> {
  if (context) {
    await context.close();
    context = null;
  }
}

export function isBrowserOpen(): boolean {
  return context !== null;
}