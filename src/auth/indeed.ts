import { getPage } from '../browser.js';
import { saveSessionState, loadSessionState } from './session.js';
import { logger } from '../utils/logger.js';
import { createHash } from 'crypto';

const PROFILE_URL = 'https://profile.indeed.com/?hl=en_US&co=US';
const LOGIN_URL_FRAGMENT = '/auth?';

// Re-verify the session at most once per hour even across poll cycles.
const SESSION_TTL_MS = 60 * 60 * 1000;

export async function ensureIndeedSession(): Promise<void> {
  const state = await loadSessionState();

  // Skip re-verification if we checked recently.
  if (
    state.lastVerified !== null &&
    Date.now() - state.lastVerified < SESSION_TTL_MS
  ) {
    logger.debug('Session still valid (within TTL). Skipping re-verification.');
    return;
  }

  logger.info('Verifying Indeed session…');
  await verifySession();

  await saveSessionState({
    lastVerified: Date.now(),
    cookieHash: null,
  });

  logger.info('Session verified successfully.');
}

/**
 * Navigate to profile and assert we are not redirected to /login.
 * Throws a descriptive error if the session cookie is expired or invalid.
 */
async function verifySession(): Promise<void> {
  const page = await getPage();

  try {
    let response;
    try {
      response = await page.goto(PROFILE_URL, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('ERR_TOO_MANY_REDIRECTS')) {
        throw new Error(
          'Indeed is redirect-looping — your li_at cookie is invalid or expired. ' +
            'Log in to indeed.com in your real browser, then copy the fresh ' +
            'li_at value from DevTools → Application → Cookies → indeed.com ' +
            'into your INDEED_LI_AT env var.'
        );
      }
      throw err;
    }

    const finalUrl = page.url();

    if (finalUrl.includes(LOGIN_URL_FRAGMENT)) {
      throw new Error(
        'Indeed redirected to login page. ' +
          'Your li_at cookie has expired. ' +
          'Log in to indeed.com in your real browser, then copy the fresh ' +
          'li_at value from DevTools → Application → Cookies → indeed.com ' +
          'into your INDEED_LI_AT env var.'
      );
    }

    if (response && !response.ok()) {
      throw new Error(
        `Indeed /profile returned HTTP ${response.status()}. ` +
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