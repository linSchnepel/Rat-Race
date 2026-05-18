import { getPage } from '../browser.js';
import { saveSessionState, loadSessionState } from './session.js';
import { logger } from '../utils/logger.js';
import { createHash } from 'crypto';

const FEED_URL = 'https://www.linkedin.com/feed/';
const LOGIN_URL_FRAGMENT = '/login';

// Re-verify the session at most once per hour even across poll cycles.
const SESSION_TTL_MS = 60 * 60 * 1000;

/**
 * Ensure there is a valid LinkedIn session.
 *
 * 1. Check if the last verified timestamp is still within TTL.
 * 2. If not, navigate to /feed and confirm we land there (not /login).
 * 3. Save updated state on success.
 *
 * Throws if the session is invalid — caller should prompt the user to
 * refresh their LINKEDIN_LI_AT cookie.
 */
export async function ensureLinkedInSession(): Promise<void> {
  const liAt = process.env['LINKEDIN_LI_AT'];
  if (!liAt) {
    throw new Error(
      'LINKEDIN_LI_AT is not set. ' +
        'Copy your li_at cookie from Chrome DevTools → Application → Cookies → linkedin.com.'
    );
  }

  const state = await loadSessionState();
  const cookieHash = hashCookie(liAt);

  // Skip re-verification if cookie hasn't changed and TTL is still valid.
  if (
    state.lastVerified !== null &&
    state.cookieHash === cookieHash &&
    Date.now() - state.lastVerified < SESSION_TTL_MS
  ) {
    logger.debug('Session still valid (within TTL). Skipping re-verification.');
    return;
  }

  logger.info('Verifying LinkedIn session…');
  await verifySession();

  await saveSessionState({
    lastVerified: Date.now(),
    cookieHash,
  });

  logger.info('Session verified successfully.');
}

/**
 * Navigate to /feed and assert we are not redirected to /login.
 * Throws a descriptive error if the session cookie is expired or invalid.
 */
async function verifySession(): Promise<void> {
  const page = await getPage();

  try {
    let response;
    try {
      response = await page.goto(FEED_URL, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('ERR_TOO_MANY_REDIRECTS')) {
        throw new Error(
          'LinkedIn is redirect-looping — your li_at cookie is invalid or expired. ' +
            'Log in to linkedin.com in your real browser, then copy the fresh ' +
            'li_at value from DevTools → Application → Cookies → linkedin.com ' +
            'into your LINKEDIN_LI_AT env var.'
        );
      }
      throw err;
    }

    const finalUrl = page.url();

    if (finalUrl.includes(LOGIN_URL_FRAGMENT)) {
      throw new Error(
        'LinkedIn redirected to login page. ' +
          'Your li_at cookie has expired. ' +
          'Log in to linkedin.com in your real browser, then copy the fresh ' +
          'li_at value from DevTools → Application → Cookies → linkedin.com ' +
          'into your LINKEDIN_LI_AT env var.'
      );
    }

    if (response && !response.ok()) {
      throw new Error(
        `LinkedIn /feed returned HTTP ${response.status()}. ` +
          'The session may be rate-limited or your account may be restricted.'
      );
    }

    logger.debug(`Session OK — landed on: ${finalUrl}`);
  } finally {
    await page.close();
  }
}

function hashCookie(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}