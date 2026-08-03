<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import Select from 'primevue/select';
import ToggleSwitch from 'primevue/toggleswitch';
import DetailPanel from './DetailPanel.vue';
import { useWorkspaceStore } from '@/stores/workspace';
import { api, type AgentRecord, type AgentStatus, type AgentApprovalPolicy, type RunRecord } from '@/api/client';
import { agentStatus, runStatus } from '@/theme/status';

const props = defineProps<{
  visible: boolean;
  agentId: string | null;
}>();

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void;
  (e: 'updated'): void;
  (e: 'deleted'): void;
}>();

const store = useWorkspaceStore();

const agent = ref<AgentRecord | null>(null);
const runs = ref<RunRecord[]>([]);
const isLoading = ref(false);
const isSaving = ref(false);
const actionLoading = ref<string | null>(null);
const errorMessage = ref<string | null>(null);

const isEditing = ref(false);
const editName = ref('');
const editAdapter = ref('');
const editRole = ref('');
const editCommand = ref('');
const editModel = ref('');
const editEffort = ref('');
const editApprovalPolicy = ref<AgentApprovalPolicy>('auto');

const adapterOptions = [
  { label: 'Claude (Claude Code CLI)', value: 'claude' },
  { label: 'Codex (OpenAI Codex)', value: 'codex' },
  { label: 'Cursor (Cursor IDE)', value: 'cursor' },
  { label: 'Shell (Bash Command)', value: 'shell' },
  { label: 'Antigravity (Google Antigravity CLI)', value: 'antigravity' },
  { label: 'OpenCode (Multi-provider)', value: 'opencode' },
  { label: 'Grok (Grok CLI)', value: 'grok' },
  { label: 'Pi (Pi Coding Agent RPC)', value: 'pi' },
];

const approvalOptions: { label: string; value: AgentApprovalPolicy }[] = [
  { label: 'Auto (No confirmation)', value: 'auto' },
  { label: 'Suggest (Propose actions)', value: 'suggest' },
  { label: 'Manual (Human approval)', value: 'manual' },
];

const statusOptions: { label: string; value: AgentStatus }[] = [
  { label: 'Idle', value: 'idle' },
  { label: 'Running', value: 'running' },
  { label: 'Error', value: 'error' },
  { label: 'Disabled', value: 'disabled' },
];

const agentStatusVisual = computed(() => {
  if (!agent.value) return undefined;
  return agentStatus[agent.value.status];
});

const isAutonomous = computed(() => {
  if (!agent.value) return false;
  return Boolean(agent.value.is_autonomous ?? agent.value.autonomous);
});

async function loadData() {
  if (!props.agentId || !store.activeWorkspace?.id) return;
  const wsId = store.activeWorkspace.id;
  isLoading.value = true;
  errorMessage.value = null;

  try {
    const [fetchedAgent, fetchedRuns] = await Promise.all([
      api.getAgent(wsId, props.agentId),
      api.getAgentRuns(wsId, props.agentId).catch(() => []),
    ]);

    agent.value = fetchedAgent;
    runs.value = fetchedRuns;
    resetEditForm(fetchedAgent);
  } catch (err: any) {
    errorMessage.value = err.message || 'Failed to load agent details';
  } finally {
    isLoading.value = false;
  }
}

function resetEditForm(a: AgentRecord) {
  editName.value = a.name || '';
  editAdapter.value = a.adapter || 'claude';
  editRole.value = a.role || '';
  editCommand.value = a.command || '';
  editModel.value = a.model || '';
  editEffort.value = a.effort || '';
  editApprovalPolicy.value = a.approval_policy || 'auto';
  isEditing.value = false;
}

watch(
  () => [props.visible, props.agentId],
  ([vis, id]) => {
    if (vis && id) {
      loadData();
    } else {
      agent.value = null;
      runs.value = [];
      isEditing.value = false;
    }
  },
  { immediate: true }
);

async function handleSave() {
  if (!agent.value || !store.activeWorkspace?.id) return;
  const wsId = store.activeWorkspace.id;
  isSaving.value = true;
  errorMessage.value = null;

  try {
    const updated = await api.updateAgent(wsId, agent.value.id, {
      name: editName.value,
      adapter: editAdapter.value,
      role: editRole.value,
      command: editCommand.value || undefined,
      model: editModel.value || undefined,
      effort: editEffort.value || undefined,
      approval_policy: editApprovalPolicy.value,
    });

    agent.value = updated;
    isEditing.value = false;
    emit('updated');
  } catch (err: any) {
    errorMessage.value = err.message || 'Failed to save agent updates';
  } finally {
    isSaving.value = false;
  }
}

async function handleToggleEnable() {
  if (!agent.value || !store.activeWorkspace?.id) return;
  const wsId = store.activeWorkspace.id;
  const isCurrentlyDisabled = agent.value.status === 'disabled';
  actionLoading.value = 'enable';
  errorMessage.value = null;

  try {
    const updated = isCurrentlyDisabled
      ? await api.enableAgent(wsId, agent.value.id)
      : await api.disableAgent(wsId, agent.value.id);

    agent.value = updated;
    emit('updated');
  } catch (err: any) {
    errorMessage.value = err.message || 'Failed to change enable status';
  } finally {
    actionLoading.value = null;
  }
}

async function handleToggleAutonomous(enabled: boolean) {
  if (!agent.value || !store.activeWorkspace?.id) return;
  const wsId = store.activeWorkspace.id;
  actionLoading.value = 'autonomous';
  errorMessage.value = null;

  try {
    const updated = await api.setAgentAutonomous(wsId, agent.value.id, enabled);
    agent.value = updated;
    emit('updated');
  } catch (err: any) {
    errorMessage.value = err.message || 'Failed to update autonomous state';
  } finally {
    actionLoading.value = null;
  }
}

async function handleChangeStatus(newStatus: AgentStatus) {
  if (!agent.value || !store.activeWorkspace?.id) return;
  const wsId = store.activeWorkspace.id;
  actionLoading.value = 'status';
  errorMessage.value = null;

  try {
    const updated = await api.setAgentStatus(wsId, agent.value.id, newStatus);
    agent.value = updated;
    emit('updated');
  } catch (err: any) {
    errorMessage.value = err.message || 'Failed to change agent status';
  } finally {
    actionLoading.value = null;
  }
}

async function handleDelete() {
  if (!agent.value || !store.activeWorkspace?.id) return;
  if (!confirm(`Are you sure you want to delete agent "${agent.value.name}" (${agent.value.id})?`)) return;

  actionLoading.value = 'delete';
  errorMessage.value = null;
  try {
    await api.deleteAgent(store.activeWorkspace.id, agent.value.id);
    emit('update:visible', false);
    emit('deleted');
  } catch (err: any) {
    errorMessage.value = err.message || 'Failed to delete agent';
  } finally {
    actionLoading.value = null;
  }
}
</script>

<template>
  <DetailPanel
    :visible="visible"
    kind="agent"
    :title="agent?.name || 'Agent Details'"
    :subtitle="agent ? `ID: ${agent.id} • Adapter: ${agent.adapter}` : ''"
    :status-visual="agentStatusVisual"
    :loading="isLoading"
    :error="errorMessage"
    @update:visible="(val) => emit('update:visible', val)"
  >
    <div v-if="agent" class="agent-detail-content">
      <!-- Edit Mode Header -->
      <div class="panel-section-header">
        <span class="ow-eyebrow">Agent Specs & Status</span>
        <Button
          v-if="!isEditing"
          label="Edit"
          icon="pi pi-pencil"
          class="p-button-text p-button-sm mono"
          @click="isEditing = true"
        />
        <Button
          v-else
          label="Cancel Edit"
          icon="pi pi-times"
          class="p-button-text p-button-secondary p-button-sm mono"
          @click="resetEditForm(agent)"
        />
      </div>

      <!-- Autonomous & Enable Quick Bar -->
      <div class="quick-controls-card">
        <div class="control-row">
          <div class="control-info">
            <span class="ow-eyebrow">Autonomous Mode</span>
            <span class="control-desc mono">Allows agent to pick up assigned tasks without manual intervention</span>
          </div>
          <ToggleSwitch
            :model-value="isAutonomous"
            :disabled="actionLoading === 'autonomous'"
            @update:model-value="handleToggleAutonomous"
          />
        </div>
      </div>

      <!-- Edit Form vs View Mode -->
      <div v-if="isEditing" class="edit-form">
        <div class="field-row">
          <div class="field-group">
            <label class="ow-eyebrow">Name</label>
            <InputText v-model="editName" class="form-input mono" />
          </div>

          <div class="field-group">
            <label class="ow-eyebrow">Adapter</label>
            <Select
              v-model="editAdapter"
              :options="adapterOptions"
              optionLabel="label"
              optionValue="value"
              class="form-select mono"
            />
          </div>
        </div>

        <div class="field-group">
          <label class="ow-eyebrow">Role & Specification</label>
          <Textarea v-model="editRole" rows="4" class="form-input mono" placeholder="Agent identity, specialization, steps & rules..." />
        </div>

        <div v-if="editAdapter === 'shell'" class="field-group">
          <label class="ow-eyebrow">Command (Shell adapter)</label>
          <InputText v-model="editCommand" placeholder="npm test" class="form-input mono" />
        </div>

        <div class="field-row">
          <div class="field-group">
            <label class="ow-eyebrow">Model</label>
            <InputText v-model="editModel" placeholder="sonnet, haiku, pro..." class="form-input mono" />
          </div>

          <div class="field-group">
            <label class="ow-eyebrow">Approval Policy</label>
            <Select
              v-model="editApprovalPolicy"
              :options="approvalOptions"
              optionLabel="label"
              optionValue="value"
              class="form-select mono"
            />
          </div>
        </div>

        <div class="edit-actions">
          <Button label="Save Agent Specs" icon="pi pi-check" class="p-button-primary p-button-sm" :loading="isSaving" @click="handleSave" />
        </div>
      </div>

      <div v-else class="view-fields">
        <div class="field-card">
          <span class="field-label ow-eyebrow">Role / System Specs</span>
          <p class="field-value-text mono">{{ agent.role || 'No specific role prompt defined.' }}</p>
        </div>

        <div class="grid-fields">
          <div class="field-cell">
            <span class="field-label ow-eyebrow">Adapter</span>
            <span class="field-val mono">{{ agent.adapter }}</span>
          </div>

          <div class="field-cell">
            <span class="field-label ow-eyebrow">Approval Policy</span>
            <span class="field-val mono">{{ agent.approval_policy || 'auto' }}</span>
          </div>

          <div class="field-cell">
            <span class="field-label ow-eyebrow">Model</span>
            <span class="field-val mono">{{ agent.model || 'Default' }}</span>
          </div>

          <div class="field-cell">
            <span class="field-label ow-eyebrow">Created</span>
            <span class="field-val mono">{{ agent.created_at ? new Date(agent.created_at).toLocaleDateString() : 'N/A' }}</span>
          </div>
        </div>

        <div v-if="agent.command" class="field-card">
          <span class="field-label ow-eyebrow">Shell Command</span>
          <code class="command-code mono">$ {{ agent.command }}</code>
        </div>

        <!-- Skills list -->
        <div v-if="agent.skills && agent.skills.length" class="skills-section">
          <span class="field-label ow-eyebrow">Skills ({{ agent.skills.length }})</span>
          <div class="skills-list">
            <span v-for="s in agent.skills" :key="s" class="skill-chip mono">/{{ s }}</span>
          </div>
        </div>

        <!-- Manual Status Override -->
        <div class="status-override-section">
          <span class="field-label ow-eyebrow">Override Agent Status</span>
          <div class="status-buttons">
            <Button
              v-for="opt in statusOptions"
              :key="opt.value"
              :label="opt.label"
              class="p-button-sm mono"
              :class="agent.status === opt.value ? 'p-button-primary' : 'p-button-outlined p-button-secondary'"
              :loading="actionLoading === 'status'"
              @click="handleChangeStatus(opt.value)"
            />
          </div>
        </div>

        <!-- Run History -->
        <div class="runs-section">
          <span class="field-label ow-eyebrow">Agent Executions ({{ runs.length }})</span>
          <div v-if="runs.length === 0" class="runs-empty mono">
            No execution runs recorded for this agent yet.
          </div>
          <div v-else class="runs-list">
            <div v-for="r in runs" :key="r.id" class="run-item mono">
              <div class="run-header">
                <span class="run-status" :style="{ color: runStatus[r.status]?.color }">
                  {{ runStatus[r.status]?.glyph }} {{ r.status }}
                </span>
                <span class="run-id">Task: {{ r.taskId }}</span>
              </div>
              <div class="run-meta">
                <span>Run #{{ r.id }}</span>
                <span v-if="r.startedAt">{{ new Date(r.startedAt).toLocaleTimeString() }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <template #actions>
      <Button
        :label="agent?.status === 'disabled' ? 'Enable Agent' : 'Disable Agent'"
        :icon="agent?.status === 'disabled' ? 'pi pi-play' : 'pi pi-pause'"
        :class="agent?.status === 'disabled' ? 'p-button-success p-button-sm' : 'p-button-warning p-button-sm'"
        :loading="actionLoading === 'enable'"
        @click="handleToggleEnable"
      />

      <Button
        label="Delete Agent"
        icon="pi pi-trash"
        class="p-button-text p-button-danger p-button-sm"
        :loading="actionLoading === 'delete'"
        @click="handleDelete"
      />
    </template>
  </DetailPanel>
</template>

<style scoped>
.agent-detail-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.panel-section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--p-surface-800);
  padding-bottom: 8px;
}

.quick-controls-card {
  background: var(--p-surface-900);
  border: 1px solid var(--p-surface-800);
  border-radius: var(--p-radius-sm, 2px);
  padding: 12px;
}

.control-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.control-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.control-desc {
  font-size: 11px;
  color: var(--p-surface-400);
}

.edit-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.field-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.form-input, .form-select {
  width: 100%;
  background: var(--p-surface-950);
  border: 1px solid var(--p-surface-700);
  color: var(--p-surface-0);
  font-size: var(--p-text-xs, 12px);
}

.edit-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}

.view-fields {
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
  font-size: var(--p-text-xs, 12px);
  color: var(--p-surface-100);
  white-space: pre-wrap;
}

.command-code {
  color: var(--p-primary-400, #e8a33d);
  font-size: 12px;
}

.grid-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.field-cell {
  background: var(--p-surface-900);
  border: 1px solid var(--p-surface-800);
  padding: 10px;
  border-radius: var(--p-radius-sm, 2px);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field-val {
  font-size: var(--p-text-xs, 12px);
  color: var(--p-surface-0);
}

.skills-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.skills-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.skill-chip {
  font-size: 11px;
  background: rgba(232, 163, 61, 0.15);
  color: var(--p-primary-400, #e8a33d);
  border: 1px solid rgba(232, 163, 61, 0.3);
  padding: 2px 8px;
  border-radius: 2px;
}

.status-override-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.status-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.runs-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.runs-empty {
  font-size: var(--p-text-xs, 12px);
  color: var(--p-surface-400);
  background: var(--p-surface-900);
  padding: 12px;
  border-radius: var(--p-radius-sm, 2px);
}

.runs-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.run-item {
  background: var(--p-surface-900);
  border: 1px solid var(--p-surface-800);
  padding: 8px 12px;
  border-radius: var(--p-radius-sm, 2px);
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
}

.run-header {
  display: flex;
  gap: 8px;
  align-items: center;
}

.run-meta {
  display: flex;
  gap: 12px;
  color: var(--p-surface-400);
}
</style>
