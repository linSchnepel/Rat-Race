import { readFile, writeFile, appendFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { JobRecord } from '../core/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const JOBS_FILE = join(__dirname, '../../data/jobs.jsonl');

export async function readJobs(): Promise<JobRecord[]> {
  if (!existsSync(JOBS_FILE)) return [];

  const raw = await readFile(JOBS_FILE, 'utf-8');
  const jobs: JobRecord[] = [];

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    try {
      jobs.push(JSON.parse(trimmed) as JobRecord);
    } catch {
      // Don't crash on a corrupt history file.
    }
  }

  return jobs;
}

// jobs.jsonl
export async function appendJobs(jobs: JobRecord[]): Promise<void> {
  if (jobs.length === 0) return;
  await mkdir(dirname(JOBS_FILE), { recursive: true });
  const lines = jobs.map((j) => JSON.stringify(j)).join('\n') + '\n';
  await appendFile(JOBS_FILE, lines, 'utf-8');
}
