import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STATE_DIR } from '../../src/paths.js';
import { RegistryStore } from '../../src/registry/RegistryStore.js';

const linkInput = {
  kind: 'agent' as const,
  sourceWorkspaceId: 'ws_src',
  sourceEntityId: 'agt_1',
  targetWorkspaceId: 'ws_dst',
  targetEntityId: 'agt_2',
  lastSyncedSnapshot: { name: 'a' },
};

describe('RegistryStore', () => {
  it('persists links and settings under STATE_DIR and reloads them', async () => {
    const store = new RegistryStore();
    await store.load();
    const link = await store.createLink(linkInput);
    await store.updateSettings({ defaultRegistryWorkspaceId: 'ws_src' });

    expect(JSON.parse(readFileSync(join(STATE_DIR, 'links.json'), 'utf-8')).links).toHaveLength(1);

    const reloaded = new RegistryStore();
    await reloaded.load();
    expect(reloaded.listLinks()).toEqual([link]);
    expect(reloaded.getSettings()).toEqual({ defaultRegistryWorkspaceId: 'ws_src' });
  });

  it('finds links by source/target/kind and filters by target workspace', async () => {
    const store = new RegistryStore();
    await store.load();
    expect(store.findLink('ws_src', 'agt_1', 'ws_dst', 'agent')).toBeDefined();
    expect(store.findLink('ws_src', 'agt_1', 'ws_dst', 'team')).toBeUndefined();
    expect(store.listLinks('ws_other')).toEqual([]);
  });

  it('updates snapshot and target id of an existing link', async () => {
    const store = new RegistryStore();
    await store.load();
    const [link] = store.listLinks();
    const updated = await store.updateLinkSnapshot(link.id, { name: 'b' });
    expect(updated?.lastSyncedSnapshot).toEqual({ name: 'b' });
    expect((await store.replaceTargetEntityId(link.id, 'agt_9'))?.targetEntityId).toBe('agt_9');
    expect(await store.updateLinkSnapshot('missing', {})).toBeUndefined();
  });
});
