import { chromium, BrowserContext, Page } from 'patchright';

let context: BrowserContext | null = null;

export interface BrowserOptions {
  liAt: string;
  headless?: boolean;
  timezone?: string;
  locale?: string;
}

/**
 * Launch a Patchright-patched Chrome instance and inject the li_at session
 * cookie. Must be called before getPage() or verifySession().
 */
export async function initBrowser(opts: BrowserOptions): Promise<void> {
  if (context) {
    throw new Error('Browser already initialized. Call closeBrowser() first.');
  }

  const browser = await chromium.launch({
    // channel: 'chrome' uses the locally installed Chrome binary, which has a
    // real fingerprint. Falls back to bundled Chromium if Chrome is absent.
    channel: 'chrome',
    headless: opts.headless ?? true,
    args: [
      // Belt-and-suspenders alongside Patchright's own flag patches.
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });

  context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: opts.locale ?? 'en-US',
    timezoneId: opts.timezone ?? 'America/Chicago',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
      'AppleWebKit/537.36 (KHTML, like Gecko) ' +
      'Chrome/124.0.0.0 Safari/537.36',
    extraHTTPHeaders: {
      'accept-language': 'en-US,en;q=0.9',
      'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
    },
  });

  // Navigate to LinkedIn's domain first so the browser establishes the origin
  // before we set cookies. Without this, some Chromium builds silently drop
  // cookies set on domains that have never been visited in this context.
  const seedPage = await context.newPage();
  await seedPage.goto('https://www.linkedin.com', {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  await seedPage.close();

  // li_at is SameSite=Lax in LinkedIn's real cookie — match that exactly.
  // Using 'None' here causes Chromium to silently reject it in some configs.
  await context.addCookies([
    {
      name: 'li_at',
      value: opts.liAt,
      domain: '.linkedin.com',
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
    },
  ]);
}

/**
 * Open a new Page inside the existing browser context.
 * The li_at cookie is already present — no further setup needed.
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

/**
 * True if initBrowser() has been called and closeBrowser() has not.
 */
export function isBrowserOpen(): boolean {
  return context !== null;
}