export interface WorkspaceRecord {
  id: string;
  projectRoot: string;
  label: string;
  addedAt: string;
  isInitialized?: boolean;
}

export interface BrowseItem {
  name: string;
  path: string;
  isDir: boolean;
  hasOrchestry?: boolean;
}

export interface BrowseDirectoryResponse {
  currentPath: string;
  parentPath: string | null;
  items: BrowseItem[];
}

export interface OrchestratorWatchResponse {
  watching: boolean;
  alreadyWatching?: boolean;
  alreadyStopped?: boolean;
  error?: string;
  message?: string;
  hint?: string;
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorData: any;
    try {
      errorData = await res.json();
    } catch {
      errorData = { error: res.statusText };
    }
    const err = new Error(errorData.message || errorData.error || `HTTP ${res.status}`);
    (err as any).status = res.status;
    (err as any).data = errorData;
    throw err;
  }
  if (res.status === 204) {
    return {} as T;
  }
  return res.json();
}

export const api = {
  async getWorkspaces(): Promise<WorkspaceRecord[]> {
    const res = await fetch('/api/workspaces');
    return handleResponse<WorkspaceRecord[]>(res);
  },

  async registerWorkspace(projectRoot: string, label?: string): Promise<WorkspaceRecord> {
    const res = await fetch('/api/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectRoot, label }),
    });
    return handleResponse<WorkspaceRecord>(res);
  },

  async initWorkspace(workspaceId: string): Promise<{ success: boolean; message?: string }> {
    const res = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    return handleResponse(res);
  },

  async browseDirectory(path?: string): Promise<BrowseDirectoryResponse> {
    const url = path ? `/api/fs/browse?path=${encodeURIComponent(path)}` : '/api/fs/browse';
    try {
      const res = await fetch(url);
      if (res.status === 404) {
        // Fallback for dev/mock if endpoint route is `/api/workspaces/browse`
        const altRes = await fetch(path ? `/api/workspaces/browse?path=${encodeURIComponent(path)}` : '/api/workspaces/browse');
        return handleResponse<BrowseDirectoryResponse>(altRes);
      }
      return handleResponse<BrowseDirectoryResponse>(res);
    } catch (err) {
      // Return minimal local fallback if filesystem browsing backend route isn't ready
      return {
        currentPath: path || '~',
        parentPath: path && path !== '/' ? path.substring(0, path.lastIndexOf('/')) || '/' : null,
        items: [],
      };
    }
  },

  async startWatch(workspaceId: string): Promise<OrchestratorWatchResponse> {
    const res = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/orchestrator/watch/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    return handleResponse<OrchestratorWatchResponse>(res);
  },

  async stopWatch(workspaceId: string): Promise<OrchestratorWatchResponse> {
    const res = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/orchestrator/watch/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    return handleResponse<OrchestratorWatchResponse>(res);
  },

  async runAllTasks(workspaceId: string): Promise<{ accepted: boolean }> {
    const res = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/orchestrator/run-all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    return handleResponse(res);
  },
};
