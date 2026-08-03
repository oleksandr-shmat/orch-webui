// Regression: PrimeVue theme must be passed under `theme` so --p-* CSS variables resolve.
// Symptom: transparent dropdown backgrounds, serif/tiny fallback typography (invalid var()).
// Found by QA on 2026-08-03 (tsk_1TVIHrR).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const mainTs = readFileSync(join(webRoot, 'src/main.ts'), 'utf8');

// PrimeVue install merges options into config; preset/options at top level are ignored.
const passesThemeNested =
  /app\.use\s*\(\s*PrimeVue\s*,\s*\{\s*theme\s*:\s*orchThemeOptions\s*\}\s*\)/.test(mainTs) ||
  /app\.use\s*\(\s*PrimeVue\s*,\s*\{\s*theme\s*:/.test(mainTs);

if (!passesThemeNested) {
  throw new Error(
    'main.ts must register PrimeVue as app.use(PrimeVue, { theme: orchThemeOptions }) — not app.use(PrimeVue, orchThemeOptions)',
  );
}

if (/app\.use\s*\(\s*PrimeVue\s*,\s*orchThemeOptions\s*\)/.test(mainTs)) {
  throw new Error('main.ts passes orchThemeOptions directly; theme CSS variables will not load');
}

console.log('PrimeVue theme registration regression check passed');
