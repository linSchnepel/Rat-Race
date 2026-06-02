export interface ExperienceRange {
  min: number;
  max: number | null;
  raw: string;
}

export function parseExperience(text: string): ExperienceRange | null {
  if (!text) return null;

  // Looks for # years ... experience in a simple way
  const pattern =
    /(\d+)\s*[–\-]\s*(\d+)\s+years?(?:[^.]{0,60}experience)|(\d+)\+?\s+years?(?:[^.]{0,60}experience)/gi;

  const matches: ExperienceRange[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match[1] !== undefined && match[2] !== undefined) {
      // 0–4 years
      matches.push({
        min: parseInt(match[1], 10),
        max: parseInt(match[2], 10),
        raw: match[0].trim(),
      });
    } else if (match[3] !== undefined) {
      // 3+ years
      matches.push({
        min: parseInt(match[3], 10),
        max: null,
        raw: match[0].trim(),
      });
    }
  }

  if (matches.length === 0) return null;

  // Minimum number of years
  return matches.reduce((lowest, curr) =>
    curr.min < lowest.min ? curr : lowest
  );
}

export function formatExperience(e: ExperienceRange): string {
  if (e.max !== null) return `${e.min}–${e.max} yrs`;
  return `${e.min}+ yrs`;
}