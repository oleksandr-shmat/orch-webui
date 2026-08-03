<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import Button from 'primevue/button';
import Select from 'primevue/select';
import DetailPanel from './DetailPanel.vue';
import { useWorkspaceStore } from '@/stores/workspace';
import { api, type TeamRecord, type AgentRecord, type TaskRecord } from '@/api/client';

const props = defineProps<{
  visible: boolean;
  teamId: string | null;
}>();

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void;
  (e: 'updated'): void;
  (e: 'deleted'): void;
}>();

const store = useWorkspaceStore();

const team = ref<TeamRecord | null>(null);
const allAgents = ref<AgentRecord[]>([]);
const allTasks = ref<TaskRecord[]>([]);
const isLoading = ref(false);
const actionLoading = ref<string | null>(null);
const errorMessage = ref<string | null>(null);

const selectedAgentToJoin = ref<string>('');
const selectedTaskToAdd = ref<string>('');
const selectedLeadAgent = ref<string>('');

const availableAgentsToJoin = computed(() => {
  if (!team.value) return allAgents.value;
  const memberSet = new Set(team.value.member_agent_ids || []);
  return allAgents.value.filter((a) => !memberSet.has(a.id));
});

const availableTasksToAdd = computed(() => {
  if (!team.value) return allTasks.value;
  const taskSet = new Set(team.value.task_ids || []);
  return allTasks.value.filter((t) => !taskSet.has(t.id));
});

async function loadData() {
  if (!props.teamId || !store.activeWorkspace?.id) return;
  const wsId = store.activeWorkspace.id;
  isLoading.value = true;
  errorMessage.value = null;

  try {
    const [fetchedTeam, fetchedAgents, fetchedTasks] = await Promise.all([
      api.getTeam(wsId, props.teamId),
      api.getAgents(wsId).catch(() => []),
      api.getTasks(wsId).catch(() => []),
    ]);

    team.value = fetchedTeam;
    allAgents.value = fetchedAgents;
    allTasks.value = fetchedTasks;
    selectedLeadAgent.value = fetchedTeam.lead_agent_id;
  } catch (err: any) {
    errorMessage.value = err.message || 'Failed to load team details';
  } finally {
    isLoading.value = false;
  }
}

watch(
  () => [props.visible, props.teamId],
  ([vis, id]) => {
    if (vis && id) {
      loadData();
    } else {
      team.value = null;
      selectedAgentToJoin.value = '';
      selectedTaskToAdd.value = '';
    }
  },
  { immediate: true }
);

async function handleSetLead() {
  if (!team.value || !store.activeWorkspace?.id || !selectedLeadAgent.value) return;
  const wsId = store.activeWorkspace.id;
  actionLoading.value = 'lead';
  errorMessage.value = null;

  try {
    const updated = await api.setTeamLead(wsId, team.value.id, selectedLeadAgent.value);
    team.value = updated;
    emit('updated');
  } catch (err: any) {
    errorMessage.value = err.message || 'Failed to set team lead';
  } finally {
    actionLoading.value = null;
  }
}

async function handleJoinAgent() {
  if (!team.value || !store.activeWorkspace?.id || !selectedAgentToJoin.value) return;
  const wsId = store.activeWorkspace.id;
  actionLoading.value = 'join';
  errorMessage.value = null;

  try {
    const updated = await api.joinTeam(wsId, team.value.id, selectedAgentToJoin.value);
    team.value = updated;
    selectedAgentToJoin.value = '';
    emit('updated');
  } catch (err: any) {
    errorMessage.value = err.message || 'Failed to add member agent to team';
  } finally {
    actionLoading.value = null;
  }
}

async function handleLeaveAgent(agentId: string) {
  if (!team.value || !store.activeWorkspace?.id) return;
  const wsId = store.activeWorkspace.id;
  actionLoading.value = `leave-${agentId}`;
  errorMessage.value = null;

  try {
    const updated = await api.leaveTeam(wsId, team.value.id, agentId);
    team.value = updated;
    emit('updated');
  } catch (err: any) {
    errorMessage.value = err.message || 'Failed to remove member agent from team';
  } finally {
    actionLoading.value = null;
  }
}

async function handleAddTask() {
  if (!team.value || !store.activeWorkspace?.id || !selectedTaskToAdd.value) return;
  const wsId = store.activeWorkspace.id;
  actionLoading.value = 'add-task';
  errorMessage.value = null;

  try {
    const updated = await api.addTaskToTeam(wsId, team.value.id, selectedTaskToAdd.value);
    team.value = updated;
    selectedTaskToAdd.value = '';
    emit('updated');
  } catch (err: any) {
    errorMessage.value = err.message || 'Failed to add task to team';
  } finally {
    actionLoading.value = null;
  }
}

async function handleRemoveTask(taskId: string) {
  if (!team.value || !store.activeWorkspace?.id) return;
  const wsId = store.activeWorkspace.id;
  actionLoading.value = `remove-task-${taskId}`;
  errorMessage.value = null;

  try {
    const updated = await api.removeTaskFromTeam(wsId, team.value.id, taskId);
    team.value = updated;
    emit('updated');
  } catch (err: any) {
    errorMessage.value = err.message || 'Failed to remove task from team';
  } finally {
    actionLoading.value = null;
  }
}

async function handleDisband() {
  if (!team.value || !store.activeWorkspace?.id) return;
  if (!confirm(`Are you sure you want to disband team "${team.value.name}"?`)) return;

  actionLoading.value = 'disband';
  errorMessage.value = null;
  try {
    await api.disbandTeam(store.activeWorkspace.id, team.value.id);
    emit('update:visible', false);
    emit('deleted');
  } catch (err: any) {
    errorMessage.value = err.message || 'Failed to disband team';
  } finally {
    actionLoading.value = null;
  }
}
</script>

<template>
  <DetailPanel
    :visible="visible"
    kind="team"
    :title="team?.name || 'Team Details'"
    :subtitle="team ? `ID: ${team.id}` : ''"
    :loading="isLoading"
    :error="errorMessage"
    @update:visible="(val) => emit('update:visible', val)"
  >
    <div v-if="team" class="team-detail-content">
      <div class="field-card">
        <span class="field-label ow-eyebrow">Description</span>
        <p class="field-value-text">{{ team.description || 'No team description provided.' }}</p>
      </div>

      <!-- Lead Agent Selection -->
      <div class="lead-section">
        <span class="field-label ow-eyebrow">Team Lead Agent</span>
        <div class="lead-row">
          <Select
            v-model="selectedLeadAgent"
            :options="allAgents"
            optionLabel="name"
            optionValue="id"
            placeholder="Select Lead Agent"
            class="form-select mono"
          />
          <Button
            label="Set Lead"
            icon="pi pi-user-edit"
            class="p-button-outlined p-button-primary p-button-sm mono"
            :disabled="selectedLeadAgent === team.lead_agent_id"
            :loading="actionLoading === 'lead'"
            @click="handleSetLead"
          />
        </div>
      </div>

      <!-- Config Options -->
      <div class="config-section">
        <span class="field-label ow-eyebrow">Team Config</span>
        <div class="config-row mono">
          <span>Auto-Claim Tasks: {{ team.config?.auto_claim ? 'Enabled' : 'Disabled' }}</span>
        </div>
      </div>

      <!-- Member Agents -->
      <div class="members-section">
        <div class="section-title-row">
          <span class="field-label ow-eyebrow">Member Agents ({{ team.member_agent_ids?.length || 0 }})</span>
        </div>

        <div class="add-row">
          <Select
            v-model="selectedAgentToJoin"
            :options="availableAgentsToJoin"
            optionLabel="name"
            optionValue="id"
            placeholder="Select Agent to Add..."
            class="form-select mono"
          />
          <Button
            label="Add Member"
            icon="pi pi-user-plus"
            class="p-button-outlined p-button-sm mono"
            :disabled="!selectedAgentToJoin"
            :loading="actionLoading === 'join'"
            @click="handleJoinAgent"
          />
        </div>

        <div v-if="!team.member_agent_ids || team.member_agent_ids.length === 0" class="empty-box mono">
          No members in this team yet.
        </div>
        <div v-else class="members-list">
          <div v-for="agentId in team.member_agent_ids" :key="agentId" class="member-item mono">
            <div class="member-info">
              <span class="member-icon">👤</span>
              <span class="member-name">{{ agentId }}</span>
              <span v-if="agentId === team.lead_agent_id" class="lead-badge">LEAD</span>
            </div>
            <Button
              icon="pi pi-trash"
              class="p-button-text p-button-danger p-button-xs"
              :loading="actionLoading === `leave-${agentId}`"
              @click="handleLeaveAgent(agentId)"
            />
          </div>
        </div>
      </div>

      <!-- Assigned Tasks -->
      <div class="tasks-section">
        <div class="section-title-row">
          <span class="field-label ow-eyebrow">Team Task Pool ({{ team.task_ids?.length || 0 }})</span>
        </div>

        <div class="add-row">
          <Select
            v-model="selectedTaskToAdd"
            :options="availableTasksToAdd"
            optionLabel="title"
            optionValue="id"
            placeholder="Select Task to Assign to Team..."
            class="form-select mono"
          />
          <Button
            label="Assign Task"
            icon="pi pi-plus"
            class="p-button-outlined p-button-sm mono"
            :disabled="!selectedTaskToAdd"
            :loading="actionLoading === 'add-task'"
            @click="handleAddTask"
          />
        </div>

        <div v-if="!team.task_ids || team.task_ids.length === 0" class="empty-box mono">
          No tasks assigned to this team pool yet.
        </div>
        <div v-else class="tasks-list">
          <div v-for="taskId in team.task_ids" :key="taskId" class="task-item mono">
            <span class="task-id">#{{ taskId }}</span>
            <Button
              icon="pi pi-trash"
              class="p-button-text p-button-danger p-button-xs"
              :loading="actionLoading === `remove-task-${taskId}`"
              @click="handleRemoveTask(taskId)"
            />
          </div>
        </div>
      </div>
    </div>

    <template #actions>
      <Button
        label="Disband Team"
        icon="pi pi-trash"
        class="p-button-text p-button-danger p-button-sm"
        :loading="actionLoading === 'disband'"
        @click="handleDisband"
      />
    </template>
  </DetailPanel>
</template>

<style scoped>
.team-detail-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.field-card {
  background: var(--p-surface-900);
  border: 1px solid var(--p-surface-800);
  border-radius: var(--p-radius-sm, 2px);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  color: var(--p-surface-400);
}

.field-value-text {
  margin: 0;
  font-size: var(--p-text-sm, 13px);
  color: var(--p-surface-100);
}

.lead-section, .config-section, .members-section, .tasks-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.lead-row, .add-row {
  display: flex;
  gap: 8px;
}

.form-select {
  flex: 1;
  background: var(--p-surface-950);
  border: 1px solid var(--p-surface-700);
  color: var(--p-surface-0);
  font-size: var(--p-text-xs, 12px);
}

.config-row {
  background: var(--p-surface-900);
  border: 1px solid var(--p-surface-800);
  padding: 10px 12px;
  border-radius: var(--p-radius-sm, 2px);
  font-size: 12px;
  color: var(--p-surface-200);
}

.empty-box {
  font-size: var(--p-text-xs, 12px);
  color: var(--p-surface-400);
  background: var(--p-surface-900);
  padding: 12px;
  border-radius: var(--p-radius-sm, 2px);
}

.members-list, .tasks-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.member-item, .task-item {
  background: var(--p-surface-900);
  border: 1px solid var(--p-surface-800);
  padding: 8px 12px;
  border-radius: var(--p-radius-sm, 2px);
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
}

.member-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.lead-badge {
  font-size: 10px;
  background: rgba(232, 163, 61, 0.2);
  color: var(--p-primary-400, #e8a33d);
  border: 1px solid rgba(232, 163, 61, 0.4);
  padding: 1px 6px;
  border-radius: 2px;
}

.task-id {
  color: var(--p-primary-400, #e8a33d);
}

.section-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
