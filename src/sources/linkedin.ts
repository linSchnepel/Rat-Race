import { load } from 'cheerio';
import type { Page } from 'patchright';
import { getPage } from '../browser.js';
import { normalizeCompany, normalizeTitle, normalizeLocation, normalizeUrl } from '../core/normalize.js';
import { buildFingerprint, buildFuzzyFingerprint  } from '../core/fingerprint.js';
import { matchSkills } from '../core/skills.js';
import { nowIso, randomDelay } from '../utils/dates.js';
import { logger } from '../utils/logger.js';
import type { JobCard, JobRecord } from '../core/types.js';
import { readJobs } from '../storage/jobsFile.js';
import { parseSalary } from '../utils/salary.js';
import { parseExperience } from '../utils/experience.ts';

const SELECTORS = {
  // Left panel
  cardContainer:  'li[data-occludable-job-id]',
  cardLink:       'a.job-card-container__link',
  cardTitle:      'a.job-card-list__title--link strong',
  cardCompany:    'div.artdeco-entity-lockup__subtitle span',
  cardLocation:   'div.artdeco-entity-lockup__caption li span',
  easyApplyBadge: 'ul.job-card-list__footer-wrapper li span',

  // Right panel
  detailPanel:       'div.jobs-search__job-details--wrapper',
  detailTitle:       'div.job-details-jobs-unified-top-card__job-title h1',
  detailCompany:     'div.job-details-jobs-unified-top-card__company-name',
  detailMeta:        'div.job-details-jobs-unified-top-card__tertiary-description-container span.tvm__text',
  detailPills:       'div.job-details-fit-level-preferences button span',
  detailDescription: 'div#job-details',
  easyApplyButton:   'button.jobs-apply-button[data-job-id]',
  detailApplyLink:   'a.jobs-apply-button--top-card, a[data-tracking-control-name*="apply"]',
  repostedSignal:    'div.job-details-jobs-unified-top-card__tertiary-description-container',

  // Pagination
  paginationNext: 'button.jobs-search-pagination__button--next',
};

export async function fetchAndHydrateAllCards(searchUrl: string): Promise<JobRecord[]> {
  const page = await getPage();
  const allJobs: JobRecord[] = [];

  try {
    logger.debug(`Navigating to search URL: ${searchUrl}`);
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    const landedUrl = page.url();
    logger.info(`Landed on: ${landedUrl}`);

    if (landedUrl.includes('/login') || landedUrl.includes('/authwall')) {
      const cookies = await page.context().cookies('https://www.linkedin.com');
      const liAt = cookies.find((c) => c.name === 'li_at');

      logger.warn(`Auth redirect. li_at present: ${!!liAt}`);
      throw new Error(`LinkedIn redirected to auth page. Run \`npm run setup\` to refresh your session.`);
    }

    let pageNum = 1;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      logger.info(`Processing listing page ${pageNum}…`);

      // Wait for cards to appear on this page
      await page.waitForSelector(SELECTORS.cardContainer, { timeout: 15_000 }).catch(() => {
        logger.warn('No cards found on this page.');
      });

      await scrollJobList(page);

      const html = await page.content().catch(() => '');
      const cards = parseListingCards(html);
      logger.info(`Page ${pageNum}: found ${cards.length} cards.`);

      // Early stopper
      const history = await readJobs();
      const historicFingerprints = new Set(history.map((j) => j.fingerprint));
      const historicFuzzy = new Set(history.map((j) =>
        buildFuzzyFingerprint({ source: j.source, company: j.company, title: j.title })
      ));

      const newCards = cards.filter((card) => {
        const fp = buildFingerprint({ source: 'linkedin', externalId: card.externalId, company: card.company, title: card.title });
        const fuzzy = buildFuzzyFingerprint({ source: 'linkedin', company: card.company, title: card.title });
        return !historicFingerprints.has(fp) && !historicFuzzy.has(fuzzy);
      });

      logger.info(`Page ${pageNum}: ${newCards.length}/${cards.length} cards are new.`);

      if (newCards.length === 0) {
        logger.info('All cards on this page already seen. Stopping pagination early.');
        break;
      }

      // For each card, click it and read the right panel
      for (const card of newCards) {
        try {
          const job = await hydrateViaPanel(page, card);
          if (job) allJobs.push(job);
        } catch (err) {
          logger.warn(`Failed to hydrate LinkedIn ${card.externalId}: ${err instanceof Error ? err.message : String(err)}`);
        }
        await randomDelay(800, 2_000);
      }

      const advanced = await clickNextPage(page);
      if (!advanced) {
        logger.info('No more pages.');
        break;
      }

      pageNum++;
      await randomDelay(2_000, 4_000);
    }
  } finally {
    await page.close();
  }

  return allJobs;
}

// Scroll the left-panel job list to trigger lazy loading of all cards
async function scrollJobList(page: Page): Promise<void> {
  const MAX_SCROLLS = 20;
  const SCROLL_PX   = 600;
  const TICK_MS     = 300;

  const listPanel = page.locator('div.scaffold-layout__list').first();
  const box = await listPanel.boundingBox().catch(() => null);

  if (!box) {
    logger.warn('Could not find scaffold-layout__list bounding box. SCROLL SKIPPED.');
    return;
  }

  // Wheel events are captured by this scroll container and not the detail pane
  const targetX = box.x + box.width / 2;
  const targetY = box.y + 100;
  await page.mouse.move(targetX, targetY);

  for (let i = 0; i < MAX_SCROLLS; i++) {
    await page.mouse.wheel(0, SCROLL_PX);
    await page.waitForTimeout(TICK_MS);
  }

  await page.waitForTimeout(800);
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
      logger.debug(`Card parse error: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  return cards;
}

function parseCard($: ReturnType<typeof load>, el: ReturnType<typeof $>[0], fetchedAt: string): JobCard | null {
  const $el = $(el);

  const externalId = $el.attr('data-occludable-job-id')?.trim() ?? '';
  if (!externalId) {
    return null;
  }

  const rawHref = $el.find(SELECTORS.cardLink).first().attr('href') ?? '';
  const url = normalizeUrl(rawHref) || `https://www.linkedin.com/jobs/view/${externalId}/`;
  const title = $el.find(SELECTORS.cardTitle).first().text().trim();
  const company = $el.find(SELECTORS.cardCompany).first().text().trim();
  const location = $el.find(SELECTORS.cardLocation).first().text().trim();

  if (!title || !company) {
    return null;
  }

  const easyApply = $el
    .find(SELECTORS.easyApplyBadge)
    .toArray()
    .some((node) => $(node).text().trim().toLowerCase().includes('easy apply'));

  return {
    source: 'linkedin',
    url,
    externalId,
    title,
    company,
    location,
    teaser: null,
    easyApply,
    boosted: false,
    fetchedAt,
  };
}

async function hydrateViaPanel(page: Page, card: JobCard): Promise<JobRecord | null> {
  logger.debug(`Clicking card ${card.externalId} - ${card.title} @ ${card.company}`);

  // Click the card's title link in the left panel
  const cardLocator = page.locator(`li[data-occludable-job-id="${card.externalId}"]`);

  await cardLocator.scrollIntoViewIfNeeded({ timeout: 5_000 }).catch(() => {});

  await cardLocator.locator(SELECTORS.cardLink).first().click({ timeout: 5_000 });

  await page
    .waitForSelector(SELECTORS.detailDescription, { timeout: 10_000 })
    .catch(() => logger.debug(`Detail panel timeout for ${card.externalId}`));

  await page
    .waitForSelector(`${SELECTORS.easyApplyButton}[data-job-id="${card.externalId}"], div.jobs-search__job-details--wrapper`, { timeout: 5_000 })
    .catch(() => {});

  const html = await page.content().catch(() => '');
  if (!html) {
    return null;
  }

  return await parseDetailPane(card, html);
}

async function parseDetailPane(card: JobCard, html: string): Promise<JobRecord | null> {
  logger.debug(`Parsing detail pane for ${card.externalId} - ${card.title} @ ${card.company}`);
  const $ = load(html);

  const descriptionHtml = $(SELECTORS.detailDescription).html()?.trim() ?? null;
  const descriptionText = $(SELECTORS.detailDescription).text(); //? $(SELECTORS.detailDescription).text().replace(/\s+/g, ' ').trim() : null;

  const title   = $(SELECTORS.detailTitle).first().text().trim()   || card.title;
  const company = $(SELECTORS.detailCompany).first().text().trim() || card.company;

  // Meta spans: [location] [·] [posted age] [·] [applicants] ...
  const metaSpans = $(SELECTORS.detailMeta)
    .toArray()
    .map((el) => $(el).text().trim())
    .filter(Boolean);

  const locationRaw    = metaSpans[0] ?? card.location;
  const postedAge      = metaSpans.find((s) => /\d+\s+(minute|hour|day|week|second)s?\s+ago/i.test(s)) ?? null;
  const applicantCount = metaSpans.find((s) => /applicant/i.test(s) || /people clicked apply/i.test(s)) ?? null;

  const metaText  = $(SELECTORS.repostedSignal).text().toLowerCase();
  const isReposted = metaText.includes('reposted');
  const isBoosted  = metaText.includes('promoted by hirer');

  // salary / employment type / remote
  const pills = $(SELECTORS.detailPills)
    .toArray()
    .map((el) => $(el).text().trim())
    .filter(Boolean);

  const salaryPill = pills.find((p) => /\$|\d+[Kk]/.test(p)) ?? null;
  const salary = salaryPill ? parseSalary(salaryPill) : parseSalary(descriptionText ?? '');

  const experience = parseExperience(descriptionText ?? '');

  const employmentType =
    pills.find((p) => /^(full.time|part.time|contract|temporary|internship|volunteer|other)$/i.test(p)) ?? null;

  const easyApply  = card.easyApply || $(SELECTORS.easyApplyButton).length > 0;
  const applyUrl   = $(SELECTORS.detailApplyLink).attr('href') ?? null;

  const locationNormalized = normalizeLocation(locationRaw);
  const isRemote = /remote/i.test(locationRaw) || /remote/i.test(locationNormalized);

  const companyNormalized = normalizeCompany(company);
  const titleNormalized   = normalizeTitle(title);

  const { matched, standout } = await matchSkills(descriptionText ?? '');
  const now         = nowIso();
  const fingerprint = buildFingerprint({ source: 'linkedin', externalId: card.externalId, company, title });
  logger.debug(`Hydrated ${card.externalId}: ${title} @ ${company} - matched skills: ${matched.length}, standout skills: ${standout.length}`);

  return {
    source: 'linkedin',
    url: card.url,
    externalId: card.externalId,
    fingerprint,
    firstSeen: now,
    lastSeen: now,

    company,
    companyNormalized,
    isBlacklisted: false,
    recruiterLike: false,

    title,
    titleNormalized,
    employmentType,

    locationRaw,
    locationNormalized,
    isRemote,

    teaser: card.teaser,
    descriptionHtml,
    descriptionText,

    applyUrl,
    easyApply,

    isBoosted,
    isRepublished: isReposted,
    legitimacyScore: 100,

    skillsExtracted: [],
    skillsMatched: matched,
    skillsStandout: standout,

    experience,
    salary: salary,

    applicantCount,
    postedAge,
  };
}

async function clickNextPage(page: Page): Promise<boolean> {
  const nextBtn = page.locator(SELECTORS.paginationNext).first();

  const isDisabled = await nextBtn.isDisabled().catch(() => true);
  const isVisible  = await nextBtn.isVisible().catch(() => false);

  if (!isVisible || isDisabled) {
    return false;
  }

  // Detect when the list refreshes
  const firstCardBefore = await page
    .locator(SELECTORS.cardContainer)
    .first()
    .getAttribute('data-occludable-job-id')
    .catch(() => null);

  await nextBtn.click();

  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(500);
    const firstCardAfter = await page
      .locator(SELECTORS.cardContainer)
      .first()
      .getAttribute('data-occludable-job-id')
      .catch(() => null);

    if (firstCardAfter !== null && firstCardAfter !== firstCardBefore) {
      break;
    }
  }

  return true;
}