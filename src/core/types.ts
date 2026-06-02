// ---------------------------------------------------------------------------
// Raw card extracted from a LinkedIn listing page
// ---------------------------------------------------------------------------

import { ExperienceRange } from "../utils/experience.ts";
import { SalaryRange } from "../utils/salary.ts";

export interface CompanyRecord {
  source: 'google';
  companyName: string;
  jobBoardUrl: string;
  firstSeen: string;
}

export interface JobCard {
  source: 'linkedin' | 'indeed' | 'ziprecruiter';
  url: string;
  externalId: string;
  title: string;
  company: string;
  location: string;
  teaser: string | null;
  easyApply: boolean;
  boosted: boolean;
  fetchedAt: string;
}

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

  experience: ExperienceRange | null;
  salary: SalaryRange | null;

  // Metrics
  applicantCount: string | null;
  postedAge: string | null;
}

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