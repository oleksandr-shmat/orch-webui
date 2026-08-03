/**
 * UI checklist A: register uninitialized folder via modal → Init button → .orchestry on disk.
 * Requires: `npm run dev -w apps/web` and server on 127.0.0.1:4317.
 *
 * Run: npx playwright test (after `npx playwright install chromium` once).
 */
import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('checklist A: UI init creates .orchestry', async ({ page }) => {
  const folder = await mkdtemp(join(tmpdir(), 'orch-ui-check-a-'));
  const consoleLogs: string[] = [];
  page.on('console', (msg) => consoleLogs.push(msg.text()));
  expect(existsSync(join(folder, '.orchestry'))).toBe(false);

  await page.goto('http://127.0.0.1:3000/');
  await page.getByRole('button', { name: /Select Workspace|▼/ }).first().click();
  await page.getByRole('button', { name: 'Open folder...' }).click();
  await page.getByPlaceholder('/path/to/project').fill(folder);
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden({ timeout: 10_000 });
  await expect(page.locator('.ws-path', { hasText: folder })).toBeVisible({ timeout: 10_000 });

  const initBanner = page.getByText('No .orchestry in workspace');
  await expect(initBanner).toBeVisible({ timeout: 10_000 });
  await page.locator('.init-btn').click();
  await page.waitForTimeout(2000);
  if (!existsSync(join(folder, '.orchestry'))) {
    throw new Error(`Init did not create .orchestry on disk. Console: ${consoleLogs.join(' | ')}`);
  }
  await expect(initBanner).toBeHidden({ timeout: 15_000 });

  expect(existsSync(join(folder, '.orchestry'))).toBe(true);
});
