import { readFile, appendFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { CompanyRecord } from '../core/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMPANY_FILE = join(__dirname, '../../data/company.jsonl');

export async function readCompanies(): Promise<CompanyRecord[]> {
  if (!existsSync(COMPANY_FILE)) {
    return [];
  }

  const raw = await readFile(COMPANY_FILE, 'utf-8');
  const companies: CompanyRecord[] = [];

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    try {
      companies.push(JSON.parse(trimmed) as CompanyRecord);
    } catch {
      //
    }
  }

  return companies;
}

export async function appendCompanies(companies: CompanyRecord[]): Promise<void> {
  if (companies.length === 0) {
    return;
  }
  
  await mkdir(dirname(COMPANY_FILE), { recursive: true });
  const lines = companies.map((c) => JSON.stringify(c)).join('\n') + '\n';
  await appendFile(COMPANY_FILE, lines, 'utf-8');
}