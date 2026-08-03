import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api, type WorkspaceRecord } from '@/api/client';

const STORAGE_KEY = 'orch_active_workspace_id';

export const useWorkspaceStore = defineStore('workspace', () => {
  const workspaces = ref<WorkspaceRecord[]>([]);
  const activeWorkspaceId = ref<string | null>(localStorage.getItem(STORAGE_KEY));
  const isLoading = ref(false);
  const isInitializing = ref(false);
  const isWatchRunning = ref(false);
  const isWatchLoading = ref(false);
  const lockError = ref<string | null>(null);
  const isBrowseModalOpen = ref(false);

  const activeWorkspace = computed(() => {
    if (!activeWorkspaceId.value) return workspaces.value[0] || null;
    return workspaces.value.find((w) => w.id === activeWorkspaceId.value) || workspaces.value[0] || null;
  });

  const isInitialized = computed(() => {
    const ws = activeWorkspace.value;
    if (!ws) return true;
    if (ws.isInitialized === undefined) return false;
    return ws.isInitialized;
  });

  async function fetchWorkspaces() {
    isLoading.value = true;
    try {
      const list = await api.getWorkspaces();
      workspaces.value = list;
      
      // Auto select first workspace if stored active ID is invalid or null
      if (list.length > 0) {
        if (!activeWorkspaceId.value || !list.some((w) => w.id === activeWorkspaceId.value)) {
          selectWorkspace(list[0].id);
        }
      } else {
        activeWorkspaceId.value = null;
      }
    } catch (err) {
      console.error('Failed to fetch workspaces:', err);
    } finally {
      isLoading.value = false;
    }
  }

  function selectWorkspace(id: string) {
    activeWorkspaceId.value = id;
    localStorage.setItem(STORAGE_KEY, id);
    isWatchRunning.value = false;
    lockError.value = null;
  }

  async function registerAndSelect(projectRoot: string, label?: string) {
    isLoading.value = true;
    try {
      const record = await api.registerWorkspace(projectRoot, label);
      await fetchWorkspaces();
      selectWorkspace(record.id);
      return record;
    } catch (err: any) {
      console.error('Failed to register workspace:', err);
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  async function initActiveWorkspace() {
    const ws = activeWorkspace.value;
    if (!ws) return;
    isInitializing.value = true;
    try {
      const result = await api.initWorkspace(ws.id);
      if (result.workspace) {
        const idx = workspaces.value.findIndex((w) => w.id === result.workspace!.id);
        if (idx >= 0) workspaces.value[idx] = result.workspace;
      }
      await fetchWorkspaces();
    } catch (err: unknown) {
      console.error('Failed to initialize workspace:', err);
      throw err;
    } finally {
      isInitializing.value = false;
    }
  }

  async function toggleWatch() {
    const ws = activeWorkspace.value;
    if (!ws) return;
    isWatchLoading.value = true;
    lockError.value = null;
    try {
      if (isWatchRunning.value) {
        const res = await api.stopWatch(ws.id);
        isWatchRunning.value = res.watching;
      } else {
        const res = await api.startWatch(ws.id);
        isWatchRunning.value = res.watching;
      }
    } catch (err: any) {
      if (err?.data?.error === 'ORCHESTRATOR_LOCKED') {
        lockError.value = err.data.message || 'Orchestrator is locked by another process';
      } else {
        console.error('Failed to toggle watch:', err);
      }
    } finally {
      isWatchLoading.value = false;
    }
  }

  function openBrowseModal() {
    isBrowseModalOpen.value = true;
  }

  function closeBrowseModal() {
    isBrowseModalOpen.value = false;
  }

  return {
    workspaces,
    activeWorkspaceId,
    activeWorkspace,
    isInitialized,
    isLoading,
    isInitializing,
    isWatchRunning,
    isWatchLoading,
    lockError,
    isBrowseModalOpen,
    fetchWorkspaces,
    selectWorkspace,
    registerAndSelect,
    initActiveWorkspace,
    toggleWatch,
    openBrowseModal,
    closeBrowseModal,
  };
});
