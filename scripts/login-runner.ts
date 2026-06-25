import 'dotenv/config';
import { chromium } from 'patchright';
import { mkdir, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { adapters } from './auth/index.js';
import { projectRoot } from '../src/utils/paths.js';

const target = process.argv[2]?.toLowerCase();

if (!target) {
  console.error('No target specified');
  process.exit(1);
}

const adapter = adapters[target];
if (!adapter) {
  console.error(`Unknown adapter: ${target}`);
  process.exit(1);
}

const AUTH_FILE = join(projectRoot, `data/auth/${target}.json`);

async function main() {
    if (!adapter) {
        console.error(`Could not find adapter`);
        process.exit(1);
    }
    const browser = await chromium.launch({ channel: 'chrome', headless: false });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    await page.goto(adapter.loginUrl, { waitUntil: 'domcontentloaded' });

    await page.waitForURL(adapter.waitForUrl, { timeout: 120_000 }).catch(() => {});

    const currentUrl = page.url();
    if (currentUrl.includes('/login') || currentUrl.includes('/authwall')) {
        process.stdout.write('AUTH_FAILED\n');
        await browser.close();
        process.exit(1);
    }

    // Signal to Electron that login is done, waiting for user to confirm
    process.stdout.write('READY_TO_SAVE\n');

    // Wait for Electron to signal us to proceed
    await new Promise<void>((resolve) => {
        process.stdin.resume();
        process.stdin.once('data', () => resolve());
    });

    const state = await context.storageState();
    await mkdir(dirname(AUTH_FILE), { recursive: true });
    await writeFile(AUTH_FILE, JSON.stringify(state, null, 2), 'utf-8');
    await browser.close();

    const cookies = state.cookies.filter((c) =>
        c.domain.includes(new URL(adapter.loginUrl).hostname.replace('www.', ''))
    );

    if (cookies.length === 0) {
        process.stdout.write('SAVE_FAILED\n');
        process.exit(1);
    }

    process.stdout.write('SAVE_OK\n');
    process.exit(0);
}

main().catch((err) => {
  console.error('Login runner failed:', err);
  process.exit(1);
});