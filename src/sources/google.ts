import { load } from 'cheerio';
import type { Page } from 'patchright';
import { getPage } from '../browser.js';
import { nowIso, randomDelay } from '../utils/dates.js';
import { logger } from '../utils/logger.js';
import type { CompanyRecord } from '../core/types.js';

const SELECTORS = {
  // Each organic search result container
  resultContainer: 'div.g, div[data-sokoban-container], div[jscontroller] a[href*="ashbyhq.com"]',

  // All links on the page
  allLinks: 'a[href]',

  // Next page link
  nextPage: 'a#pnnext, a[aria-label="Next"]',

  // CAPTCHA detection
  captcha: 'form#captcha-form, div.g-recaptcha, input#captcha',
};

const ASHBY_PATTERN = /^https:\/\/jobs\.ashbyhq\.com\/([^/?#]+)/;

export async function scrapeGoogleSearch(searchUrl: string, source: string): Promise<CompanyRecord[]> {
  const page = await getPage();
  const allCompanies: CompanyRecord[] = [];

  try {
    logger.info(`Google: searching — ${searchUrl}`);
    const companies = await scrapeSearchUrl(page, searchUrl, source);
    allCompanies.push(...companies);
    await randomDelay(10_000, 20_000);
  } finally {
    await page.close();
  }

  return allCompanies;
}

async function scrapeSearchUrl(page: Page, searchUrl: string, source: string): Promise<CompanyRecord[]> {
  const companies: CompanyRecord[] = [];

  let currentUrl = searchUrl;
  let pageNum = 1;

  while (true) {
    logger.info(`Google: page ${pageNum}`);

    await page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await randomDelay(2_000, 4_000);

    const landedUrl = page.url();

    if (await isCaptcha(page)) {
        logger.error('Google is showing a CAPTCHA. Run with HEADLESS=false to solve it manually, or wait before retrying.');
        await randomDelay(55_000, 60_000);
    }

    if (landedUrl.includes('consent.google.com')) {
      logger.warn('Google consent page detected — attempting to accept...');
      await acceptGoogleConsent(page);
      await randomDelay(2_000, 3_000);
    }

    // TODO: scroll

    const html = await page.content().catch(() => '');
    const found = parseSearchResults(html, source);
    logger.info(`Google page ${pageNum}: found ${found.length} Ashby URLs.`);
    companies.push(...found);

    const nextUrl = getNextPageUrl(html, page.url());
    if (!nextUrl) {
      logger.info('Google: no more pages for this search.');
      break;
    }

    currentUrl = nextUrl;
    pageNum++;
    await randomDelay(15_000, 30_000);
  }

  return companies;
}

function parseSearchResults(html: string, source: string): CompanyRecord[] {
  const $ = load(html);
  const seen = new Set<string>();
  const records: CompanyRecord[] = [];
  const now = nowIso();

  $(SELECTORS.allLinks).each((_i, el) => {
    const raw = $(el).attr('href') ?? '';
    const url = extractUrlFromGoogleHref(raw);

    if (!url) {
      return;
    }

    const match = ASHBY_PATTERN.exec(url);
    if (!match || !match[1]) {
      return;
    }

    // Strip trailing path beyond company slug
    const jobBoardUrl = `https://jobs.ashbyhq.com/${match[1]}`;
    if (seen.has(jobBoardUrl)) {
      return;
    }

    seen.add(jobBoardUrl);

    const companyName = decodeSlug(match[1]);

    records.push({
      source: source,
      companyName,
      jobBoardUrl,
      firstSeen: now,
    });
  });

  return records;
}

function extractUrlFromGoogleHref(href: string): string | null {
  if (!href) {
    return null;
  }
  
  try {
    if (href.startsWith('/url?')) {
      const params = new URLSearchParams(href.slice(5));
      return params.get('q');
    }

    if (href.startsWith('https://jobs.ashbyhq.com')) {
      return href;
    }

    return null;
  } catch {
    return null;
  }
}

function decodeSlug(slug: string): string {
  return slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function getNextPageUrl(html: string, currentPageUrl: string): string | null {
  const $ = load(html);
  const href = $(SELECTORS.nextPage).attr('href');

  if (!href) {
    return null;
  }

  if (href.startsWith('http')) {
    return href;
  }

  return `https://www.google.com${href}`;
}

async function isCaptcha(page: Page): Promise<boolean> {
  const url = page.url();

  if (url.includes('sorry/index') || url.includes('ipv4.google.com/sorry')) {
    return true;
  }

  const count = await page.locator(SELECTORS.captcha).count().catch(() => 0);

  return count > 0;
}

async function acceptGoogleConsent(page: Page): Promise<void> {
  const acceptBtn = page.locator('button:has-text("Accept all"), button:has-text("I agree")').first();
  const isVisible = await acceptBtn.isVisible().catch(() => false);
  
  if (isVisible) {
    await acceptBtn.click().catch(() => {});
    await page.waitForNavigation({ timeout: 5_000 }).catch(() => {});
  }
}