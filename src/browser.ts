import { chromium, BrowserContext, Page } from 'patchright';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
//const AUTH_FILE = join(__dirname, '../data/auth.json');

export function getAuthFile(source: string): string {
  return join(__dirname, `../data/auth/${source}.json`);
}

let context: BrowserContext | null = null;

export interface BrowserOptions {
  headless?: boolean;
  timezone?: string;
  locale?: string;
}

/**
 * Launch a Patchright Chrome instance using saved storageState from
 * scripts/setup-auth.ts. This sidesteps the Windows DPAPI cookie encryption
 * problem — we use a plaintext session file rather than Chrome's locked DB.
 *
 * Run `npx tsx scripts/setup-auth.ts` whenever the session expires.
 */
export async function initBrowser(opts: BrowserOptions & { source?: string } = {}): Promise<void> {
  if (context) {
    throw new Error('Browser already initialized. Call closeBrowser() first.');
  }

  const authFile = getAuthFile(opts.source ?? 'linkedin');

  if (!existsSync(authFile)) {
    throw new Error(
      `Auth file not found at ${authFile}. ` +
        'Run `npx tsx scripts/setup-auth.ts` first to log in and save your session.'
    );
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
    // No custom userAgent — let Patchright use the real Chrome UA so it
    // matches what LinkedIn saw when you logged in during setup.
  });
}

/**
 * Open a new Page inside the browser context.
 * Session is already loaded from auth.json — no further setup needed.
 */
export async function getPage(): Promise<Page> {
  if (!context) {
    throw new Error('Browser not initialized. Call initBrowser() first.');
  }
  const page = await context.newPage();

  // Block heavyweight assets that waste bandwidth and slow scraping.
  await page.route('**/*', (route) => {
    const type = route.request().resourceType();
    if (['image', 'media', 'font'].includes(type)) {
      return route.abort();
    }
    return route.continue();
  });

  return page;
}

/**
 * Close the browser context and release all resources.
 * Safe to call even if the browser was never initialized.
 */
export async function closeBrowser(): Promise<void> {
  if (context) {
    await context.close();
    context = null;
  }
}

export function isBrowserOpen(): boolean {
  return context !== null;
}