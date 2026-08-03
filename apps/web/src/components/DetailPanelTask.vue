<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import Select from 'primevue/select';
import Dialog from 'primevue/dialog';
import DetailPanel from './DetailPanel.vue';
import { useWorkspaceStore } from '@/stores/workspace';
import { useAgents } from '@/composables/useAgents';
import { api, type TaskRecord, type RunRecord } from '@/api/client';
import { taskStatus, runStatus } from '@/theme/status';

const props = defineProps<{
  visible: boolean;
  taskId: string | null;
}>();

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void;
  (e: 'updated'): void;
  (e: 'deleted'): void;
}>();

const store = useWorkspaceStore();
const { getAgentOptionsWithFallback, loadAgents } = useAgents(() => store.activeWorkspace?.id);

const task = ref<TaskRecord | null>(null);
const runs = ref<RunRecord[]>([]);
const isLoading = ref(false);
const isSaving = ref(false);
const actionLoading = ref<string | null>(null);
const errorMessage = ref<string | null>(null);

const isEditing = ref(false);
const editTitle = ref('');
const editDescription = ref('');
const editPriority = ref<number>(2);
const editAssignee = ref<string>('');
const editLabels = ref('');

const displayAgentOptions = computed(() => getAgentOptionsWithFallback(editAssignee.value));

// Reject modal state
const isRejectModalOpen = ref(false);
const rejectFeedback = ref('');

const priorityOptions = [
  { label: 'P1 - High Priority', value: 1 },
  { label: 'P2 - Normal Priority', value: 2 },
  { label: 'P3 - Low Priority', value: 3 },
  { label: 'P4 - Minimal Priority', value: 4 },
];

const taskStatusVisual = computed(() => {
  if (!task.value) return undefined;
  return taskStatus[task.value.status];
});

async function loadData() {
  if (!props.taskId || !store.activeWorkspace?.id) return;
  const wsId = store.activeWorkspace.id;
  isLoading.value = true;
  errorMessage.value = null;

  try {
    const [fetchedTask, fetchedRuns] = await Promise.all([
      api.getTask(wsId, props.taskId),
      api.getTaskRuns(wsId, props.taskId).catch(() => []),
      loadAgents(),
    ]);

    task.value = fetchedTask;
    runs.value = fetchedRuns;
    resetEditForm(fetchedTask);
  } catch (err: any) {
    errorMessage.value = err.message || 'Failed to load task details';
  } finally {
    isLoading.value = false;
  }
}

function resetEditForm(t: TaskRecord) {
  editTitle.value = t.title || '';
  editDescription.value = t.description || '';
  editPriority.value = t.priority ?? 2;
  editAssignee.value = t.assignee || '';
  editLabels.value = t.labels ? t.labels.join(', ') : '';
  isEditing.value = false;
}

watch(
  () => [props.visible, props.taskId],
  ([vis, id]) => {
    if (vis && id) {
      loadData();
    } else {
      task.value = null;
      runs.value = [];
      isEditing.value = false;
    }
  },
  { immediate: true }
);

async function handleSave() {
  if (!task.value || !store.activeWorkspace?.id) return;
  const wsId = store.activeWorkspace.id;
  isSaving.value = true;
  errorMessage.value = null;

  try {
    const labelsArr = editLabels.value
      ? editLabels.value.split(',').map((l) => l.trim()).filter(Boolean)
      : [];

    const updated = await api.updateTask(wsId, task.value.id, {
      title: editTitle.value,
      description: editDescription.value,
      priority: editPriority.value,
      labels: labelsArr,
    });

    if (editAssignee.value !== (task.value.assignee || '')) {
      if (editAssignee.value) {
        await api.assignTask(wsId, task.value.id, editAssignee.value);
      }
    }

    task.value = { ...updated, assignee: editAssignee.value || undefined };
    isEditing.value = false;
    emit('updated');
  } catch (err: any) {
    errorMessage.value = err.message || 'Failed to save task updates';
  } finally {
    isSaving.value = false;
  }
}

async function executeAction(actionName: string, actionFn: () => Promise<TaskRecord>) {
  actionLoading.value = actionName;
  errorMessage.value = null;
  try {
    const updated = await actionFn();
    task.value = updated;
    await loadData();
    emit('updated');
  } catch (err: any) {
    errorMessage.value = err.message || `Failed to perform ${actionName}`;
  } finally {
    actionLoading.value = null;
  }
}

function handleRetry() {
  if (!task.value || !store.activeWorkspace?.id) return;
  const wsId = store.activeWorkspace.id;
  executeAction('retry', () => api.retryTask(wsId, task.value!.id));
}

function handleCancel() {
  if (!task.value || !store.activeWorkspace?.id) return;
  const wsId = store.activeWorkspace.id;
  executeAction('cancel', () => api.cancelTask(wsId, task.value!.id));
}

function handleApprove() {
  if (!task.value || !store.activeWorkspace?.id) return;
  const wsId = store.activeWorkspace.id;
  executeAction('approve', () => api.updateTaskStatus(wsId, task.value!.id, 'done'));
}

function openRejectModal() {
  rejectFeedback.value = '';
  isRejectModalOpen.value = true;
}

function confirmReject() {
  if (!task.value || !store.activeWorkspace?.id) return;
  const wsId = store.activeWorkspace.id;
  isRejectModalOpen.value = false;
  executeAction('reject', () => api.rejectTask(wsId, task.value!.id, rejectFeedback.value));
}

async function handleDelete() {
  if (!task.value || !store.activeWorkspace?.id) return;
  if (!confirm(`Are you sure you want to delete task "${task.value.title}"?`)) return;

  actionLoading.value = 'delete';
  errorMessage.value = null;
  try {
    await api.deleteTask(store.activeWorkspace.id, task.value.id);
    emit('update:visible', false);
    emit('deleted');
  } catch (err: any) {
    errorMessage.value = err.message || 'Failed to delete task';
  } finally {
    actionLoading.value = null;
  }
}
</script>

<template>
  <DetailPanel
    :visible="visible"
    kind="task"
    :title="task?.title || 'Task Details'"
    :subtitle="task ? `ID: ${task.id}` : ''"
    :status-visual="taskStatusVisual"
    :loading="isLoading"
    :error="errorMessage"
    @update:visible="(val) => emit('update:visible', val)"
  >
    <div v-if="task" class="task-detail-content">
      <!-- Edit Mode Toggle -->
      <div class="panel-section-header">
        <span class="ow-eyebrow">Record Details</span>
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
          @click="resetEditForm(task)"
        />
      </div>

      <!-- Form Mode vs View Mode -->
      <div v-if="isEditing" class="edit-form">
        <div class="field-group">
          <label class="ow-eyebrow">Title</label>
          <InputText v-model="editTitle" class="form-input mono" />
        </div>

        <div class="field-group">
          <label class="ow-eyebrow">Description</label>
          <Textarea v-model="editDescription" rows="4" class="form-input mono" />
        </div>

        <div class="field-row">
          <div class="field-group">
            <label class="ow-eyebrow">Priority</label>
            <Select
              v-model="editPriority"
              :options="priorityOptions"
              optionLabel="label"
              optionValue="value"
              class="form-select mono"
            />
          </div>

          <div class="field-group">
            <label class="ow-eyebrow">Assignee Agent</label>
            <Select
              v-model="editAssignee"
              :options="displayAgentOptions"
              optionLabel="label"
              optionValue="value"
              placeholder="Unassigned"
              class="form-select mono"
            />
          </div>
        </div>

        <div class="field-group">
          <label class="ow-eyebrow">Labels (comma-separated)</label>
          <InputText v-model="editLabels" placeholder="frontend, priority, bug" class="form-input mono" />
        </div>

        <div class="edit-actions">
          <Button label="Save Changes" icon="pi pi-check" class="p-button-primary p-button-sm" :loading="isSaving" @click="handleSave" />
        </div>
      </div>

      <div v-else class="view-fields">
        <div class="field-card">
          <span class="field-label ow-eyebrow">Description</span>
          <p class="field-value-text">{{ task.description || 'No description provided.' }}</p>
        </div>

        <div class="grid-fields">
          <div class="field-cell">
            <span class="field-label ow-eyebrow">Priority</span>
            <span class="field-val mono">P{{ task.priority || 2 }}</span>
          </div>

          <div class="field-cell">
            <span class="field-label ow-eyebrow">Assignee</span>
            <span class="field-val mono">{{ task.assignee || 'Unassigned' }}</span>
          </div>

          <div class="field-cell">
            <span class="field-label ow-eyebrow">Goal ID</span>
            <span class="field-val mono">{{ task.goal_id || 'None' }}</span>
          </div>

          <div class="field-cell">
            <span class="field-label ow-eyebrow">Created</span>
            <span class="field-val mono">{{ task.created_at ? new Date(task.created_at).toLocaleString() : 'N/A' }}</span>
          </div>
        </div>

        <!-- Labels -->
        <div v-if="task.labels && task.labels.length" class="labels-section">
          <span class="field-label ow-eyebrow">Labels</span>
          <div class="labels-list">
            <span v-for="lbl in task.labels" :key="lbl" class="task-label-chip mono">#{{ lbl }}</span>
          </div>
        </div>

        <!-- Execution Result Output/Error -->
        <div v-if="task.result" class="result-section">
          <span class="field-label ow-eyebrow">Task Result / Output</span>
          <div v-if="task.result.output" class="console-output mono">
            <pre>{{ task.result.output }}</pre>
          </div>
          <div v-if="task.result.error" class="console-error mono">
            <span class="error-sigil">✗</span> {{ task.result.error }}
          </div>
          <div v-if="task.result.exit_code !== undefined" class="exit-code mono">
            Exit Code: {{ task.result.exit_code }}
          </div>
        </div>

        <!-- Run History -->
        <div class="runs-section">
          <span class="field-label ow-eyebrow">Run History ({{ runs.length }})</span>
          <div v-if="runs.length === 0" class="runs-empty mono">
            No execution runs recorded for this task yet.
          </div>
          <div v-else class="runs-list">
            <div v-for="r in runs" :key="r.id" class="run-item mono">
              <div class="run-header">
                <span class="run-status" :style="{ color: runStatus[r.status]?.color }">
                  {{ runStatus[r.status]?.glyph }} {{ r.status }}
                </span>
                <span class="run-id">Run #{{ r.id }}</span>
              </div>
              <div class="run-meta">
                <span>Agent: {{ r.agentId }}</span>
                <span v-if="r.startedAt">{{ new Date(r.startedAt).toLocaleTimeString() }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <template #actions>
      <!-- Action buttons depending on task status -->
      <Button
        v-if="task?.status === 'review'"
        label="Approve"
        icon="pi pi-check-circle"
        class="p-button-success p-button-sm"
        :loading="actionLoading === 'approve'"
        @click="handleApprove"
      />
      <Button
        v-if="task?.status === 'review'"
        label="Reject..."
        icon="pi pi-times-circle"
        class="p-button-warning p-button-sm"
        :loading="actionLoading === 'reject'"
        @click="openRejectModal"
      />
      <Button
        v-if="task?.status === 'failed' || task?.status === 'cancelled' || task?.status === 'done'"
        label="Retry Task"
        icon="pi pi-refresh"
        class="p-button-outlined p-button-warning p-button-sm"
        :loading="actionLoading === 'retry'"
        @click="handleRetry"
      />
      <Button
        v-if="task?.status === 'in_progress' || task?.status === 'retrying'"
        label="Cancel Task"
        icon="pi pi-ban"
        class="p-button-outlined p-button-danger p-button-sm"
        :loading="actionLoading === 'cancel'"
        @click="handleCancel"
      />

      <Button
        label="Delete"
        icon="pi pi-trash"
        class="p-button-text p-button-danger p-button-sm"
        :loading="actionLoading === 'delete'"
        @click="handleDelete"
      />
    </template>
  </DetailPanel>

  <!-- Reject Feedback Modal -->
  <Dialog
    v-model:visible="isRejectModalOpen"
    modal
    header="Reject Task Review"
    :style="{ width: '420px' }"
  >
    <div class="reject-dialog-content">
      <p class="dialog-desc">Provide optional feedback for rejecting this task:</p>
      <Textarea v-model="rejectFeedback" rows="3" placeholder="Feedback or reason for rejection..." class="form-input mono" />
    </div>
    <template #footer>
      <Button label="Cancel" class="p-button-text p-button-secondary" @click="isRejectModalOpen = false" />
      <Button label="Confirm Reject" class="p-button-warning" @click="confirmReject" />
    </template>
  </Dialog>
</template>

<style scoped>
.task-detail-content {
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
  font-size: var(--p-text-sm, 13px);
  color: var(--p-surface-100);
  white-space: pre-wrap;
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

.labels-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.labels-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.task-label-chip {
  font-size: 11px;
  background: rgba(95, 179, 179, 0.15);
  color: var(--p-signal-400, #5fb3b3);
  border: 1px solid rgba(95, 179, 179, 0.3);
  padding: 2px 8px;
  border-radius: 2px;
}

.result-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.console-output {
  background: var(--p-surface-950);
  border: 1px solid var(--p-surface-800);
  padding: 10px;
  border-radius: var(--p-radius-sm, 2px);
  font-size: 11px;
  max-height: 180px;
  overflow-y: auto;
  color: var(--p-surface-200);
}

.console-output pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
}

.console-error {
  background: rgba(193, 88, 90, 0.1);
  border: 1px solid rgba(193, 88, 90, 0.3);
  color: var(--p-status-danger, #c1585a);
  padding: 8px 10px;
  border-radius: var(--p-radius-sm, 2px);
  font-size: 12px;
}

.exit-code {
  font-size: 11px;
  color: var(--p-surface-400);
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

.reject-dialog-content {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.dialog-desc {
  font-size: 13px;
  color: var(--p-surface-300);
  margin: 0;
}
</style>
