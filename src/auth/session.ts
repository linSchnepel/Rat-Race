import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { join } from 'path';
import { projectRoot } from '../utils/paths.js';

const __dirname = projectRoot;
const SESSION_FILE = join(__dirname, './data/state.json');

export interface SessionState {
  // Unix ms timestamp
  lastVerified: number | null;
  cookieHash: string | null;
}

const DEFAULT_STATE: SessionState = {
  lastVerified: null,
  cookieHash: null,
};

export async function loadSessionState(): Promise<SessionState> {
  try {
    const raw = await readFile(SESSION_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<SessionState>;

    return {lastVerified: parsed.lastVerified ?? null, cookieHash: parsed.cookieHash ?? null,
    };
  } catch {
    // File doesn't exist yet
    return { ...DEFAULT_STATE };
  }
}

export async function saveSessionState(state: SessionState): Promise<void> {
  await mkdir(dirname(SESSION_FILE), { recursive: true });
  await writeFile(SESSION_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

export async function clearSessionState(): Promise<void> {
  await saveSessionState({ ...DEFAULT_STATE });
}