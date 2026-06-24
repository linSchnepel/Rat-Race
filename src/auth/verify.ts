import { getPage } from '../browser.js';
import { saveSessionState, loadSessionState } from './session.js';
import { logger } from '../utils/logger.js';
import { createHash } from 'crypto';


// Re-verify the session at most once per hour
const SESSION_TTL_MS = 60 * 60 * 1000;

export async function ensureLinkedInSession(): Promise<void> {
  const state = await loadSessionState();

  if (state.lastVerified !== null && Date.now() - state.lastVerified < SESSION_TTL_MS) {
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

  if (state.lastVerified !== null && Date.now() - state.lastVerified < SESSION_TTL_MS) {
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

  if (state.lastVerified !== null && Date.now() - state.lastVerified < SESSION_TTL_MS) {
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
        throw new Error('The website is redirect-looping. li_at cookie is invalid or expired.');
      }

      throw err;
    }

    const finalUrl = page.url();

    if (finalUrl.includes(loginFragment)) {
      throw new Error('The website redirected to login page. li_at cookie has expired.');
    }

    if (response && !response.ok()) {
      throw new Error(`/feed returned HTTP ${response.status()}. The session may be rate-limited or account may be restricted.`);
    }

    logger.debug(`Session OK. Landed on: ${finalUrl}`);
  } finally {
    await page.close();
  }
}
