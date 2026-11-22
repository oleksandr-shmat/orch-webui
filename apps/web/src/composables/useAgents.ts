import { ref, computed, watch, type Ref } from 'vue';
import { api, type AgentRecord, getErrorMessage } from '@/api/client';

export interface AgentOption {
  label: string;
  value: string;
}

export function useAgents(
  workspaceId: Ref<string | undefined | null> | (() => string | undefined | null)
) {
  const agents = ref<AgentRecord[]>([]);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  async function loadAgents() {
    const wsId = typeof workspaceId === 'function' ? workspaceId() : workspaceId.value;
    if (!wsId) {
      agents.value = [];
      return;
    }
    isLoading.value = true;
    error.value = null;
    try {
      agents.value = await api.getAgents(wsId);
    } catch (err) {
      console.error('Failed to load agents:', err);
      error.value = getErrorMessage(err) || 'Failed to load agents';
      agents.value = [];
    } finally {
      isLoading.value = false;
    }
  }

  const agentOptions = computed<AgentOption[]>(() => {
    const opts: AgentOption[] = [{ label: 'Unassigned', value: '' }];
    for (const a of agents.value) {
      const label = a.name && a.name !== a.id ? `${a.name} (${a.id})` : a.id;
      opts.push({
        label,
        value: a.id,
      });
    }
    return opts;
  });

  function getAgentOptionsWithFallback(currentAssignee?: string | null): AgentOption[] {
    const base = agentOptions.value;
    if (!currentAssignee) return base;
    if (base.some((o) => o.value === currentAssignee)) return base;
    return [...base, { label: currentAssignee, value: currentAssignee }];
  }

  watch(
    () => (typeof workspaceId === 'function' ? workspaceId() : workspaceId.value),
    (newId) => {
      if (newId) {
        loadAgents();
      } else {
        agents.value = [];
      }
    },
    { immediate: true }
  );

  return {
    agents,
    agentOptions,
    getAgentOptionsWithFallback,
    isLoading,
    error,
    loadAgents,
  };
}
