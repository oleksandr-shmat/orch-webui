import { ref, computed } from 'vue';
import {
  api,
  type RegistryLinkRecord,
  type AgentStalenessRecord,
  type RegistrySettings,
} from '@/api/client';

export function useRegistry() {
  const links = ref<RegistryLinkRecord[]>([]);
  const stalenessMap = ref<Map<string, AgentStalenessRecord>>(new Map());
  const settings = ref<RegistrySettings>({});
  const isLoading = ref(false);
  const isSyncing = ref(false);

  async function loadRegistry(workspaceId: string) {
    if (!workspaceId) return;
    isLoading.value = true;
    try {
      const [fetchedLinks, fetchedStaleness, fetchedSettings] = await Promise.all([
        api.getRegistryLinks(workspaceId).catch(() => []),
        api.getAgentStaleness(workspaceId).catch(() => []),
        api.getRegistrySettings().catch(() => ({})),
      ]);
      links.value = fetchedLinks;
      settings.value = fetchedSettings;

      const map = new Map<string, AgentStalenessRecord>();
      for (const st of fetchedStaleness) {
        map.set(st.targetAgentId, st);
        map.set(st.linkId, st);
      }
      stalenessMap.value = map;
    } catch (err) {
      console.error('Failed to load registry:', err);
    } finally {
      isLoading.value = false;
    }
  }

  function getStalenessForAgent(agentId: string): AgentStalenessRecord | undefined {
    return stalenessMap.value.get(agentId);
  }

  function getLinkForAgent(agentId: string): RegistryLinkRecord | undefined {
    return links.value.find((l) => l.kind === 'agent' && l.targetEntityId === agentId);
  }

  function getLinkForTeam(teamId: string): RegistryLinkRecord | undefined {
    return links.value.find((l) => l.kind === 'team' && l.targetEntityId === teamId);
  }

  const staleAgentCount = computed(() => {
    return Array.from(stalenessMap.value.values()).filter((s) => s.stale).length;
  });

  async function syncSingleAgent(workspaceId: string, linkId: string) {
    isSyncing.value = true;
    try {
      const res = await api.syncAgent(workspaceId, linkId);
      await loadRegistry(workspaceId);
      return res;
    } finally {
      isSyncing.value = false;
    }
  }

  async function syncSingleTeam(workspaceId: string, linkId: string) {
    isSyncing.value = true;
    try {
      const res = await api.syncTeam(workspaceId, linkId);
      await loadRegistry(workspaceId);
      return res;
    } finally {
      isSyncing.value = false;
    }
  }

  async function syncAllOutdated(workspaceId: string) {
    isSyncing.value = true;
    try {
      const agentLinksToSync = links.value.filter((l) => {
        if (l.kind !== 'agent') return false;
        const st = stalenessMap.value.get(l.targetEntityId);
        return st?.stale;
      });

      for (const link of agentLinksToSync) {
        try {
          await api.syncAgent(workspaceId, link.id);
        } catch (e) {
          console.warn(`Failed to sync agent link ${link.id}:`, e);
        }
      }

      const teamLinks = links.value.filter((l) => l.kind === 'team');
      for (const link of teamLinks) {
        try {
          await api.syncTeam(workspaceId, link.id);
        } catch (e) {
          console.warn(`Failed to sync team link ${link.id}:`, e);
        }
      }

      await loadRegistry(workspaceId);
    } finally {
      isSyncing.value = false;
    }
  }

  return {
    links,
    stalenessMap,
    settings,
    isLoading,
    isSyncing,
    staleAgentCount,
    loadRegistry,
    getStalenessForAgent,
    getLinkForAgent,
    getLinkForTeam,
    syncSingleAgent,
    syncSingleTeam,
    syncAllOutdated,
  };
}
