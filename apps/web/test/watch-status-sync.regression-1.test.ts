// Regression: watching/idle pill must sync from GET .../orchestrator/watch/status on refresh and workspace switch.
// Symptom: after page reload or switching workspaces, pill stuck on IDLE even when server has watching: true.
// Found by QA on 2026-08-03 (tsk_DTGgJZ1).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const clientTs = readFileSync(join(webRoot, 'src/api/client.ts'), 'utf8');
const storeTs = readFileSync(join(webRoot, 'src/stores/workspace.ts'), 'utf8');

if (!/async getWatchStatus\s*\(/.test(clientTs)) {
  throw new Error('client.ts must expose getWatchStatus(workspaceId)');
}

if (!/\/orchestrator\/watch\/status/.test(clientTs)) {
  throw new Error('getWatchStatus must call GET /orchestrator/watch/status');
}

if (!/async function syncWatchStatus/.test(storeTs)) {
  throw new Error('workspace store must define syncWatchStatus');
}

if (!/api\.getWatchStatus/.test(storeTs)) {
  throw new Error('syncWatchStatus must call api.getWatchStatus');
}

if (!/activeWorkspaceId\.value === workspaceId/.test(storeTs)) {
  throw new Error('syncWatchStatus must guard against stale responses with activeWorkspaceId');
}

if (!/void syncWatchStatus\(activeWorkspaceId\.value\)/.test(storeTs)) {
  throw new Error('fetchWorkspaces must sync watch when stored active workspace is still valid (refresh path)');
}

if (!/await syncWatchStatus\(resolvedId\)/.test(storeTs)) {
  throw new Error('fetchWorkspaces must await syncWatchStatus after resolving active workspace on refresh');
}

if (!/void syncWatchStatus\(id\)/.test(storeTs)) {
  throw new Error('selectWorkspace must reconcile watch state via syncWatchStatus');
}

// selectWorkspace must not leave watch state at hardcoded false without async reconcile
if (
  /function selectWorkspace[\s\S]*?isWatchRunning\.value = false;[\s\S]*?\}/.test(storeTs) &&
  !/void syncWatchStatus\(id\)/.test(storeTs)
) {
  throw new Error('selectWorkspace sets isWatchRunning false without calling syncWatchStatus');
}

console.log('Watch status sync regression check passed');
