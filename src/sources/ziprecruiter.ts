import { load } from 'cheerio';
import type { Page } from 'patchright';
import { getPage } from '../browser.js';
import { normalizeCompany, normalizeTitle, normalizeLocation } from '../core/normalize.js';
import { buildFingerprint } from '../core/fingerprint.js';
import { matchSkills } from '../core/skills.js';
import { parseSalary } from '../utils/salary.js';
import { nowIso, randomDelay } from '../utils/dates.js';
import { logger } from '../utils/logger.js';
import type { JobCard, JobRecord } from '../core/types.js';
import { parseExperience } from '../utils/experience.ts';

const SELECTORS = {
  // Left pane
  cardContainer:    'article[id^="job-card-"]',
  cardTitle:        'h2[aria-label]',
  cardCompany:      'a[data-testid="job-card-company"]',
  cardLocation:     'a[data-testid="job-card-location"]',
  cardLocationSpan: 'a[data-testid="job-card-location"] + span',
  quickApplyBadge:  'p.text-brand',

  // Job IDs from ld+json
  ldJson: 'script[type="application/ld+json"]',

  // Right pane
  rightPane:        'div[data-testid="right-pane"]',
  detailTitle:      'div[data-testid="job-details-scroll-container"] h2.font-bold',
  detailCompany:    'div[data-testid="job-details-scroll-container"] a[href^="/co/"]',
  detailLocation:   'div[data-testid="job-details-scroll-container"] div.grid > div.grid > div.mb-24 p',
  detailDescription:'div.text-primary.whitespace-pre-line',
  detailApplyLink:  'a[aria-label="Apply"]',
  detailMeta:       'div[data-testid="job-details-scroll-container"] div.flex.gap-x-12 p.text-body-md',

  // Left pane scroll container
  leftPaneScroll:   'section.job_results_two_pane',

  // Pagination
  paginationNext:   'a[title="Next Page"]',
};

export async function fetchAndHydrateAllCards(searchUrl: string): Promise<JobRecord[]> {
  const listPage = await getPage();
  const detailPage = await getPage();
  const allJobs: JobRecord[] = [];

  let currentUrl = searchUrl;
  let pageNum = 1;

  try {
    while (true) {
      logger.info(`ZipRecruiter: fetching page ${pageNum} — ${currentUrl}`);

      await listPage.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });

      const landedUrl = listPage.url();
      if (landedUrl.includes('/login') || landedUrl.includes('/account/login')) {
        throw new Error('ZipRecruiter redirected to login. Run `npm run setup:ziprecruiter` to refresh your session.');
      }

      await listPage.waitForSelector(SELECTORS.cardContainer, { timeout: 15_000 }).catch(() => {
        logger.warn('ZipRecruiter: no cards found on this page.');
      });

      await scrollLeftPane(listPage);

      const html = await listPage.content().catch(() => '');
      const { cards } = parseListingCards(html, currentUrl);
      logger.info(`ZipRecruiter page ${pageNum}: ${cards.length} cards.`);

      for (const card of cards) {
        try {
          const job = await hydrateViaDetailPage(detailPage, card, currentUrl);

          if (job) {
            allJobs.push(job);
          }
        } catch (err) {
          logger.warn(`ZipRecruiter hydration failed for ${card.externalId}: ${err instanceof Error ? err.message : String(err)}`);
        }
        await randomDelay(1_000, 2_500);
      }

      // Get next page URL from the listing page's current HTML
      const nextUrl = getNextPageUrl(html);
      if (!nextUrl) {
        logger.info('ZipRecruiter: no more pages.');
        break;
      }

      currentUrl = nextUrl;
      pageNum++;
      await randomDelay(3_000, 7_000);
    }
  } finally {
    await listPage.close();
    await detailPage.close();
  }

  return allJobs;
}

async function scrollLeftPane(page: Page): Promise<void> {
  const MAX_SCROLLS = 20;
  const SCROLL_PX   = 600;
  const TICK_MS     = 300;

  const panel = page.locator(SELECTORS.leftPaneScroll).first();
  const box = await panel.boundingBox().catch(() => null);

  if (!box) {
    logger.warn('ZipRecruiter: could not find left pane bounding box — scroll skipped.');
    return;
  }

  await page.mouse.move(box.x + box.width / 2, box.y + 100);

  for (let i = 0; i < MAX_SCROLLS; i++) {
    await page.mouse.wheel(0, SCROLL_PX);
    await page.waitForTimeout(TICK_MS);
  }

  await page.waitForTimeout(800);
}

interface ParseResult {
  cards: JobCard[];
  jobIdMap: Map<string, string>; // cardId -> jid
}

function parseListingCards(html: string, baseUrl: string): ParseResult {
  const $ = load(html);
  const cards: JobCard[] = [];
  const fetchedAt = nowIso();

  // Only parse the desktop cards (hidden md:block) to avoid duplicates
  $('div.hidden.md\\:block article[id^="job-card-"]').each((i, el) => {
    try {
      const card = parseCard($, el, fetchedAt, baseUrl);

      if (card) {
        cards.push(card);
      }
    } catch (err) {
      logger.debug(`ZipRecruiter card parse error: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  return { cards, jobIdMap: new Map() };
}

function parseCard($: ReturnType<typeof load>, el: ReturnType<typeof $>[0], fetchedAt: string, baseUrl: string): JobCard | null {
  const $el = $(el);

  const articleId  = $el.attr('id') ?? '';
  const externalId = articleId.replace('job-card-', '');
  if (!externalId) {
    return null;
  }

  const title   = $el.find(SELECTORS.cardTitle).first().attr('aria-label')?.trim() ?? '';
  const company = $el.find(SELECTORS.cardCompany).first().text().trim();
  if (!title || !company) {
    return null;
  }

  const locationBase   = $el.find(SELECTORS.cardLocation).first().text().trim();
  const locationSuffix = $el.find(SELECTORS.cardLocationSpan).first().text().trim();
  const location       = locationSuffix ? `${locationBase}${locationSuffix}` : locationBase;

  const salaryRaw = $el.find('p.text-body-md').toArray()
    .map((n) => $(n).text().trim())
    .find((t) => /\$|\d+[Kk]\/yr/.test(t)) ?? null;

  const quickApply = $el.find(SELECTORS.quickApplyBadge).toArray()
    .some((n) => $(n).text().trim().toLowerCase().includes('quick apply'));

  // Build URL: current listing page + lk=matchToken
  const url = new URL(baseUrl);
  url.searchParams.set('lk', externalId);

  return {
    source: 'ziprecruiter' as const,
    url: url.toString(),
    externalId,
    title,
    company,
    location,
    teaser: salaryRaw,
    easyApply: quickApply,
    boosted: false,
    fetchedAt,
  };
}

async function hydrateViaDetailPage(page: Page, card: JobCard, listingUrl: string): Promise<JobRecord | null> {
  logger.debug(`ZipRecruiter: hydrating ${card.externalId} — ${card.title}`);

  const url = new URL(listingUrl);
  url.searchParams.set('lk', card.externalId);

  await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 30_000 });

  await page.waitForSelector(SELECTORS.detailDescription, { timeout: 10_000 })
    .catch(() => logger.debug(`ZipRecruiter: detail pane timeout for ${card.externalId}`));

  const html = await page.content().catch(() => '');

  if (!html) {
    return null;
  }

  return parseDetailPane(card, html);
}

async function parseDetailPane(card: JobCard, html: string): Promise<JobRecord | null> {
  const $ = load(html);

  const scrollContainer = $('div[data-testid="job-details-scroll-container"]');

  const title   = scrollContainer.find('h2.font-bold').first().text().trim() || card.title;
  const company = scrollContainer.find('a[href^="/co/"]').first().text().trim() || card.company;

  // Location is the <p> directly in the grid after company
  const locationRaw = scrollContainer
    .find('div.grid > div.grid > div.mb-24 p').first().text().trim()
    || card.location;

  const descriptionHtml = $(SELECTORS.detailDescription).html()?.trim() ?? null;
  const descriptionText = $(SELECTORS.detailDescription).text().replace(/\s+/g, ' ').trim() || null;

  // Meta items: employment type, benefits, posted age
  // Each is a <div class="flex gap-x-12"> containing an svg + <p>
  const metaTexts = scrollContainer.find('div.flex.gap-x-12 p.text-body-md')
    .toArray()
    .map((el) => $(el).text().trim())
    .filter(Boolean);

  const employmentType = metaTexts.find((t) =>
    /^(full.time|part.time|contract|temporary|internship)/i.test(t)
  ) ?? null;

  const postedAge = metaTexts.find((t) =>
    /\d+\s+(minute|hour|day|week)s?\s+ago/i.test(t) || /posted/i.test(t)
  ) ?? null;

  const applyUrl = scrollContainer.find('a[aria-label="Apply"]').first().attr('href') ?? null;

  const salaryRaw = card.teaser || null;
  const salary = salaryRaw ? parseSalary(salaryRaw) : null;
  const experience = parseExperience(descriptionText ?? '');

  const locationNormalized = normalizeLocation(locationRaw);
  const isRemote = /remote/i.test(locationRaw) || /remote/i.test(locationNormalized);

  const { matched, standout } = await matchSkills(descriptionText ?? '');

  const now = nowIso();
  const fingerprint = buildFingerprint({
    source: 'ziprecruiter',
    externalId: card.externalId,
    company,
    title,
  });

  return {
    source: 'ziprecruiter' as const,
    url: card.url,
    externalId: card.externalId,
    fingerprint,
    firstSeen: now,
    lastSeen: now,

    company,
    companyNormalized: normalizeCompany(company),
    isBlacklisted: false,
    recruiterLike: false,

    title,
    titleNormalized: normalizeTitle(title),
    employmentType,

    locationRaw,
    locationNormalized,
    isRemote,

    teaser: null,
    descriptionHtml,
    descriptionText,

    applyUrl,
    easyApply: card.easyApply,

    isBoosted: false,
    isRepublished: false,
    legitimacyScore: 100,

    experience,
    salary,
    skillsExtracted: [],
    skillsMatched: matched,
    skillsStandout: standout,

    applicantCount: null,
    postedAge,
  };
}

function getNextPageUrl(html: string): string | null {
  const $ = load(html);
  const href = $(SELECTORS.paginationNext).attr('href');
  if (!href) {
    return null;
  }
  
  return href.startsWith('http') ? href : `https://www.ziprecruiter.com${href}`;
}