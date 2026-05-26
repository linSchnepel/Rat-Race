import { getPage } from '../browser.js';
import { saveSessionState, loadSessionState } from './session.js';
import { logger } from '../utils/logger.js';
import { createHash } from 'crypto';


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
  const state = await loadSessionState();

  // Skip re-verification if we checked recently.
  if (
    state.lastVerified !== null &&
    Date.now() - state.lastVerified < SESSION_TTL_MS
  ) {
    logger.debug('Session still valid (within TTL). Skipping re-verification.');
    return;
  }

  logger.info('Verifying LinkedIn session…');
  await verifySession('https://www.linkedin.com/feed/', '/login');

  await saveSessionState({
    lastVerified: Date.now(),
    cookieHash: null,
  });

  logger.info('Session verified successfully.');
}

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
  await verifySession('https://profile.indeed.com/?hl=en_US&co=US', '/auth?');

  await saveSessionState({
    lastVerified: Date.now(),
    cookieHash: null,
  });

  logger.info('Session verified successfully.');
}

export async function ensureZiprecruiterSession(): Promise<void> {
  const state = await loadSessionState();

  // Skip re-verification if we checked recently.
  if (
    state.lastVerified !== null &&
    Date.now() - state.lastVerified < SESSION_TTL_MS
  ) {
    logger.debug('Session still valid (within TTL). Skipping re-verification.');
    return;
  }

  logger.info('Verifying Ziprecruiter session…');
  await verifySession('https://www.ziprecruiter.com/profile', '/authn/login');

  await saveSessionState({
    lastVerified: Date.now(),
    cookieHash: null,
  });

  logger.info('Session verified successfully.');
}

/**
 * Navigate to /feed and assert we are not redirected to /login.
 * Throws a descriptive error if the session cookie is expired or invalid.
 */
async function verifySession(confirmUrl: string, loginFragment: string): Promise<void> {
  const page = await getPage();

  try {
    let response;
    try {
      response = await page.goto(confirmUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('ERR_TOO_MANY_REDIRECTS')) {
        throw new Error(
          'The website is redirect-looping — your li_at cookie is invalid or expired.'
        );
      }
      throw err;
    }

    const finalUrl = page.url();

    if (finalUrl.includes(loginFragment)) {
      throw new Error(
        'The website redirected to login page. ' +
          'Your li_at cookie has expired.'
      );
    }

    if (response && !response.ok()) {
      throw new Error(
        `/feed returned HTTP ${response.status()}. ` +
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