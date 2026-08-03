// Regression: fetchWorkspaces must await watch sync and retry sync when workspace list fetch fails.
// Found by QA on 2026-08-03 (tsk_DTGgJZ1, review redo).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const storeTs = readFileSync(join(webRoot, 'src/stores/workspace.ts'), 'utf8');

if (!/await syncWatchStatus\(resolvedId\)/.test(storeTs)) {
  throw new Error('fetchWorkspaces must await syncWatchStatus(resolvedId) after resolving active workspace');
}

if (!/Failed to fetch workspaces[\s\S]*await syncWatchStatus\(activeWorkspaceId\.value\)/.test(storeTs)) {
  throw new Error('fetchWorkspaces catch path must still sync watch status for stored active workspace');
}

if (!/watchStatusSyncGeneration/.test(storeTs)) {
  throw new Error('syncWatchStatus must use a generation counter to drop stale in-flight responses');
}

if (!/void syncWatchStatus\(activeWorkspaceId\.value\)/.test(storeTs)) {
  throw new Error('store must eagerly sync watch status on init when activeWorkspaceId is restored from storage');
}

console.log('Watch status sync regression-2 check passed');
