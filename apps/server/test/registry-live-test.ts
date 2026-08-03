import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
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
    const linkId = linkResponse.json().links[0]?.link?.id as string | undefined;
    if (!linkId) throw new Error('link endpoint did not return a link id');

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

    await sourceContainer.agentService.update(sourceAgent.id, { role: 'Updated source role' });
    const staleResponse = await app.inject({ method: 'GET', url: `/api/workspaces/${targetWorkspace.id}/registry/agent-staleness` });
    const staleResult = staleResponse.json()[0];
    if (staleResponse.statusCode !== 200 || !staleResult?.stale || staleResult.diff?.[0]?.field !== 'role') {
      throw new Error(`staleness endpoint did not report the changed role: ${staleResponse.statusCode} ${staleResponse.body}`);
    }

    const syncResponse = await app.inject({ method: 'POST', url: `/api/workspaces/${targetWorkspace.id}/registry/sync-agent/${linkId}` });
    if (syncResponse.statusCode !== 200 || syncResponse.json().needsRecreate || syncResponse.json().agent?.role !== 'Updated source role') {
      throw new Error(`sync endpoint did not apply the mutable role change: ${syncResponse.statusCode} ${syncResponse.body}`);
    }

    const sourceAgentPath = join(sourceRoot, '.orchestry', 'agents', `${sourceAgent.id}.yml`);
    const sourceAgentYaml = await readFile(sourceAgentPath, 'utf8');
    await writeFile(sourceAgentPath, sourceAgentYaml.replace(/skills:\n\s*- qa/, 'skills:\n  - qa\n  - investigate'), 'utf8');
    const recreateNeededResponse = await app.inject({ method: 'POST', url: `/api/workspaces/${targetWorkspace.id}/registry/sync-agent/${linkId}` });
    if (recreateNeededResponse.statusCode !== 200 || !recreateNeededResponse.json().needsRecreate || recreateNeededResponse.json().recreateDiff?.[0]?.field !== 'skills') {
      throw new Error(`sync endpoint did not expose create-only drift: ${recreateNeededResponse.statusCode} ${recreateNeededResponse.body}`);
    }

    const copiedId = copiedAgent.id;
    await targetContainer.teamService.create({ name: 'Replacement warning team', lead_agent_id: copiedId });
    await targetContainer.taskService.create({ title: 'Replacement warning task', assignee: copiedId });
    const previewResponse = await app.inject({ method: 'GET', url: `/api/workspaces/${targetWorkspace.id}/registry/recreate-agent/${linkId}/preview` });
    if (previewResponse.statusCode !== 200 || !previewResponse.json().hasWarnings || !previewResponse.json().leadTeams?.length || !previewResponse.json().assignedTasks?.length) {
      throw new Error(`recreate preview did not expose destructive warnings: ${previewResponse.statusCode} ${previewResponse.body}`);
    }
    const unconfirmedResponse = await app.inject({ method: 'POST', url: `/api/workspaces/${targetWorkspace.id}/registry/recreate-agent/${linkId}`, payload: {} });
    if (unconfirmedResponse.statusCode !== 409) throw new Error(`recreate without confirmation was accepted: ${unconfirmedResponse.statusCode} ${unconfirmedResponse.body}`);
    const recreateResponse = await app.inject({ method: 'POST', url: `/api/workspaces/${targetWorkspace.id}/registry/recreate-agent/${linkId}`, payload: { confirm: true } });
    if (recreateResponse.statusCode !== 200 || recreateResponse.json().agent?.id === copiedId || recreateResponse.json().agent?.config?.skills?.[1] !== 'investigate') {
      throw new Error(`confirmed recreate did not replace the target agent: ${recreateResponse.statusCode} ${recreateResponse.body}`);
    }
    const recreatedAgentId = recreateResponse.json().agent.id as string;
    const remappedTeam = (await targetContainer.teamService.list()).find((team) => team.name === 'Replacement warning team');
    if (!remappedTeam || remappedTeam.lead_agent_id !== recreatedAgentId) throw new Error('recreate left the team lead pointing at the deleted agent');

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
