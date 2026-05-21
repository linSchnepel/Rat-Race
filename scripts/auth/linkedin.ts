// Only needed for LinkedIn-specific overrides
import type { Page } from 'patchright';

export async function postLoginHook(page: Page): Promise<void> {
  // Dismiss "Stay signed in?" prompt if it appears
  // await page.locator('button:has-text("Yes")').click({ timeout: 3_000 }).catch(() => {});
}