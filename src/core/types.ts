// ---------------------------------------------------------------------------
// Raw card extracted from a LinkedIn listing page
// ---------------------------------------------------------------------------

import { SalaryRange } from "../utils/salary.ts";

export interface JobCard {
  /** Source platform identifier */
  source: 'linkedin' | 'indeed' | 'ziprecruiter';
  /** Canonical job URL (detail page) */
  url: string;
  /** LinkedIn internal job ID parsed from the URL/card */
  externalId: string;
  /** Display title from the card */
  title: string;
  /** Company name as shown on the card */
  company: string;
  /** Location string as shown on the card */
  location: string;
  /** Short teaser text from the card, if present */
  teaser: string | null;
  /** "Easy Apply" badge present on the card */
  easyApply: boolean;
  /** Whether the card was marked as "Promoted" / "Boosted" */
  boosted: boolean;
  /** ISO string of when this card was first seen in this run */
  fetchedAt: string;
}

// ---------------------------------------------------------------------------
// Hydrated job record after visiting the detail page
// ---------------------------------------------------------------------------

export interface JobRecord {
  // Identity
  source: JobCard['source'];
  url: string;
  externalId: string;
  fingerprint: string;
  firstSeen: string;
  lastSeen: string;

  // Company
  company: string;
  companyNormalized: string;
  isBlacklisted: boolean;
  recruiterLike: boolean;

  // Role
  title: string;
  titleNormalized: string;
  employmentType: string | null;
  experienceLevel: string | null;

  // Location
  locationRaw: string;
  locationNormalized: string;
  isRemote: boolean;

  // Content
  teaser: string | null;
  descriptionHtml: string | null;
  descriptionText: string | null;

  // Apply
  applyUrl: string | null;
  easyApply: boolean;

  // Signals
  isBoosted: boolean;
  isRepublished: boolean;
  legitimacyScore: number; // 0–100

  // Skills
  skillsExtracted: string[];
  skillsMatched: string[];
  skillsStandout: string[];

  salary: SalaryRange | null;

  // Metrics (best-effort; may be null if LinkedIn hides them)
  applicantCount: string | null;
  postedAge: string | null;
}

// ---------------------------------------------------------------------------
// Config / filter types
// ---------------------------------------------------------------------------

export interface FilterConfig {
  blacklistedCompanies: string[];
  blacklistedPatterns: RegExp[];
  requiredTerms: string[];
  blockedTitles: string[];
  allowedLocations: string[];
  requireRemote: boolean;
}

export interface SkillConfig {
  skills: SkillEntry[];
}

export interface SkillEntry {
  name: string;
  aliases: string[];
  standout: boolean;
}

export interface RunState {
  lastRunAt: string | null;
  lastCursor: string | null;
}