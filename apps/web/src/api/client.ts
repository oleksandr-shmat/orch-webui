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

export type TaskStatus = 'todo' | 'in_progress' | 'retrying' | 'review' | 'done' | 'failed' | 'cancelled';
export type AgentStatus = 'idle' | 'running' | 'error' | 'disabled';
export type AgentApprovalPolicy = 'auto' | 'suggest' | 'manual';
export type GoalStatus = 'active' | 'paused' | 'achieved' | 'abandoned';
export type RunStatus = 'preparing' | 'running' | 'succeeded' | 'failed' | 'timed_out' | 'cancelled';

export interface TaskRecord {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority?: number;
  assignee?: string;
  goal_id?: string;
  labels?: string[];
  attachments?: string[];
  created_at?: string;
  updated_at?: string;
  result?: {
    output?: string;
    error?: string;
    exit_code?: number;
  };
}

export interface AgentRecord {
  id: string;
  name: string;
  adapter: string;
  status: AgentStatus;
  role?: string;
  command?: string;
  model?: string;
  effort?: string;
  approval_policy?: AgentApprovalPolicy;
  is_autonomous?: boolean;
  autonomous?: boolean;
  skills?: string[];
  created_at?: string;
}

export interface GoalRecord {
  id: string;
  title: string;
  description?: string;
  status: GoalStatus;
  assignee?: string;
  created_at?: string;
}

export interface GoalProgressReport {
  goalId: string;
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  failedTasks: number;
  progressPercent: number;
}

export interface TeamRecord {
  id: string;
  name: string;
  description?: string;
  lead_agent_id: string;
  member_agent_ids?: string[];
  task_ids?: string[];
  config?: {
    auto_claim?: boolean;
  };
}

export interface RunRecord {
  id: string;
  taskId: string;
  agentId: string;
  status: RunStatus;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  exitCode?: number;
}

export interface RegistryLinkRecord {
  id: string;
  kind: 'agent' | 'team';
  sourceWorkspaceId: string;
  sourceEntityId: string;
  targetWorkspaceId: string;
  targetEntityId: string;
  lastSyncedSnapshot: any;
  lastSyncedAt: string;
}

export interface AgentStalenessRecord {
  linkId: string;
  targetAgentId: string;
  stale: boolean;
  sourceMissing?: boolean;
  diff?: Array<{ field: string; sourceValue: any; targetValue: any }>;
}

export interface RegistrySettings {
  defaultRegistryWorkspaceId?: string | null;
}

export interface RecreatePreviewResponse {
  linkId: string;
  targetAgentId: string;
  hasTeamLeadWarning?: boolean;
  runningTasksWarningCount?: number;
  warnings?: string[];
}


/** Fastify rejects `Content-Type: application/json` POSTs with an empty body — send `{}`. */
function postJson(url: string, body?: unknown): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
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

  async initWorkspace(workspaceId: string): Promise<{
    success: boolean;
    alreadyInitialized?: boolean;
    workspace?: WorkspaceRecord;
    message?: string;
  }> {
    const res = await postJson(`/api/workspaces/${encodeURIComponent(workspaceId)}/init`);
    return handleResponse(res);
  },

  async deleteWorkspace(id: string): Promise<void> {
    const res = await fetch(`/api/workspaces/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    return handleResponse<void>(res);
  },

  async browseDirectory(path?: string): Promise<BrowseDirectoryResponse> {
    const url = path ? `/api/fs/browse?path=${encodeURIComponent(path)}` : '/api/fs/browse';
    const res = await fetch(url);
    return handleResponse<BrowseDirectoryResponse>(res);
  },

  async startWatch(workspaceId: string): Promise<OrchestratorWatchResponse> {
    const res = await postJson(`/api/workspaces/${encodeURIComponent(workspaceId)}/orchestrator/watch/start`);
    return handleResponse<OrchestratorWatchResponse>(res);
  },

  async stopWatch(workspaceId: string): Promise<OrchestratorWatchResponse> {
    const res = await postJson(`/api/workspaces/${encodeURIComponent(workspaceId)}/orchestrator/watch/stop`);
    return handleResponse<OrchestratorWatchResponse>(res);
  },

  async runAllTasks(workspaceId: string): Promise<{ accepted: boolean }> {
    const res = await postJson(`/api/workspaces/${encodeURIComponent(workspaceId)}/orchestrator/run-all`);
    return handleResponse(res);
  },

  // Task Endpoints
  async getTasks(workspaceId: string, params?: { status?: TaskStatus; goalId?: string }): Promise<TaskRecord[]> {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.goalId) query.set('goalId', params.goalId);
    const qStr = query.toString() ? `?${query.toString()}` : '';
    const res = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/tasks${qStr}`);
    return handleResponse<TaskRecord[]>(res);
  },

  async getTask(workspaceId: string, taskId: string): Promise<TaskRecord> {
    const res = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/tasks/${encodeURIComponent(taskId)}`);
    return handleResponse<TaskRecord>(res);
  },

  async createTask(workspaceId: string, data: { title: string; description?: string; priority?: number; assignee?: string; labels?: string[]; goal_id?: string }): Promise<TaskRecord> {
    const res = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<TaskRecord>(res);
  },

  async updateTask(workspaceId: string, taskId: string, data: Partial<TaskRecord>): Promise<TaskRecord> {
    const res = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/tasks/${encodeURIComponent(taskId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<TaskRecord>(res);
  },

  async updateTaskStatus(workspaceId: string, taskId: string, status: TaskStatus): Promise<TaskRecord> {
    const res = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/tasks/${encodeURIComponent(taskId)}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    return handleResponse<TaskRecord>(res);
  },

  async assignTask(workspaceId: string, taskId: string, agentId: string): Promise<TaskRecord> {
    const res = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/tasks/${encodeURIComponent(taskId)}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId }),
    });
    return handleResponse<TaskRecord>(res);
  },

  async cancelTask(workspaceId: string, taskId: string): Promise<TaskRecord> {
    const res = await postJson(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/tasks/${encodeURIComponent(taskId)}/cancel`,
    );
    return handleResponse<TaskRecord>(res);
  },

  async retryTask(workspaceId: string, taskId: string): Promise<TaskRecord> {
    const res = await postJson(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/tasks/${encodeURIComponent(taskId)}/retry`,
    );
    return handleResponse<TaskRecord>(res);
  },

  async rejectTask(workspaceId: string, taskId: string, feedback?: string): Promise<TaskRecord> {
    const res = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/tasks/${encodeURIComponent(taskId)}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedback }),
    });
    return handleResponse<TaskRecord>(res);
  },

  async deleteTask(workspaceId: string, taskId: string): Promise<void> {
    const res = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/tasks/${encodeURIComponent(taskId)}`, {
      method: 'DELETE',
    });
    return handleResponse<void>(res);
  },

  async getTaskRuns(workspaceId: string, taskId: string): Promise<RunRecord[]> {
    const res = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/tasks/${encodeURIComponent(taskId)}/runs`);
    return handleResponse<RunRecord[]>(res);
  },

  // Agent Endpoints
  async getAgents(workspaceId: string): Promise<AgentRecord[]> {
    const res = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/agents`);
    return handleResponse<AgentRecord[]>(res);
  },

  async getAgent(workspaceId: string, agentId: string): Promise<AgentRecord> {
    const res = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/agents/${encodeURIComponent(agentId)}`);
    return handleResponse<AgentRecord>(res);
  },

  async updateAgent(workspaceId: string, agentId: string, data: Partial<AgentRecord>): Promise<AgentRecord> {
    const res = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/agents/${encodeURIComponent(agentId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<AgentRecord>(res);
  },

  async enableAgent(workspaceId: string, agentId: string): Promise<AgentRecord> {
    const res = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/agents/${encodeURIComponent(agentId)}/enable`, {
      method: 'POST',
    });
    return handleResponse<AgentRecord>(res);
  },

  async disableAgent(workspaceId: string, agentId: string): Promise<AgentRecord> {
    const res = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/agents/${encodeURIComponent(agentId)}/disable`, {
      method: 'POST',
    });
    return handleResponse<AgentRecord>(res);
  },

  async setAgentAutonomous(workspaceId: string, agentId: string, enabled: boolean): Promise<AgentRecord> {
    const res = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/agents/${encodeURIComponent(agentId)}/autonomous`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    return handleResponse<AgentRecord>(res);
  },

  async setAgentStatus(workspaceId: string, agentId: string, status: AgentStatus): Promise<AgentRecord> {
    const res = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/agents/${encodeURIComponent(agentId)}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    return handleResponse<AgentRecord>(res);
  },

  async deleteAgent(workspaceId: string, agentId: string): Promise<void> {
    const res = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/agents/${encodeURIComponent(agentId)}`, {
      method: 'DELETE',
    });
    return handleResponse<void>(res);
  },

  async getAgentRuns(workspaceId: string, agentId: string): Promise<RunRecord[]> {
    const res = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/agents/${encodeURIComponent(agentId)}/runs`);
    return handleResponse<RunRecord[]>(res);
  },

  // Goal Endpoints
  async getGoals(workspaceId: string): Promise<GoalRecord[]> {
    const res = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/goals`);
    return handleResponse<GoalRecord[]>(res);
  },

  async getGoal(workspaceId: string, goalId: string): Promise<GoalRecord> {
    const res = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/goals/${encodeURIComponent(goalId)}`);
    return handleResponse<GoalRecord>(res);
  },

  async updateGoal(workspaceId: string, goalId: string, data: Partial<GoalRecord>): Promise<GoalRecord> {
    const res = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/goals/${encodeURIComponent(goalId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<GoalRecord>(res);
  },

  async updateGoalStatus(workspaceId: string, goalId: string, status: GoalStatus, force?: boolean): Promise<GoalRecord> {
    const res = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/goals/${encodeURIComponent(goalId)}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, force }),
    });
    return handleResponse<GoalRecord>(res);
  },

  async getGoalTasks(workspaceId: string, goalId: string): Promise<TaskRecord[]> {
    const res = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/goals/${encodeURIComponent(goalId)}/tasks`);
    return handleResponse<TaskRecord[]>(res);
  },

  async getGoalProgress(workspaceId: string, goalId: string): Promise<GoalProgressReport> {
    const res = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/goals/${encodeURIComponent(goalId)}/progress`);
    return handleResponse<GoalProgressReport>(res);
  },

  async deleteGoal(workspaceId: string, goalId: string): Promise<void> {
    const res = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/goals/${encodeURIComponent(goalId)}`, {
      method: 'DELETE',
    });
    return handleResponse<void>(res);
  },

  // Team Endpoints
  async getTeams(workspaceId: string): Promise<TeamRecord[]> {
    const res = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/teams`);
    return handleResponse<TeamRecord[]>(res);
  },

  async getTeam(workspaceId: string, teamId: string): Promise<TeamRecord> {
    const res = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/teams/${encodeURIComponent(teamId)}`);
    return handleResponse<TeamRecord>(res);
  },

  async joinTeam(workspaceId: string, teamId: string, agentId: string): Promise<TeamRecord> {
    const res = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/teams/${encodeURIComponent(teamId)}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId }),
    });
    return handleResponse<TeamRecord>(res);
  },

  async leaveTeam(workspaceId: string, teamId: string, agentId: string): Promise<TeamRecord> {
    const res = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/teams/${encodeURIComponent(teamId)}/leave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId }),
    });
    return handleResponse<TeamRecord>(res);
  },

  async addTaskToTeam(workspaceId: string, teamId: string, taskId: string): Promise<TeamRecord> {
    const res = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/teams/${encodeURIComponent(teamId)}/add-task`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId }),
    });
    return handleResponse<TeamRecord>(res);
  },

  async removeTaskFromTeam(workspaceId: string, teamId: string, taskId: string): Promise<TeamRecord> {
    const res = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/teams/${encodeURIComponent(teamId)}/remove-task`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId }),
    });
    return handleResponse<TeamRecord>(res);
  },

  async setTeamLead(workspaceId: string, teamId: string, agentId: string): Promise<TeamRecord> {
    const res = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/teams/${encodeURIComponent(teamId)}/lead`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId }),
    });
    return handleResponse<TeamRecord>(res);
  },

  async disbandTeam(workspaceId: string, teamId: string): Promise<void> {
    const res = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/teams/${encodeURIComponent(teamId)}`, {
      method: 'DELETE',
    });
    return handleResponse<void>(res);
  },

  // Registry & Sync Endpoints
  async getRegistryLinks(targetId: string): Promise<RegistryLinkRecord[]> {
    const res = await fetch(`/api/workspaces/${encodeURIComponent(targetId)}/registry/links`);
    return handleResponse<RegistryLinkRecord[]>(res);
  },

  async getAgentStaleness(targetId: string): Promise<AgentStalenessRecord[]> {
    const res = await fetch(`/api/workspaces/${encodeURIComponent(targetId)}/registry/agent-staleness`);
    return handleResponse<AgentStalenessRecord[]>(res);
  },

  async getRegistrySettings(): Promise<RegistrySettings> {
    const res = await fetch('/api/registry/settings');
    return handleResponse<RegistrySettings>(res);
  },

  async updateRegistrySettings(defaultRegistryWorkspaceId: string | null): Promise<RegistrySettings> {
    const res = await fetch('/api/registry/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ defaultRegistryWorkspaceId }),
    });
    return handleResponse<RegistrySettings>(res);
  },

  async linkAgents(targetId: string, sourceWorkspaceId: string, agentIds: string[], renames?: Record<string, string>): Promise<{ links: Array<{ link: RegistryLinkRecord; agent: AgentRecord }> }> {
    const res = await fetch(`/api/workspaces/${encodeURIComponent(targetId)}/registry/link-agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceWorkspaceId, agentIds, renames: renames || {} }),
    });
    return handleResponse(res);
  },

  async syncAgent(targetId: string, linkId: string): Promise<{ link: RegistryLinkRecord; agent?: AgentRecord; appliedDiff?: any[]; needsRecreate?: boolean; recreateDiff?: any[] }> {
    const res = await fetch(`/api/workspaces/${encodeURIComponent(targetId)}/registry/sync-agent/${encodeURIComponent(linkId)}`, {
      method: 'POST',
    });
    return handleResponse(res);
  },

  async previewRecreateAgent(targetId: string, linkId: string): Promise<RecreatePreviewResponse> {
    const res = await fetch(`/api/workspaces/${encodeURIComponent(targetId)}/registry/recreate-agent/${encodeURIComponent(linkId)}/preview`);
    return handleResponse<RecreatePreviewResponse>(res);
  },

  async recreateAgent(targetId: string, linkId: string, confirm: boolean): Promise<{ link: RegistryLinkRecord; agent: AgentRecord; warnings?: string[] }> {
    const res = await fetch(`/api/workspaces/${encodeURIComponent(targetId)}/registry/recreate-agent/${encodeURIComponent(linkId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm }),
    });
    return handleResponse(res);
  },

  async linkTeams(targetId: string, sourceWorkspaceId: string, teamIds: string[], renames?: Record<string, string>): Promise<{ links: Array<{ link: RegistryLinkRecord; team: TeamRecord }> }> {
    const res = await fetch(`/api/workspaces/${encodeURIComponent(targetId)}/registry/link-teams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceWorkspaceId, teamIds, renames: renames || {} }),
    });
    return handleResponse(res);
  },

  async syncTeam(targetId: string, linkId: string): Promise<{ link: RegistryLinkRecord; team?: TeamRecord; appliedDiff?: any[] }> {
    const res = await fetch(`/api/workspaces/${encodeURIComponent(targetId)}/registry/sync-team/${encodeURIComponent(linkId)}`, {
      method: 'POST',
    });
    return handleResponse(res);
  },
};


