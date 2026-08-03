import { execFile } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { buildApp } from '../src/server.js';
import { workspaceManager } from '../src/workspace/WorkspaceManager.js';

const execFileAsync = promisify(execFile);

async function registryLiveTest(): Promise<void> {
  const sourceRoot = await mkdtemp(join(tmpdir(), 'orch-webui-registry-source-'));
  const targetRoot = await mkdtemp(join(tmpdir(), 'orch-webui-registry-target-'));
  const cliPath = new URL('../../../node_modules/@oxgeneral/orch/dist/cli.js', import.meta.url);
  await Promise.all([sourceRoot, targetRoot].map((cwd) => execFileAsync(process.execPath, [cliPath.pathname, 'init'], { cwd })));

  process.env.NODE_ENV = 'test';
  const app = await buildApp();
  const sourceWorkspace = await workspaceManager.register(sourceRoot, 'registry-source');
  const targetWorkspace = await workspaceManager.register(targetRoot, 'registry-target');

  try {
    const sourceContainer = await workspaceManager.activate(sourceWorkspace.id);
    const sourceAgent = await sourceContainer.agentService.create({
      name: 'Registry source',
      adapter: 'shell',
      role: 'Live endpoint verifier',
      command: 'true',
      model: 'fast',
      effort: 'low',
      approval_policy: 'auto',
      max_turns: 7,
      timeout_ms: 12_000,
      stall_timeout_ms: 4_000,
      env: { CHECK: 'registry' },
      system_prompt: 'Verify link mapping.',
      workspace_mode: 'shared',
      skills: ['qa'],
    });

    const linkResponse = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${targetWorkspace.id}/registry/link-agents`,
      payload: { sourceWorkspaceId: sourceWorkspace.id, agentIds: [sourceAgent.id] },
    });
    if (linkResponse.statusCode !== 201) throw new Error(`link endpoint failed: ${linkResponse.statusCode} ${linkResponse.body}`);

    const targetContainer = await workspaceManager.activate(targetWorkspace.id);
    const copiedAgent = (await targetContainer.agentService.list()).find((agent) => agent.name === sourceAgent.name);
    if (!copiedAgent || copiedAgent.config.system_prompt !== sourceAgent.config.system_prompt || copiedAgent.config.env?.CHECK !== 'registry' || copiedAgent.config.skills?.[0] !== 'qa') {
      throw new Error('created target agent did not preserve the full create-time configuration');
    }

    const collisionResponse = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${targetWorkspace.id}/registry/link-agents`,
      payload: { sourceWorkspaceId: sourceWorkspace.id, agentIds: [sourceAgent.id] },
    });
    if (collisionResponse.statusCode !== 409) throw new Error(`expected duplicate-link conflict, got: ${collisionResponse.statusCode} ${collisionResponse.body}`);

    const settingsResponse = await app.inject({ method: 'PUT', url: '/api/registry/settings', payload: { defaultRegistryWorkspaceId: sourceWorkspace.id } });
    if (settingsResponse.statusCode !== 200 || settingsResponse.json().defaultRegistryWorkspaceId !== sourceWorkspace.id) throw new Error('registry settings endpoint failed');

    console.log('Registry live verification passed');
  } finally {
    await app.close();
    await workspaceManager.forget(sourceWorkspace.id);
    await workspaceManager.forget(targetWorkspace.id);
  }
}

registryLiveTest().catch((err) => {
  console.error(err);
  process.exit(1);
});
