import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { projectRoot } from './paths.js';

const JOBS_PATH = join(projectRoot, 'data', 'jobs.jsonl');
const BUSINESSES_PATH = join(projectRoot, 'data', 'company.jsonl');
const MAX_AGE_DAYS = 60;

export function senicide(): { removed: number; kept: number } {
    cleanse(BUSINESSES_PATH);
    
    return cleanse(JOBS_PATH);
}

function cleanse(path: string): { removed: number; kept: number } {
  if (!existsSync(path)) return { removed: 0, kept: 0 };

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - MAX_AGE_DAYS);

  const lines = readFileSync(path, 'utf8')
    .split('\n')
    .filter(l => l.trim() !== '');

  const kept: string[] = [];
  let removed = 0;

  for (const line of lines) {
    try {
      const job = JSON.parse(line);
      const jobDate = new Date(job.firstSeen ?? 0);

      if (jobDate >= cutoff) {
        kept.push(line);
      } else {
        removed++;
      }
    } catch {
      // Malformed line
      removed++;
    }
  }

  writeFileSync(path, kept.join('\n') + (kept.length ? '\n' : ''), 'utf8');

  return { removed, kept: kept.length };
}