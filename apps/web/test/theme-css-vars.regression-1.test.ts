// Regression: live app must expose PrimeVue theme CSS variables on :root (.orch-dark).
// — broken when theme not passed to app.use(PrimeVue).
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function run(cmd: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: 'inherit', shell: true });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

async function waitForServer(url: string, timeoutMs = 30_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Server did not become ready at ${url}`);
}

async function main() {
  await run('npm', ['run', 'build'], webRoot);

  const preview = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], {
    cwd: webRoot,
    stdio: 'pipe',
    shell: true,
  });

  try {
    await waitForServer('http://127.0.0.1:4173/');

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });

    const vars = await page.evaluate(() => {
      const root = document.documentElement;
      const styles = getComputedStyle(root);
      return {
        fontSans: styles.getPropertyValue('--p-font-sans').trim(),
        textSm: styles.getPropertyValue('--p-text-sm').trim(),
        surface900: styles.getPropertyValue('--p-surface-900').trim(),
        bodyFont: getComputedStyle(document.body).fontFamily,
        bodySize: getComputedStyle(document.body).fontSize,
      };
    });

    await browser.close();

    if (!vars.fontSans.includes('IBM Plex Sans')) {
      throw new Error(`--p-font-sans missing IBM Plex Sans, got: ${JSON.stringify(vars.fontSans)}`);
    }
    if (!vars.textSm) {
      throw new Error('--p-text-sm is empty on :root');
    }
    if (!vars.surface900 || !vars.surface900.startsWith('#')) {
      throw new Error(`--p-surface-900 invalid: ${JSON.stringify(vars.surface900)}`);
    }
    if (!vars.bodyFont.includes('IBM Plex Sans')) {
      throw new Error(`body font-family not IBM Plex Sans: ${vars.bodyFont}`);
    }

    console.log('Theme CSS variables regression check passed', vars);
  } finally {
    preview.kill('SIGTERM');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
