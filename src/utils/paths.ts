import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const projectRoot: string =
  process.env.RAT_RACE_ROOT ?? join(__dirname, '../..');