import { chromium, BrowserContext, Page, CDPSession } from 'patchright';
import { existsSync } from 'fs';
import { join } from 'path';

import { projectRoot } from './utils/paths.js';

export function getAuthFile(source: string): string {
  return join(projectRoot, `data/auth/${source}.json`);
}

let context: BrowserContext | null = null;

export interface BrowserOptions {
  timezone?: string;
  locale?: string;
}

async function minimizeWindow(page: Page): Promise<void> {
  try {
    const client: CDPSession = await context!.newCDPSession(page);
    const { windowId } = await client.send('Browser.getWindowForTarget');
    await client.send('Browser.setWindowBounds', {
      windowId,
      bounds: { windowState: 'minimized' },
    });
    await client.detach();
  } catch (err) {
    console.warn('Could not minimize browser window:', err);
  }
}

export async function initBrowser(opts: BrowserOptions & { source?: string } = {}): Promise<void> {
  if (context) {
    throw new Error('Browser already initialized. Call closeBrowser() first.');
  }

  const authFile = getAuthFile(opts.source ?? 'linkedin');

  if (!existsSync(authFile) && opts.source != 'google') {
    throw new Error(`Auth file not found at ${authFile}.`);
  }

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: false, // always headed. Headless triggers bot detection
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });

  context = await browser.newContext({
    storageState: opts.source != 'google' ? authFile : { cookies: [], origins: [] },
    viewport: { width: 1440, height: 900 },
    locale: opts.locale ?? 'en-US',
    timezoneId: opts.timezone ?? 'America/Chicago',
  });
}

export async function getPage(): Promise<Page> {
  if (!context) {
    throw new Error('Browser not initialized. Call initBrowser() first.');
  }

  const page = await context.newPage();

  // Minimize as soon as the page exists
  await minimizeWindow(page);

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