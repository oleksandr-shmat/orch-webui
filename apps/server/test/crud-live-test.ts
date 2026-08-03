import { execFile } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { buildApp } from '../src/server.js';
import { workspaceManager } from '../src/workspace/WorkspaceManager.js';

const execFileAsync = promisify(execFile);

async function runCrudLiveTest(): Promise<void> {
  const projectRoot = await mkdtemp(join(tmpdir(), 'orch-webui-crud-'));
  const cliPath = new URL('../../../node_modules/@oxgeneral/orch/dist/cli.js', import.meta.url);
  await execFileAsync(process.execPath, [cliPath.pathname, 'init'], { cwd: projectRoot });

  process.env.NODE_ENV = 'test';
  const app = await buildApp();
  const workspace = await workspaceManager.register(projectRoot, 'crud-live-test');
  const base = `/api/workspaces/${workspace.id}`;

  const call = async (method: string, url: string, payload?: unknown): Promise<unknown> => {
    const response = await app.inject({ method, url: `${base}${url}`, payload });
    if (response.statusCode >= 400) throw new Error(`${method} ${url}: ${response.statusCode} ${response.body}`);
    return response.json();
  };

  try {
    const agent = await call('POST', '/agents', { name: 'Verifier', adapter: 'shell', command: 'true' }) as { id: string };
    const task = await call('POST', '/tasks', { title: 'CRUD verification task', assignee: agent.id }) as { id: string };
    const goal = await call('POST', '/goals', { title: 'CRUD verification goal', assignee: agent.id }) as { id: string };
    const team = await call('POST', '/teams', { name: 'Verification team', lead_agent_id: agent.id }) as { id: string };

    await call('POST', `/tasks/${task.id}/assign`, { agentId: agent.id });
    await call('PATCH', `/agents/${agent.id}`, { role: 'verification' });
    await call('POST', `/teams/${team.id}/add-task`, { taskId: task.id });
    await call('POST', '/messages', { channel: 'direct', from_agent_id: agent.id, to_agent_id: agent.id, subject: 'check', body: 'ok' });
    await call('GET', `/goals/${goal.id}/tasks`);
    await call('GET', '/runs');
    console.log('CRUD live verification passed');
  } finally {
    await app.close();
    await workspaceManager.forget(workspace.id);
  }
}

runCrudLiveTest().catch((err) => {
  console.error(err);
  process.exit(1);
});
