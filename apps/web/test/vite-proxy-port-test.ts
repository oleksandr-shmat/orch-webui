// Regression: Vite dev proxy must target apps/server default PORT (4317), not 3001.
// Found by QA checklist redo on 2026-08-03.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const serverPortFile = join(webRoot, '../server/src/server.ts');
const viteConfig = readFileSync(join(webRoot, 'vite.config.ts'), 'utf8');
const serverSrc = readFileSync(serverPortFile, 'utf8');

const portMatch = serverSrc.match(/PORT\s*=\s*Number\(process\.env\.PORT\s*\?\?\s*(\d+)\)/);
if (!portMatch) throw new Error('Could not parse default PORT from server.ts');
const defaultPort = portMatch[1];

if (!viteConfig.includes(`127.0.0.1:${defaultPort}`)) {
  throw new Error(`vite.config.ts proxy must target 127.0.0.1:${defaultPort}`);
}

console.log(`Vite proxy port regression check passed (target :${defaultPort})`);
