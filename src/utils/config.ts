// src/utils/config.ts
import { readFileSync } from 'fs';
import { join } from 'path';
import { projectRoot } from './paths.js';

interface Config {
  LINKEDIN_SEARCH_URL?: string;
  LINKEDIN_SEARCH_URL_2?: string;
  INDEED_SEARCH_URL?: string;
  ZIPRECRUITER_SEARCH_URL?: string;
  ASHBY_SEARCH_URL?: string;
  GREENHOUSE_SEARCH_URL?: string;
  LEVER_SEARCH_URL?: string;
  LOG_LEVEL?: string;
  TZ?: string;
}

let _config: Config | null = null;

export function loadConfig(): Config {
  if (_config) return _config;
  try {
    _config = JSON.parse(readFileSync(join(projectRoot, 'data', 'config.json'), 'utf8'));
    return _config!;
  } catch {
    return {};
  }
}