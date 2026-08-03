import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test',
  testMatch: 'ui-checklist-a.spec.ts',
  use: {
    baseURL: 'http://127.0.0.1:3000',
  },
  timeout: 60_000,
});
