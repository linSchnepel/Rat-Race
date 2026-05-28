const RECRUITER_COMPANY_PATTERNS: RegExp[] = [
  /\bstaffing\b/i,
  /\brecruiting\b/i,
  /\brecruitment\b/i,
  /\btalent\s+solutions\b/i,
  /\btalent\s+acquisition\b/i,
  /\bheadhunt/i,
  /\bexecutive\s+search\b/i,
  /\bplacement\s+firm\b/i,
  /\bworkforce\s+solutions\b/i,
  /\bmanpower\b/i,
  /\bkforce\b/i,
  /\brandstad\b/i,
  /\badecco\b/i,
  /\btek\s+systems\b/i,
  /\binsight\s+global\b/i,
  /\bcyber\s+coders\b/i,
  /\broberthalf\b/i,
  /\bpersol\b/i,
  /\bmodis\b/i,
  /\bvaco\b/i,
];

const RECRUITER_TITLE_PATTERNS: RegExp[] = [
  /\brecruiter\b/i,
  /\btalent\s+partner\b/i,
  /\bsourcer\b/i,
];

export function isRecruiterLike(company: string, title: string): boolean {
  return (
    RECRUITER_COMPANY_PATTERNS.some((p) => p.test(company)) ||
    RECRUITER_TITLE_PATTERNS.some((p) => p.test(title))
  );
}

export function recruiterScore(company: string, title: string, description: string): number {
  let score = 0;

  if (RECRUITER_COMPANY_PATTERNS.some((p) => p.test(company))) score += 50;
  if (RECRUITER_TITLE_PATTERNS.some((p) => p.test(title))) score += 30;

  const descLower = description.toLowerCase();
  if (descLower.includes('our client')) {
    score += 15;
  }

  if (descLower.includes('on behalf of')) {
    score += 10;
  }

  if (descLower.includes('contract to hire')) {
    score += 5;
  }
  
  if (descLower.includes('w2') || descLower.includes('c2c')) {
    score += 5;
  }

  return Math.min(score, 100);
}