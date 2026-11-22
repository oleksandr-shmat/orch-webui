<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import Select from 'primevue/select';
import DetailPanel from './DetailPanel.vue';
import { useWorkspaceStore } from '@/stores/workspace';
import { useAgents } from '@/composables/useAgents';
import { api, type GoalRecord, type GoalStatus, type GoalProgressReport, type TaskRecord, getErrorMessage } from '@/api/client';
import { status as color } from '@/theme/tokens';
import type { StatusVisual } from '@/theme/status';

const props = defineProps<{
  visible: boolean;
  goalId: string | null;
}>();

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void;
  (e: 'updated'): void;
  (e: 'deleted'): void;
}>();

const store = useWorkspaceStore();
const { getAgentOptionsWithFallback, loadAgents } = useAgents(() => store.activeWorkspace?.id);

const goal = ref<GoalRecord | null>(null);
const progress = ref<GoalProgressReport | null>(null);
const tasks = ref<TaskRecord[]>([]);
const isLoading = ref(false);
const isSaving = ref(false);
const actionLoading = ref<string | null>(null);
const errorMessage = ref<string | null>(null);

const isEditing = ref(false);
const editTitle = ref('');
const editDescription = ref('');
const editAssignee = ref('');

const displayAgentOptions = computed(() => getAgentOptionsWithFallback(editAssignee.value));

const goalStatusVisualMap: Record<GoalStatus, StatusVisual> = {
  active: { glyph: '●', color: color.info, label: 'Active' },
  paused: { glyph: '○', color: color.warning, label: 'Paused' },
  achieved: { glyph: '✓', color: color.success, label: 'Achieved' },
  abandoned: { glyph: '⊘', color: color.idle, label: 'Abandoned' },
};

const goalStatusVisual = computed(() => {
  if (!goal.value) return undefined;
  return goalStatusVisualMap[goal.value.status];
});

const statusOptions: { label: string; value: GoalStatus }[] = [
  { label: 'Active', value: 'active' },
  { label: 'Paused', value: 'paused' },
  { label: 'Achieved', value: 'achieved' },
  { label: 'Abandoned', value: 'abandoned' },
];

async function loadData() {
  if (!props.goalId || !store.activeWorkspace?.id) return;
  const wsId = store.activeWorkspace.id;
  isLoading.value = true;
  errorMessage.value = null;

  try {
    const [fetchedGoal, fetchedProgress, fetchedTasks] = await Promise.all([
      api.getGoal(wsId, props.goalId),
      api.getGoalProgress(wsId, props.goalId).catch(() => null),
      api.getGoalTasks(wsId, props.goalId).catch(() => []),
      loadAgents(),
    ]);

    goal.value = fetchedGoal;
    progress.value = fetchedProgress;
    tasks.value = fetchedTasks;
    resetEditForm(fetchedGoal);
  } catch (err) {
    errorMessage.value = getErrorMessage(err) || 'Failed to load goal details';
  } finally {
    isLoading.value = false;
  }
}

function resetEditForm(g: GoalRecord) {
  editTitle.value = g.title || '';
  editDescription.value = g.description || '';
  editAssignee.value = g.assignee || '';
  isEditing.value = false;
}

watch(
  () => [props.visible, props.goalId],
  ([vis, id]) => {
    if (vis && id) {
      loadData();
    } else {
      goal.value = null;
      progress.value = null;
      tasks.value = [];
      isEditing.value = false;
    }
  },
  { immediate: true }
);

async function handleSave() {
  if (!goal.value || !store.activeWorkspace?.id) return;
  const wsId = store.activeWorkspace.id;
  isSaving.value = true;
  errorMessage.value = null;

  try {
    const updated = await api.updateGoal(wsId, goal.value.id, {
      title: editTitle.value,
      description: editDescription.value,
      assignee: editAssignee.value || undefined,
    });

    goal.value = updated;
    isEditing.value = false;
    emit('updated');
  } catch (err) {
    errorMessage.value = getErrorMessage(err) || 'Failed to save goal updates';
  } finally {
    isSaving.value = false;
  }
}

async function handleChangeStatus(newStatus: GoalStatus) {
  if (!goal.value || !store.activeWorkspace?.id) return;
  const wsId = store.activeWorkspace.id;
  actionLoading.value = 'status';
  errorMessage.value = null;

  try {
    const updated = await api.updateGoalStatus(wsId, goal.value.id, newStatus);
    goal.value = updated;
    await loadData();
    emit('updated');
  } catch (err) {
    errorMessage.value = getErrorMessage(err) || 'Failed to update goal status';
  } finally {
    actionLoading.value = null;
  }
}

async function handleDelete() {
  if (!goal.value || !store.activeWorkspace?.id) return;
  if (!confirm(`Are you sure you want to delete goal "${goal.value.title}"?`)) return;

  actionLoading.value = 'delete';
  errorMessage.value = null;
  try {
    await api.deleteGoal(store.activeWorkspace.id, goal.value.id);
    emit('update:visible', false);
    emit('deleted');
  } catch (err) {
    errorMessage.value = getErrorMessage(err) || 'Failed to delete goal';
  } finally {
    actionLoading.value = null;
  }
}
</script>

<template>
  <DetailPanel
    :visible="visible"
    kind="goal"
    :title="goal?.title || 'Goal Details'"
    :subtitle="goal ? `ID: ${goal.id}` : ''"
    :status-visual="goalStatusVisual"
    :loading="isLoading"
    :error="errorMessage"
    @update:visible="(val) => emit('update:visible', val)"
  >
    <div v-if="goal" class="goal-detail-content">
      <!-- Edit Mode Toggle -->
      <div class="panel-section-header">
        <span class="ow-eyebrow">Goal Objective & Specs</span>
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
          @click="resetEditForm(goal)"
        />
      </div>

      <!-- Progress Summary Bar -->
      <div v-if="progress" class="progress-card">
        <div class="progress-header">
          <span class="ow-eyebrow">Goal Progress</span>
          <span class="progress-pct mono">{{ progress.progressPercent ?? 0 }}%</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill" :style="{ width: `${progress.progressPercent ?? 0}%` }"></div>
        </div>
        <div class="progress-stats mono">
          <span>Total: {{ progress.totalTasks }}</span>
          <span>Done: {{ progress.completedTasks }}</span>
          <span>Active: {{ progress.inProgressTasks }}</span>
          <span v-if="progress.failedTasks" class="failed-stat">Failed: {{ progress.failedTasks }}</span>
        </div>
      </div>

      <!-- Edit Form vs View Mode -->
      <div v-if="isEditing" class="edit-form">
        <div class="field-group">
          <label class="ow-eyebrow">Title</label>
          <InputText v-model="editTitle" class="form-input mono" />
        </div>

        <div class="field-group">
          <label class="ow-eyebrow">Description</label>
          <Textarea v-model="editDescription" rows="4" class="form-input mono" placeholder="Objective description..." />
        </div>

        <div class="field-group">
          <label class="ow-eyebrow">Lead Assignee</label>
          <Select
            v-model="editAssignee"
            :options="displayAgentOptions"
            optionLabel="label"
            optionValue="value"
            placeholder="Unassigned"
            class="form-select mono"
          />
        </div>

        <div class="edit-actions">
          <Button label="Save Goal" icon="pi pi-check" class="p-button-primary p-button-sm" :loading="isSaving" @click="handleSave" />
        </div>
      </div>

      <div v-else class="view-fields">
        <div class="field-card">
          <span class="field-label ow-eyebrow">Description</span>
          <p class="field-value-text">{{ goal.description || 'No description provided.' }}</p>
        </div>

        <div class="grid-fields">
          <div class="field-cell">
            <span class="field-label ow-eyebrow">Assignee</span>
            <span class="field-val mono">{{ goal.assignee || 'Unassigned' }}</span>
          </div>

          <div class="field-cell">
            <span class="field-label ow-eyebrow">Created</span>
            <span class="field-val mono">{{ goal.created_at ? new Date(goal.created_at).toLocaleDateString() : 'N/A' }}</span>
          </div>
        </div>

        <!-- Goal Status Controls -->
        <div class="status-change-section">
          <span class="field-label ow-eyebrow">Update Goal Status</span>
          <div class="status-buttons">
            <Button
              v-for="opt in statusOptions"
              :key="opt.value"
              :label="opt.label"
              class="p-button-sm mono"
              :class="goal.status === opt.value ? 'p-button-primary' : 'p-button-outlined p-button-secondary'"
              :loading="actionLoading === 'status'"
              @click="handleChangeStatus(opt.value)"
            />
          </div>
        </div>

        <!-- Associated Tasks -->
        <div class="tasks-section">
          <span class="field-label ow-eyebrow">Linked Tasks ({{ tasks.length }})</span>
          <div v-if="tasks.length === 0" class="tasks-empty mono">
            No tasks attached to this goal.
          </div>
          <div v-else class="tasks-list">
            <div v-for="t in tasks" :key="t.id" class="task-item mono">
              <div class="task-item-main">
                <span class="task-item-id">#{{ t.id }}</span>
                <span class="task-item-title">{{ t.title }}</span>
              </div>
              <span class="task-item-status">{{ t.status }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <template #actions>
      <Button
        label="Delete Goal"
        icon="pi pi-trash"
        class="p-button-text p-button-danger p-button-sm"
        :loading="actionLoading === 'delete'"
        @click="handleDelete"
      />
    </template>
  </DetailPanel>
</template>

<style scoped>
.goal-detail-content {
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

.progress-card {
  background: var(--p-surface-900);
  border: 1px solid var(--p-surface-800);
  border-radius: var(--p-radius-sm, 2px);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.progress-pct {
  font-size: var(--p-text-xs, 12px);
  color: var(--p-status-success, #5b9a6f);
}

.progress-track {
  height: 6px;
  background: var(--p-surface-950);
  border-radius: 9999px;
  overflow: hidden;
  border: 1px solid var(--p-surface-800);
}

.progress-fill {
  height: 100%;
  background: var(--p-status-success, #5b9a6f);
  transition: width 0.3s ease-out;
}

.progress-stats {
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: var(--p-surface-400);
}

.failed-stat {
  color: var(--p-status-danger, #c1585a);
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

.status-change-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.status-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tasks-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tasks-empty {
  font-size: var(--p-text-xs, 12px);
  color: var(--p-surface-400);
  background: var(--p-surface-900);
  padding: 12px;
  border-radius: var(--p-radius-sm, 2px);
}

.tasks-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.task-item {
  background: var(--p-surface-900);
  border: 1px solid var(--p-surface-800);
  padding: 8px 12px;
  border-radius: var(--p-radius-sm, 2px);
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
}

.task-item-main {
  display: flex;
  gap: 8px;
  align-items: center;
}

.task-item-id {
  color: var(--p-primary-400, #e8a33d);
}

.task-item-title {
  color: var(--p-surface-100);
}

.task-item-status {
  color: var(--p-surface-400);
}
</style>
