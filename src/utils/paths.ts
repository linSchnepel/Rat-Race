import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const projectRoot: string =
  process.env.RAT_RACE_ROOT ?? join(__dirname, '../..');

if (process.env.RAT_RACE_ROOT) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = join(projectRoot, 'browsers');
}