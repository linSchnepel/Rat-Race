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
  cardContainer:  'li:has(div.job_seen_beacon)',
  cardLink:       'a.jcs-JobTitle[data-jk]',
  cardTitle:      'a.jcs-JobTitle span[title]',
  cardCompany:    'span[data-testid="company-name"]',
  cardLocation:   'div[data-testid="text-location"] span',
  cardSalary:     'span.css-zydy3i',

  // Right pane
  detailPane:       'div.jobsearch-RightPane',
  detailTitle:      'h2[data-testid="jobsearch-JobInfoHeader-title"] span:not(.visually-hidden)',
  detailCompany:    'div[data-testid="inlineHeader-companyName"] span',
  detailLocation:   'div[data-testid="inlineHeader-companyLocation"] div',
  detailSalary:     'div[data-testid="jobsearch-SalaryInfoAndJobType"] span',
  detailJobType:    'div[data-testid="jobsearch-SalaryInfoAndJobType"] span:last-child',
  detailDescription:'div#jobDescriptionText',
};

export async function fetchAndHydrateAllCards(searchUrl: string): Promise<JobRecord[]> {
  const page = await getPage();
  const allJobs: JobRecord[] = [];

  let currentUrl : string | null = searchUrl;
  let pageNum = 1;

  try {
    //while (true) { // TODO: For now, cannot get past page 1 without triggering Indeed's anti-bot measures.
      logger.info(`Indeed: fetching page ${pageNum}…`);
      await page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });

      const landedUrl = page.url();
      if (landedUrl.includes('/account/login') || landedUrl.includes('/authwall')) {
        throw new Error('Indeed redirected to login. Run `npm run setup:indeed` to refresh your session.');
      }

      await scrollJobList(page);

      await page.waitForSelector(SELECTORS.cardContainer, { timeout: 15_000 }).catch(() => {
        logger.warn('No Indeed cards found on this page.');
      });

      const html = await page.content().catch(() => '');
      const cards = parseListingCards(html);
      logger.info(`Indeed page ${pageNum}: ${cards.length} organic cards.`);

      for (const card of cards) {
        try {
          const job = await hydrateViaPanel(page, card, currentUrl);

          if (job) {
            allJobs.push(job);
          }
        } catch (err) {
          logger.warn(`Indeed hydration failed for ${card.externalId}: ${err instanceof Error ? err.message : String(err)}`);
        }

        await randomDelay(4_000, 8_500);
      }

      const nextUrl = await clickNextPage( page);
      if (!nextUrl) {
        logger.info('Indeed: no more pages.');
        //break;
      }

      currentUrl = nextUrl;
      pageNum++;
      await randomDelay(15_000, 35_000); // longer delay between pages to avoid rate limits
    //}
  } finally {
    await page.close();
  }

  return allJobs;
}

function parseListingCards(html: string): JobCard[] {
  const $ = load(html);
  const cards: JobCard[] = [];
  const fetchedAt = nowIso();

  $(SELECTORS.cardContainer).each((_i, el) => {
    try {
      const card = parseCard($, el, fetchedAt);

      if (card) {
        cards.push(card);
      }
    } catch (err) {
      logger.debug(`Indeed card parse error: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  return cards;
}

function parseCard($: ReturnType<typeof load>, el: ReturnType<typeof $>[0], fetchedAt: string): JobCard | null {
  const $el = $(el);

  const externalId = $el.find(SELECTORS.cardLink).attr('data-jk')?.trim() ?? '';
  if (!externalId) {
    return null; // skip sponsored
  }

  const title   = $el.find(SELECTORS.cardTitle).attr('title')?.trim() ?? $el.find(SELECTORS.cardTitle).text().trim();
  const company = $el.find(SELECTORS.cardCompany).text().trim();
  const location = $el.find(SELECTORS.cardLocation).text().trim();

  if (!title || !company) {
    return null;
  }

  const salaryRaw = $el.find(SELECTORS.cardSalary).first().text().trim() || null;
  const url = `https://www.indeed.com/viewjob?jk=${externalId}`;

  return {
    source: 'indeed' as const,
    url,
    externalId,
    title,
    company,
    location,
    teaser: salaryRaw,
    easyApply: $el.find('span:contains("Easily apply")').length > 0,
    boosted: false,
    fetchedAt,
  };
}

async function scrollJobList(page: Page): Promise<void> {
  const MAX_SCROLLS = 20;
  const SCROLL_PX = 600;
  const TICK_MS = 300;

  const listPanel = page.locator('div.mosaic-zone').first();
  const box = await listPanel.boundingBox().catch(() => null);

  if (!box) {
    logger.warn('Could not find mosaic-zone bounding box. Scroll skipped.');
    return;
  }

  const targetX = box.x + box.width / 2;
  const targetY = box.y + 100;
  await page.mouse.move(targetX, targetY);

  for (let i = 0; i < MAX_SCROLLS; i++) {
    await page.mouse.wheel(0, SCROLL_PX);
    await page.waitForTimeout(TICK_MS);
  }

  await page.waitForTimeout(800);
}

async function hydrateViaPanel(page: Page, card: JobCard, baseUrl: string): Promise<JobRecord | null> {
  logger.debug(`Indeed: clicking card ${card.externalId} - ${card.title}`);

  const cardLocator = page.locator(`a[data-jk="${card.externalId}"]`).first();
  await cardLocator.scrollIntoViewIfNeeded({ timeout: 5_000 }).catch(() => {});
  await cardLocator.click({ timeout: 5_000 });

  await page.waitForSelector(SELECTORS.detailDescription, { timeout: 10_000 })
    .catch(() => logger.debug(`Indeed: detail pane timeout for ${card.externalId}`));

  const html = await page.content().catch(() => '');
  if (!html) return null;

  return await parseDetailPane(card, html);
}

async function parseDetailPane(card: JobCard, html: string): Promise<JobRecord | null> {
  const $ = load(html);

  const title   = $(SELECTORS.detailTitle).first().text().trim()   || card.title;
  const company = $(SELECTORS.detailCompany).first().text().trim() || card.company;
  const locationRaw = $(SELECTORS.detailLocation).first().text().trim() || card.location;

  const descriptionHtml = $(SELECTORS.detailDescription).html()?.trim() ?? null;
  const descriptionText = $(SELECTORS.detailDescription).text().replace(/\s+/g, ' ').trim() || null;

  const experience = parseExperience(descriptionText ?? '');
  const salaryRaw = $(SELECTORS.detailSalary).first().text().trim() || card.teaser || null;
  const salary = salaryRaw ? parseSalary(salaryRaw) : null;

  // Job type from the same salary/type row
  const jobTypeText = $(SELECTORS.detailJobType).text().trim();
  const employmentType = /full.time|part.time|contract|temporary|internship/i.exec(jobTypeText)?.[0] ?? null;

  const locationNormalized = normalizeLocation(locationRaw);
  const isRemote = /remote/i.test(locationRaw) || /remote/i.test(locationNormalized);

  const { matched, standout } = await matchSkills(descriptionText ?? '');
  const now         = nowIso();
  const fingerprint = buildFingerprint({ source: 'indeed', externalId: card.externalId, company, title });

  return {
    source: 'indeed' as const,
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

    applyUrl: card.url,
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
    postedAge: null,
  };
}

function getNextPageUrl(html: string): string | null {
  const $ = load(html);

  // <a> with aria-label="Next Page" or data-testid="pagination-page-next"
  const nextHref = $('a[data-testid="pagination-page-next"]').attr('href') ?? $('a[aria-label="Next Page"]').attr('href');

  if (!nextHref) {
    return null;
  }

  // href is relative like /jobs?q=...&start=10
  return nextHref.startsWith('http') ? nextHref : `https://www.indeed.com${nextHref}`;
}

async function clickNextPage(page: Page): Promise<string | null> {
  const nextLink = page.locator('a[data-testid="pagination-page-next"]').first();
  const isVisible = await nextLink.isVisible().catch(() => false);
  
  if (!isVisible) {
    return null;
  }

  await nextLink.scrollIntoViewIfNeeded();
  await randomDelay(500, 1_500);
  await nextLink.click();
  await page.waitForSelector(SELECTORS.cardContainer, { timeout: 15_000 }).catch(() => {});
  return page.url();
}