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

// ---------------------------------------------------------------------------
// Selectors — LinkedIn authenticated SRP as of 2026.
// ---------------------------------------------------------------------------

const SELECTORS = {
  // Left panel — job card list
  cardContainer:  'li[data-occludable-job-id]',
  cardLink:       'a.job-card-container__link',
  cardTitle:      'a.job-card-list__title--link strong',
  cardCompany:    'div.artdeco-entity-lockup__subtitle span',
  cardLocation:   'div.artdeco-entity-lockup__caption li span',
  easyApplyBadge: 'ul.job-card-list__footer-wrapper li span',

  // Right panel — job detail pane (loaded when a card is clicked)
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

// ---------------------------------------------------------------------------
// Main export: fetch ALL pages, hydrate each card on the listing page itself
// ---------------------------------------------------------------------------

/**
 * Navigate to the LinkedIn jobs search URL, page through all results, and
 * for each card click it to load the right-hand detail panel, then parse.
 *
 * Returns fully hydrated JobRecords — no separate hydration step needed.
 * The workflow layer can skip hydrateCard() entirely.
 */
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
      throw new Error(
        `LinkedIn redirected to auth page. Run \`npm run setup\` to refresh your session.`
      );
    }

    let pageNum = 1;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      logger.info(`Processing listing page ${pageNum}…`);

      // Wait for cards to appear on this page.
      await page.waitForSelector(SELECTORS.cardContainer, { timeout: 15_000 }).catch(() => {
        logger.warn('No cards found on this page.');
      });

      // Scroll the LEFT panel to load all lazy cards.
      await scrollJobList(page);

      // Parse all card stubs from the left panel HTML.
      const html = await page.content().catch(() => '');
      const cards = parseListingCards(html);
      logger.info(`Page ${pageNum}: found ${cards.length} cards.`);

      // History check, early stopper
      const history = await readJobs();
      const historicFingerprints = new Set(history.map((j) => j.fingerprint));
      const historicFuzzy = new Set(history.map((j) =>
        buildFuzzyFingerprint({ source: j.source, company: j.company, title: j.title })
      ));

      // Check how many cards on this page are already known
      const newCards = cards.filter((card) => {
        const fp = buildFingerprint({ source: 'linkedin', externalId: card.externalId, company: card.company, title: card.title });
        const fuzzy = buildFuzzyFingerprint({ source: 'linkedin', company: card.company, title: card.title });
        return !historicFingerprints.has(fp) && !historicFuzzy.has(fuzzy);
      });

      logger.info(`Page ${pageNum}: ${newCards.length}/${cards.length} cards are new.`);

      if (newCards.length === 0) {
        logger.info('All cards on this page already seen — stopping pagination early.');
        break;
      }

      // Only hydrate the new ones
      // For each card, click it and read the right panel.
      for (const card of newCards) {
        try {
          const job = await hydrateViaPanel(page, card);
          if (job) allJobs.push(job);
        } catch (err) {
          logger.warn(`Failed to hydrate ${card.externalId}: ${err instanceof Error ? err.message : String(err)}`);
        }
        await randomDelay(800, 2_000);
      }

      // Try to advance to the next page.
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

// ---------------------------------------------------------------------------
// Left panel — scroll to load all cards
// ---------------------------------------------------------------------------

/**
 * Scroll the left-panel job list to trigger lazy loading of all cards.
 *
 * The scrollable element is div.scaffold-layout__list — it has its own
 * independent scroll position separate from the page body. We move the mouse
 * into its bounding box so that mouse.wheel events are captured by it, not
 * the right panel or page body.
 */
async function scrollJobList(page: Page): Promise<void> {
  const MAX_SCROLLS = 20;
  const SCROLL_PX   = 600;
  const TICK_MS     = 300;

  // div.scaffold-layout__list is the actual scrolling container for the left panel.
  const listPanel = page.locator('div.scaffold-layout__list').first();
  const box = await listPanel.boundingBox().catch(() => null);

  if (!box) {
    logger.warn('Could not find scaffold-layout__list bounding box — scroll skipped.');
    return;
  }

  // Position the mouse in the upper-centre of the list panel so wheel events
  // are captured by this scroll container and not the detail pane.
  const targetX = box.x + box.width / 2;
  const targetY = box.y + 100; // near the top, clearly inside the list panel
  await page.mouse.move(targetX, targetY);

  for (let i = 0; i < MAX_SCROLLS; i++) {
    await page.mouse.wheel(0, SCROLL_PX);
    await page.waitForTimeout(TICK_MS);
  }

  // Final pause to let the last batch of lazy-loaded cards render.
  await page.waitForTimeout(800);
}

// ---------------------------------------------------------------------------
// Left panel — parse card stubs
// ---------------------------------------------------------------------------

function parseListingCards(html: string): JobCard[] {
  const $ = load(html);
  const cards: JobCard[] = [];
  const fetchedAt = nowIso();

  $(SELECTORS.cardContainer).each((_i, el) => {
    try {
      const card = parseCard($, el, fetchedAt);
      if (card) cards.push(card);
    } catch (err) {
      logger.debug(`Card parse error: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  return cards;
}

function parseCard(
  $: ReturnType<typeof load>,
  el: ReturnType<typeof $>[0],
  fetchedAt: string
): JobCard | null {
  const $el = $(el);

  const externalId = $el.attr('data-occludable-job-id')?.trim() ?? '';
  if (!externalId) return null;

  const rawHref = $el.find(SELECTORS.cardLink).first().attr('href') ?? '';
  const url = normalizeUrl(rawHref) || `https://www.linkedin.com/jobs/view/${externalId}/`;
  const title = $el.find(SELECTORS.cardTitle).first().text().trim();
  const company = $el.find(SELECTORS.cardCompany).first().text().trim();
  const location = $el.find(SELECTORS.cardLocation).first().text().trim();

  if (!title || !company) return null;

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

// ---------------------------------------------------------------------------
// Right panel — click a card and read the detail pane
// ---------------------------------------------------------------------------

/**
 * Click a job card in the left panel and wait for the right panel to update,
 * then parse the detail pane HTML into a JobRecord.
 * No new page/tab is opened — everything happens on the search results page.
 */
async function hydrateViaPanel(page: Page, card: JobCard): Promise<JobRecord | null> {
  logger.debug(`Clicking card ${card.externalId} — ${card.title} @ ${card.company}`);

  // Click the card's title link in the left panel.
  const cardLocator = page.locator(`li[data-occludable-job-id="${card.externalId}"]`);

  // Scroll the card into view in case it's outside the viewport.
  await cardLocator.scrollIntoViewIfNeeded({ timeout: 5_000 }).catch(() => {});

  await cardLocator.locator(SELECTORS.cardLink).first().click({ timeout: 5_000 });

  // Wait for the right panel to load the matching job's description.
  await page
    .waitForSelector(SELECTORS.detailDescription, { timeout: 10_000 })
    .catch(() => logger.debug(`Detail panel timeout for ${card.externalId}`));

  // Also wait for the detail panel to show this specific job (not a stale one).
  await page
    .waitForSelector(`${SELECTORS.easyApplyButton}[data-job-id="${card.externalId}"], div.jobs-search__job-details--wrapper`, { timeout: 5_000 })
    .catch(() => {});

  const html = await page.content().catch(() => '');
  if (!html) return null;

  return await parseDetailPane(card, html);
}

// ---------------------------------------------------------------------------
// Right panel — parse detail pane
// ---------------------------------------------------------------------------

async function parseDetailPane(card: JobCard, html: string): Promise<JobRecord | null> {
  const $ = load(html);

  const descriptionHtml = $(SELECTORS.detailDescription).html()?.trim() ?? null;
  const descriptionText = $(SELECTORS.detailDescription).text().replace(/\s+/g, ' ').trim() || null;

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

  // Pills: salary / employment type / remote
  const pills = $(SELECTORS.detailPills)
    .toArray()
    .map((el) => $(el).text().trim())
    .filter(Boolean);

  const salaryPill = pills.find((p) => /\$|\d+[Kk]/.test(p)) ?? null;
  const salary = salaryPill ? parseSalary(salaryPill) : parseSalary(descriptionText ?? '');

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
    experienceLevel: null,

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

    salary: salary,

    applicantCount,
    postedAge,
  };
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

/**
 * Click the "Next" pagination button and wait for new cards to load.
 * Returns true if navigation succeeded, false if there is no next page.
 */
async function clickNextPage(page: Page): Promise<boolean> {
  const nextBtn = page.locator(SELECTORS.paginationNext).first();

  const isDisabled = await nextBtn.isDisabled().catch(() => true);
  const isVisible  = await nextBtn.isVisible().catch(() => false);

  if (!isVisible || isDisabled) return false;

  // Capture current first card ID so we can detect when the list refreshes.
  const firstCardBefore = await page
    .locator(SELECTORS.cardContainer)
    .first()
    .getAttribute('data-occludable-job-id')
    .catch(() => null);

  await nextBtn.click();

  // Wait until the first card ID changes — confirms the list has refreshed.
  // Poll via locator instead of waitForFunction to avoid document/window
  // TypeScript lib errors (those globals only exist in browser context).
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(500);
    const firstCardAfter = await page
      .locator(SELECTORS.cardContainer)
      .first()
      .getAttribute('data-occludable-job-id')
      .catch(() => null);
    if (firstCardAfter !== null && firstCardAfter !== firstCardBefore) break;
  }

  return true;
}

// TODO: This should never be called because we hydrate via the panel
// Keep hydrateCard exported for backward compat with workflow — it now
// delegates to the panel approach via a dedicated page.
export async function hydrateCard(card: JobCard): Promise<JobRecord | null> {
  const page = await getPage();
  try {
    await page.goto(card.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForSelector(SELECTORS.detailDescription, { timeout: 10_000 }).catch(() => {});
    const html = await page.content().catch(() => '');
    return html ? await parseDetailPane(card, html) : null;
  } catch (err) {
    logger.warn(`hydrateCard fallback failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  } finally {
    await page.close();
  }
}