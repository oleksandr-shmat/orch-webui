/**
 * Manual verification checklist A–E (+ API coverage for F/G agent registry) from
 * .claude/memory/2026-08-03_orch-web-ui.md step 6.
 *
 * Run: npm run test:checklist -w apps/server
 */
import { execFile } from 'node:child_process';
import http from 'node:http';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { buildApp } from '../src/server.js';
import { workspaceManager } from '../src/workspace/WorkspaceManager.js';

const execFileAsync = promisify(execFile);

async function checklistAhLiveTest(): Promise<void> {
  process.env.NODE_ENV = 'test';
  const app = await buildApp();

  const call = async (method: string, url: string, payload?: unknown): Promise<{ status: number; body: unknown }> => {
    const response = await app.inject({ method, url, payload });
    let body: unknown = response.body;
    try {
      body = response.json();
    } catch {
      /* plain text */
    }
    return { status: response.statusCode, body };
  };

  // --- A: uninitialized folder → init → .orchestry on disk ---
  const folderA = await mkdtemp(join(tmpdir(), 'orch-qa-check-a-'));
  const regA = await call('POST', '/api/workspaces', { projectRoot: folderA, label: 'qa-check-a' });
  if (regA.status !== 200) throw new Error(`A register failed: ${regA.status} ${JSON.stringify(regA.body)}`);
  const wsA = (regA.body as { id: string }).id;
  if (existsSync(join(folderA, '.orchestry'))) throw new Error('A: .orchestry should not exist before init');
  const initA = await call('POST', `/api/workspaces/${wsA}/init`);
  if (initA.status !== 200 || !(initA.body as { success?: boolean }).success) {
    throw new Error(`A init failed: ${initA.status} ${JSON.stringify(initA.body)}`);
  }
  if (!existsSync(join(folderA, '.orchestry'))) throw new Error('A: .orchestry was not created on disk after init');
  console.log('Check A (init creates .orchestry): PASS');

  // --- B: task via API ↔ real `orch task list` ---
  await call('POST', `/api/workspaces/${wsA}/activate`);
  const uniqueTitle = `QA checklist B ${Date.now()}`;
  const taskRes = await call('POST', `/api/workspaces/${wsA}/tasks`, { title: uniqueTitle, priority: 3 });
  if (taskRes.status !== 200) throw new Error(`B create task failed: ${taskRes.status}`);
  const taskId = (taskRes.body as { id: string }).id;
  const { stdout } = await execFileAsync('orch', ['task', 'list', '--json'], { cwd: folderA, maxBuffer: 2 * 1024 * 1024 });
  const cliTasks = JSON.parse(stdout) as Array<{ id: string; title: string }>;
  if (!cliTasks.some((t) => t.id === taskId && t.title === uniqueTitle)) {
    throw new Error(`B: CLI did not list task created via API (id=${taskId})`);
  }
  const cliTitle = `CLI-only task ${Date.now()}`;
  await execFileAsync('orch', ['task', 'add', cliTitle, '-p', '4'], { cwd: folderA });
  const apiTasks = (await call('GET', `/api/workspaces/${wsA}/tasks`)).body as Array<{ title: string }>;
  if (!apiTasks.some((t) => t.title === cliTitle)) throw new Error('B: API did not list task created via CLI');
  console.log('Check B (API ↔ CLI same on-disk state): PASS');

  // --- C: shell agent run + SSE agent events (best-effort live orchestrator) ---
  const agentRes = await call('POST', `/api/workspaces/${wsA}/agents`, {
    name: 'QA shell runner',
    adapter: 'shell',
    command: 'echo QA_SHELL_OK',
    role: 'noop',
  });
  if (agentRes.status !== 200) throw new Error(`C agent create failed: ${agentRes.status}`);
  const agentId = (agentRes.body as { id: string }).id;
  const runTaskRes = await call('POST', `/api/workspaces/${wsA}/tasks`, {
    title: 'QA shell run task',
    assignee: agentId,
    priority: 2,
  });
  const runTaskId = (runTaskRes.body as { id: string }).id;

  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  const baseUrl = typeof address === 'string' ? address : `http://127.0.0.1:${address}`;
  const eventsUrl = `${baseUrl}/api/workspaces/${wsA}/events`;
  const seenTypes = new Set<string>();

  const ssePromise = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      req.destroy();
      reject(new Error(`C: SSE timeout; saw: ${[...seenTypes].join(', ') || '(none)'}`));
    }, 60_000);

    const req = http.get(eventsUrl, (res) => {
      let buffer = '';
      res.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8');
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const part of parts) {
          if (!part.trim() || part.startsWith(':')) continue;
          const eventLine = part.split('\n').find((l) => l.startsWith('event:'));
          const eventType = eventLine?.slice(6).trim();
          if (eventType) seenTypes.add(eventType);
        }
        if (seenTypes.has('agent:completed') || seenTypes.has('agent:output')) {
          clearTimeout(timer);
          res.destroy();
          req.destroy();
          resolve();
        }
      });
    });
    req.on('error', (err) => {
      if (seenTypes.has('agent:completed') || seenTypes.has('agent:output')) return;
      reject(err);
    });
  });

  const runRes = await call('POST', `/api/workspaces/${wsA}/orchestrator/tasks/${runTaskId}/run`);
  if (runRes.status !== 200) throw new Error(`C run failed: ${runRes.status} ${JSON.stringify(runRes.body)}`);

  await ssePromise;

  let status = 'in_progress';
  for (let i = 0; i < 60; i++) {
    const taskAfter = await call('GET', `/api/workspaces/${wsA}/tasks/${runTaskId}`);
    status = (taskAfter.body as { status: string }).status;
    if (['review', 'done'].includes(status)) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!['review', 'done'].includes(status)) {
    throw new Error(`C: expected task in review/done after shell run, got ${status}`);
  }
  console.log(`Check C (shell run + SSE + task status): PASS (events: ${[...seenTypes].join(', ')})`);

  // --- D: two workspaces — no task list leak on activate switch ---
  const folderD1 = await mkdtemp(join(tmpdir(), 'orch-qa-check-d1-'));
  const folderD2 = await mkdtemp(join(tmpdir(), 'orch-qa-check-d2-'));
  for (const folder of [folderD1, folderD2]) {
    await execFileAsync('orch', ['init'], { cwd: folder });
  }
  const wsD1 = ((await call('POST', '/api/workspaces', { projectRoot: folderD1 })).body as { id: string }).id;
  const wsD2 = ((await call('POST', '/api/workspaces', { projectRoot: folderD2 })).body as { id: string }).id;
  await call('POST', `/api/workspaces/${wsD1}/activate`);
  await call('POST', `/api/workspaces/${wsD1}/tasks`, { title: 'ONLY_IN_D1', priority: 3 });
  await call('POST', `/api/workspaces/${wsD2}/activate`);
  await call('POST', `/api/workspaces/${wsD2}/tasks`, { title: 'ONLY_IN_D2', priority: 3 });
  const listD2 = (await call('GET', `/api/workspaces/${wsD2}/tasks`)).body as Array<{ title: string }>;
  if (listD2.some((t) => t.title === 'ONLY_IN_D1')) throw new Error('D: workspace D2 leaked D1 task');
  await call('POST', `/api/workspaces/${wsD1}/activate`);
  const listD1 = (await call('GET', `/api/workspaces/${wsD1}/tasks`)).body as Array<{ title: string }>;
  if (listD1.some((t) => t.title === 'ONLY_IN_D2')) throw new Error('D: workspace D1 leaked D2 task');
  console.log('Check D (workspace isolation): PASS');

  // --- E: persist recent workspaces across manager reload ---
  const statePath = join(homedir(), '.orch-webui', 'workspaces.json');
  const before = await readFile(statePath, 'utf8');
  const marker = `qa-persist-${Date.now()}`;
  const folderE = await mkdtemp(join(tmpdir(), 'orch-qa-check-e-'));
  await execFileAsync('orch', ['init'], { cwd: folderE });
  const wsE = ((await call('POST', '/api/workspaces', { projectRoot: folderE, label: marker })).body as { id: string }).id;
  const afterRegister = JSON.parse(await readFile(statePath, 'utf8')) as { workspaces: Array<{ id: string; label: string }> };
  if (!afterRegister.workspaces.some((w) => w.id === wsE && w.label === marker)) {
    throw new Error('E: workspace not persisted to ~/.orch-webui/workspaces.json');
  }
  await app.close();
  const appReloaded = await buildApp();
  const reloadedList = (await appReloaded.inject({ method: 'GET', url: '/api/workspaces' })).json() as Array<{ id: string; label: string }>;
  if (!reloadedList.some((w) => w.id === wsE && w.label === marker)) {
    throw new Error('E: workspace missing after server reload');
  }
  await appReloaded.close();
  await workspaceManager.forget(wsE);
  await writeFile(statePath, before, 'utf8');
  console.log('Check E (recent workspaces persist + survive reload): PASS');

  await Promise.all([
    rm(folderA, { recursive: true, force: true }),
    rm(folderD1, { recursive: true, force: true }),
    rm(folderD2, { recursive: true, force: true }),
    rm(folderE, { recursive: true, force: true }),
  ]);
  console.log('Checklist A–E live verification passed');
}

checklistAhLiveTest().catch((err) => {
  console.error(err);
  process.exit(1);
});
