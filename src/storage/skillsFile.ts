import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { SkillConfig } from '../core/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_FILE = join(__dirname, '../../data/skills.json');

const DEFAULT_CONFIG: SkillConfig = { skills: [] };

export async function loadSkills(): Promise<SkillConfig> {
  if (!existsSync(SKILLS_FILE)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const raw = await readFile(SKILLS_FILE, 'utf-8');
    
    return JSON.parse(raw) as SkillConfig;
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function saveSkills(config: SkillConfig): Promise<void> {
  await mkdir(dirname(SKILLS_FILE), { recursive: true });
  await writeFile(SKILLS_FILE, JSON.stringify(config, null, 2), 'utf-8');
}