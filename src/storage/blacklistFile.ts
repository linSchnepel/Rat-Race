import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BLACKLIST_FILE = join(__dirname, '../../data/blacklist.json');

interface Blacklist {
  companies: string[];
  patterns: string[];
}

const DEFAULT_BLACKLIST: Blacklist = { companies: [], patterns: [] };

export async function loadBlacklist(): Promise<Blacklist> {
  if (!existsSync(BLACKLIST_FILE)) {
    return { ...DEFAULT_BLACKLIST };
  }

  try {
    const raw = await readFile(BLACKLIST_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<Blacklist>;

    return {
      companies: parsed.companies ?? [],
      patterns: parsed.patterns ?? [],
    };
  } catch {
    return { ...DEFAULT_BLACKLIST };
  }
}

export async function saveBlacklist(blacklist: Blacklist): Promise<void> {
  await mkdir(dirname(BLACKLIST_FILE), { recursive: true });
  await writeFile(BLACKLIST_FILE, JSON.stringify(blacklist, null, 2), 'utf-8');
}

export async function addToBlacklist(company: string): Promise<void> {
  const bl = await loadBlacklist();
  
  if (!bl.companies.includes(company)) {
    bl.companies.push(company);
    await saveBlacklist(bl);
  }
}