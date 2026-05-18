import { load } from 'cheerio';
import { getPage } from '../browser.js';
import { normalizeCompany, normalizeTitle, normalizeLocation, normalizeUrl } from '../core/normalize.js';
import { buildFingerprint } from '../core/fingerprint.js';
import { matchSkills } from '../core/skills.js';
import { nowIso } from '../utils/dates.js';
import { logger } from '../utils/logger.js';
import type { JobCard, JobRecord } from '../core/types.js';

// ---------------------------------------------------------------------------
// Selectors — LinkedIn's class names as of 2025. If scraping breaks, check
// these first in DevTools before changing logic.
// ---------------------------------------------------------------------------

const SELECTORS = {
  // Listing page
  cardContainer: 'div.job-search-card, div.base-card',
  cardTitle: 'h3.base-search-card__title',
  cardCompany: 'h4.base-search-card__subtitle',
  cardLocation: 'span.job-search-card__location',
  cardLink: 'a.base-card__full-link',
  cardTeaser: 'p.job-search-card__snippet',
  cardDate: 'time.job-search-card__listdate, time.job-search-card__listdate--new',
  easyApplyBadge: 'span.job-search-card__easy-apply-label',
  promotedBadge: 'span.job-search-card__promoted-text',

  // Detail page
  detailTitle: 'h1.top-card-layout__title, h1.t-24',
  detailCompany: 'a.topcard__org-name-link, span.topcard__flavor:first-child',
  detailLocation: 'span.topcard__flavor--bullet, .jobs-unified-top-card__bullet',
  detailDescription: 'div.show-more-less-html__markup, div.description__text',
  detailEmploymentType: 'span.description__job-criteria-text:nth-of-type(1)',
  detailExperienceLevel: 'span.description__job-criteria-text:nth-of-type(2)',
  detailApplicants: 'span.num-applicants__caption, figcaption.num-applicants__caption',
  detailPostedAge: 'span.posted-time-ago__text, span.topcard__flavor--metadata',
  easyApplyButton: 'button.jobs-apply-button--top-card, span.jobs-apply-button__text',
};

// ---------------------------------------------------------------------------
// Listing page — fetch cards
// ---------------------------------------------------------------------------

/**
 * Navigate to the LinkedIn jobs search URL and parse all visible job cards.
 * Uses Patchright page navigation; Cheerio does all the parsing.
 */
export async function fetchListingCards(searchUrl: string): Promise<JobCard[]> {
  const page = await getPage();

  try {
    logger.debug(`Navigating to listing page: ${searchUrl}`);

    await page.goto(searchUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    // Wait for at least one job card to appear.
    await page.waitForSelector(SELECTORS.cardContainer, { timeout: 15_000 }).catch(() => {
      logger.warn('No job cards found within timeout — page may be empty or structure changed.');
    });

    // Scroll down to trigger lazy-loaded cards.
    await autoScroll(page);

    const html = await page.content();
    return parseListingCards(html);
  } finally {
    await page.close();
  }
}

/**
 * Parse job cards from listing page HTML using Cheerio.
 */
function parseListingCards(html: string): JobCard[] {
  const $ = load(html);
  const cards: JobCard[] = [];
  const fetchedAt = nowIso();

  $(SELECTORS.cardContainer).each((_i, el) => {
    try {
      const card = parseCard($, el, fetchedAt);
      if (card) cards.push(card);
    } catch (err) {
      logger.debug(`Failed to parse card: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  logger.debug(`Parsed ${cards.length} cards from listing HTML.`);
  return cards;
}

function parseCard(
  $: ReturnType<typeof load>,
  el: ReturnType<typeof $>[0],
  fetchedAt: string
): JobCard | null {
  const $el = $(el);

  const url = normalizeUrl($el.find(SELECTORS.cardLink).attr('href') ?? '');
  if (!url) return null;

  const externalId = extractJobId(url);
  if (!externalId) return null;

  const title = $el.find(SELECTORS.cardTitle).text().trim();
  const company = $el.find(SELECTORS.cardCompany).text().trim();
  const location = $el.find(SELECTORS.cardLocation).text().trim();

  if (!title || !company) return null;

  return {
    source: 'linkedin',
    url,
    externalId,
    title,
    company,
    location,
    teaser: $el.find(SELECTORS.cardTeaser).text().trim() || null,
    easyApply: $el.find(SELECTORS.easyApplyBadge).length > 0,
    boosted: $el.find(SELECTORS.promotedBadge).length > 0,
    fetchedAt,
  };
}

// ---------------------------------------------------------------------------
// Detail page — hydrate a single card into a full JobRecord
// ---------------------------------------------------------------------------

/**
 * Visit a job's detail page and parse full details into a JobRecord.
 * The caller is responsible for waiting between calls (randomDelay).
 */
export async function hydrateCard(card: JobCard): Promise<JobRecord | null> {
  const page = await getPage();

  try {
    logger.debug(`Hydrating: ${card.url}`);

    await page.goto(card.url, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    // Wait for the description to load — it's the most important field.
    await page.waitForSelector(SELECTORS.detailDescription, { timeout: 10_000 }).catch(() => {
      logger.debug(`Description selector not found for ${card.url}`);
    });

    const html = await page.content();
    return await parseDetailPage(card, html);
  } catch (err) {
    logger.warn(`Hydration failed for ${card.url}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  } finally {
    await page.close();
  }
}

/**
 * Parse a job detail page HTML into a JobRecord using Cheerio.
 */
async function parseDetailPage(card: JobCard, html: string): Promise<JobRecord | null> {
  const $ = load(html);

  const descriptionHtml =
    $(SELECTORS.detailDescription).html()?.trim() ?? null;
  const descriptionText =
    $(SELECTORS.detailDescription).text().replace(/\s+/g, ' ').trim() || null;

  const title = $(SELECTORS.detailTitle).first().text().trim() || card.title;
  const company = $(SELECTORS.detailCompany).first().text().trim() || card.company;
  const locationRaw = $(SELECTORS.detailLocation).first().text().trim() || card.location;

  const employmentType =
    $('li.description__job-criteria-item')
      .filter((_i, el) =>
        $(el).find('h3').text().toLowerCase().includes('employment type')
      )
      .find(SELECTORS.detailEmploymentType)
      .text()
      .trim() || null;

  const experienceLevel =
    $('li.description__job-criteria-item')
      .filter((_i, el) =>
        $(el).find('h3').text().toLowerCase().includes('seniority level')
      )
      .find(SELECTORS.detailExperienceLevel)
      .text()
      .trim() || null;

  const applicantCount =
    $(SELECTORS.detailApplicants).first().text().trim() || null;

  const postedAge =
    $(SELECTORS.detailPostedAge).first().text().trim() || null;

  const applyUrl =
    $('a.apply-button--offsiteApply').attr('href') ??
    $('a[data-tracking-control-name="public_jobs_apply-link-offsite_sign-up"]').attr('href') ??
    null;

  const easyApply =
    card.easyApply ||
    $(SELECTORS.easyApplyButton).length > 0;

  const locationNormalized = normalizeLocation(locationRaw);
  const isRemote =
    locationRaw.toLowerCase().includes('remote') ||
    locationNormalized.includes('remote');

  const companyNormalized = normalizeCompany(company);
  const titleNormalized = normalizeTitle(title);

  // Skill extraction from description text
  const { matched, standout } = await matchSkills(descriptionText ?? '');

  const now = nowIso();
  const fingerprint = buildFingerprint({ source: 'linkedin', externalId: card.externalId, company, title });

  return {
    source: 'linkedin',
    url: card.url,
    externalId: card.externalId,
    fingerprint,
    firstSeen: now,
    lastSeen: now,

    company,
    companyNormalized,
    isBlacklisted: false, // set by filters layer
    recruiterLike: false, // set by recruiter layer

    title,
    titleNormalized,
    employmentType,
    experienceLevel,

    locationRaw,
    locationNormalized,
    isRemote,

    teaser: card.teaser,
    descriptionHtml,
    descriptionText,

    applyUrl,
    easyApply,

    isBoosted: card.boosted,
    isRepublished: false, // detected in dedupe layer
    legitimacyScore: 100, // adjusted by filters/recruiter layer

    skillsExtracted: [],
    skillsMatched: matched,
    skillsStandout: standout,

    applicantCount,
    postedAge,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the LinkedIn numeric job ID from a job URL.
 * e.g. https://www.linkedin.com/jobs/view/3812345678/ → "3812345678"
 */
function extractJobId(url: string): string | null {
  const match = url.match(/\/jobs\/view\/(\d+)/);
  return match?.[1] ?? null;
}

/**
 * Scroll down the page incrementally to trigger lazy-loaded cards.
 */
async function autoScroll(page: import('patchright').Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let totalHeight = 0;
      const distance = 400;
      const timer = setInterval(() => {
        // TODO: scroll
      }, 150);
    });
  });
  // Brief pause after scrolling to let any lazy content settle.
  await new Promise((r) => setTimeout(r, 1_000));
}