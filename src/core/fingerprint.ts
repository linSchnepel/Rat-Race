import { createHash } from 'crypto';
import { normalizeCompany, normalizeTitle } from './normalize.js';

interface FingerprintInput {
  source: string;
  externalId: string;
  company: string;
  title: string;
}

/**
 * Primary key: source + externalId
 * The company + title are folded in so that if LinkedIn reuses an ID
 * across a true re-post, the fingerprint still differs.
 */
export function buildFingerprint(input: FingerprintInput): string {
  const parts = [
    input.source,
    input.externalId,
    normalizeCompany(input.company),
    normalizeTitle(input.title),
  ].join('::');

  return createHash('sha256').update(parts).digest('hex').slice(0, 20);
}

// Ignores the external ID
export function buildFuzzyFingerprint(input: Omit<FingerprintInput, 'externalId'>): string {
  const parts = [
    input.source,
    normalizeCompany(input.company),
    normalizeTitle(input.title),
  ].join('::');

  return createHash('sha256').update(parts).digest('hex').slice(0, 20);
}