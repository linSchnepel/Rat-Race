import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { projectRoot } from '../utils/paths.js';
import type { RunState } from '../core/types.js';

const __dirname = projectRoot;
const STATE_FILE = join(__dirname, './data/state.json');

const DEFAULT_STATE: RunState = {
  lastRunAt: null,
  lastCursor: null,
};

export async function loadRunState(): Promise<RunState> {
  try {
    const raw = await readFile(STATE_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<RunState>;
    
    return {
      lastRunAt: parsed.lastRunAt ?? null,
      lastCursor: parsed.lastCursor ?? null,
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export async function saveRunState(state: RunState): Promise<void> {
  await mkdir(dirname(STATE_FILE), { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
}