import { loadSkills } from '../storage/skillsFile.js';
import { normalizeText } from './normalize.js';

interface MatchResult {
  matched: string[];
  standout: string[];
}

//Match skills from a job description text against the configured skill list
export async function matchSkills(descriptionText: string): Promise<MatchResult> {
  const config = await loadSkills();
  const haystack = normalizeText(descriptionText);

  const matched: string[] = [];
  const standout: string[] = [];

  for (const skill of config.skills) {
    const terms = [skill.name, ...skill.aliases].map(normalizeText);
    const found = terms.some((term) => {
      // Word-boundary match
      const pattern = new RegExp(`\\b${escapeRegex(term)}\\b`);
      return pattern.test(haystack);
    });

    if (found) {
      matched.push(skill.name);
      
      if (skill.standout) {
        standout.push(skill.name);
      }
    }
  }

  return { matched, standout };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}