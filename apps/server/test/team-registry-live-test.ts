import { execFile } from 'node:child_process';
import { access, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../src/server.js';
import { workspaceManager } from '../src/workspace/WorkspaceManager.js';

const execFileAsync = promisify(execFile);

async function resolveOrchCli(): Promise<string> {
  let directory = dirname(fileURLToPath(import.meta.url));
  while (true) {
    const candidate = join(directory, 'node_modules', '@oxgeneral', 'orch', 'dist', 'cli.js');
    try {
      await access(candidate);
      return candidate;
    } catch {
      const parent = dirname(directory);
      if (parent === directory) throw new Error('Could not locate @oxgeneral/orch CLI binary');
      directory = parent;
    }
  }
}

async function teamRegistryLiveTest(): Promise<void> {
  const sourceRoot = await mkdtemp(join(tmpdir(), 'orch-webui-team-registry-source-'));
  const targetRoot = await mkdtemp(join(tmpdir(), 'orch-webui-team-registry-target-'));
  const cliPath = await resolveOrchCli();
  await Promise.all([sourceRoot, targetRoot].map((cwd) => execFileAsync(process.execPath, [cliPath, 'init'], { cwd })));

  process.env.NODE_ENV = 'test';
  const app = await buildApp();
  const sourceWorkspace = await workspaceManager.register(sourceRoot, 'team-registry-source');
  const targetWorkspace = await workspaceManager.register(targetRoot, 'team-registry-target');

  try {
    const source = await workspaceManager.activate(sourceWorkspace.id);
    const [lead, member] = await Promise.all([
      source.agentService.create({ name: 'Source lead', adapter: 'shell', command: 'true' }),
      source.agentService.create({ name: 'Source member', adapter: 'shell', command: 'true' }),
    ]);
    const sourceTeam = await source.teamService.create({
      name: 'Source team',
      description: 'Original description',
      lead_agent_id: lead.id,
      member_agent_ids: [member.id],
      config: { auto_claim: true },
    });

    const target = await workspaceManager.activate(targetWorkspace.id);
    const targetOnlyAgent = await target.agentService.create({ name: 'Target-only agent', adapter: 'shell', command: 'true' });
    await target.teamService.create({ name: sourceTeam.name, lead_agent_id: targetOnlyAgent.id });

    const collisionResponse = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${targetWorkspace.id}/registry/link-teams`,
      payload: { sourceWorkspaceId: sourceWorkspace.id, teamIds: [sourceTeam.id] },
    });
    if (collisionResponse.statusCode !== 409 || !collisionResponse.json().requiresRename) {
      throw new Error(`team collision did not request a rename: ${collisionResponse.statusCode} ${collisionResponse.body}`);
    }

    const linkResponse = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${targetWorkspace.id}/registry/link-teams`,
      payload: { sourceWorkspaceId: sourceWorkspace.id, teamIds: [sourceTeam.id], renames: { [sourceTeam.id]: 'Source team-linked' } },
    });
    if (linkResponse.statusCode !== 201) throw new Error(`team link failed: ${linkResponse.statusCode} ${linkResponse.body}`);
    const linkId = linkResponse.json().links[0]?.link?.id as string | undefined;
    const targetTeamId = linkResponse.json().links[0]?.team?.id as string | undefined;
    if (!linkId || !targetTeamId) throw new Error('team link did not return a link and target team');

    const linkedTeam = await target.teamService.get(targetTeamId);
    if (linkedTeam.name !== 'Source team-linked' || linkedTeam.members.length !== 2 || linkedTeam.lead_agent_id === lead.id) throw new Error('team link did not remap source membership to target agents');

    const added = await source.agentService.create({ name: 'Source added member', adapter: 'shell', command: 'true' });
    await source.teamService.join(sourceTeam.id, added.id);
    const syncResponse = await app.inject({ method: 'POST', url: `/api/workspaces/${targetWorkspace.id}/registry/sync-team/${linkId}` });
    if (syncResponse.statusCode !== 200 || syncResponse.json().team?.members?.length !== 3 || syncResponse.json().appliedDiff?.addedMemberNames?.[0] !== added.name) {
      throw new Error(`team sync did not auto-link and join a new member: ${syncResponse.statusCode} ${syncResponse.body}`);
    }

    const teamPath = join(sourceRoot, '.orchestry', 'teams', `${sourceTeam.id}.yml`);
    const sourceYaml = await readFile(teamPath, 'utf8');
    await writeFile(teamPath, sourceYaml.replace('name: Source team', 'name: Renamed source team'), 'utf8');
    const driftResponse = await app.inject({ method: 'POST', url: `/api/workspaces/${targetWorkspace.id}/registry/sync-team/${linkId}` });
    const manualOnlyDiff = driftResponse.json().manualOnlyDiff as Array<{ field: string }> | undefined;
    if (driftResponse.statusCode !== 200 || !manualOnlyDiff?.some((change) => change.field === 'name') || (await target.teamService.get(targetTeamId)).name !== 'Source team-linked') {
      throw new Error(`team sync did not report, or silently applied, metadata drift: ${driftResponse.statusCode} ${driftResponse.body}`);
    }

    console.log('Team registry live verification passed');
  } finally {
    await app.close();
    await workspaceManager.forget(sourceWorkspace.id);
    await workspaceManager.forget(targetWorkspace.id);
  }
}

teamRegistryLiveTest().catch((err) => {
  console.error(err);
  process.exit(1);
});
