<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import Dialog from 'primevue/dialog';
import Textarea from 'primevue/textarea';

import DetailPanelTask from '@/components/DetailPanelTask.vue';
import { useWorkspaceStore } from '@/stores/workspace';
import { useAgents } from '@/composables/useAgents';
import { api, type TaskRecord } from '@/api/client';
import { taskStatus } from '@/theme/status';

const store = useWorkspaceStore();
const { agentOptions } = useAgents(() => store.activeWorkspace?.id);

const tasks = ref<TaskRecord[]>([]);
const isLoading = ref(false);
const searchQuery = ref('');
const selectedStatusFilter = ref<string>('all');

const selectedTaskId = ref<string | null>(null);
const isDetailOpen = ref(false);

// Create task dialog
const isCreateOpen = ref(false);
const newTitle = ref('');
const newDescription = ref('');
const newPriority = ref(2);
const newAssignee = ref('');
const isSubmittingCreate = ref(false);

const statusOptions = [
  { label: 'All Statuses', value: 'all' },
  { label: 'Todo', value: 'todo' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Review', value: 'review' },
  { label: 'Done', value: 'done' },
  { label: 'Failed', value: 'failed' },
];

const priorityOptions = [
  { label: 'P1 - High', value: 1 },
  { label: 'P2 - Normal', value: 2 },
  { label: 'P3 - Low', value: 3 },
  { label: 'P4 - Trivial', value: 4 },
];

async function loadTasks() {
  if (!store.activeWorkspace?.id) return;
  isLoading.value = true;
  try {
    tasks.value = await api.getTasks(store.activeWorkspace.id);
  } catch (err) {
    console.error('Failed to load tasks:', err);
  } finally {
    isLoading.value = false;
  }
}

watch(
  () => store.activeWorkspace?.id,
  (id) => {
    if (id) loadTasks();
  },
  { immediate: true }
);

const filteredTasks = computed(() => {
  return tasks.value.filter((t) => {
    if (selectedStatusFilter.value !== 'all' && t.status !== selectedStatusFilter.value) {
      return false;
    }
    if (searchQuery.value.trim()) {
      const q = searchQuery.value.toLowerCase();
      const matchTitle = t.title.toLowerCase().includes(q);
      const matchDesc = t.description?.toLowerCase().includes(q) ?? false;
      const matchId = t.id.toLowerCase().includes(q);
      const matchAssignee = t.assignee?.toLowerCase().includes(q) ?? false;
      return matchTitle || matchDesc || matchId || matchAssignee;
    }
    return true;
  });
});

const todoTasks = computed(() => filteredTasks.value.filter((t) => t.status === 'todo'));
const inProgressTasks = computed(() => filteredTasks.value.filter((t) => t.status === 'in_progress' || t.status === 'retrying'));
const reviewTasks = computed(() => filteredTasks.value.filter((t) => t.status === 'review'));
const doneTasks = computed(() => filteredTasks.value.filter((t) => t.status === 'done' || t.status === 'failed' || t.status === 'cancelled'));

function openTaskDetail(taskId: string) {
  selectedTaskId.value = taskId;
  isDetailOpen.value = true;
}

async function handleCreateTask() {
  if (!store.activeWorkspace?.id || !newTitle.value.trim()) return;
  isSubmittingCreate.value = true;
  try {
    await api.createTask(store.activeWorkspace.id, {
      title: newTitle.value.trim(),
      description: newDescription.value.trim() || undefined,
      priority: newPriority.value,
      assignee: newAssignee.value.trim() || undefined,
    });
    newTitle.value = '';
    newDescription.value = '';
    newPriority.value = 2;
    newAssignee.value = '';
    isCreateOpen.value = false;
    await loadTasks();
  } catch (err) {
    console.error('Failed to create task:', err);
  } finally {
    isSubmittingCreate.value = false;
  }
}
</script>

<template>
  <div class="view-container">
    <div class="view-header">
      <div class="header-left">
        <h1 class="view-title">Tasks</h1>
        <span class="ow-eyebrow view-subtitle mono">
          Workspace: {{ store.activeWorkspace?.label || 'None' }}
        </span>
      </div>
      <div class="header-actions">
        <Button
          icon="pi pi-plus"
          label="New Task"
          class="p-button-primary p-button-sm mono"
          @click="isCreateOpen = true"
        />
        <Button
          icon="pi pi-refresh"
          label="Refresh"
          class="p-button-outlined p-button-secondary p-button-sm mono"
          :loading="isLoading"
          @click="loadTasks"
        />
      </div>
    </div>

    <!-- Filter Bar -->
    <div class="filter-bar">
      <span class="p-input-icon-left search-wrap">
        <i class="pi pi-search" />
        <InputText
          v-model="searchQuery"
          placeholder="Filter tasks by title, description, ID or assignee..."
          class="p-inputtext-sm mono search-input"
        />
      </span>

      <Select
        v-model="selectedStatusFilter"
        :options="statusOptions"
        option-label="label"
        option-value="value"
        class="p-inputtext-sm mono status-select"
      />
    </div>

    <!-- Kanban Columns View -->
    <div v-if="isLoading && tasks.length === 0" class="placeholder-card mono">
      <span class="spin-glyph">↻</span> Loading task board...
    </div>

    <div v-else-if="tasks.length === 0" class="placeholder-card">
      <div class="card-header ow-eyebrow">Task Board</div>
      <div class="empty-prompt mono">
        <span class="prompt-sigil">$</span> orch task add "Title" -d "Description"
      </div>
      <p class="empty-desc">
        No tasks found in this workspace. Click "New Task" or use the orchestrator CLI to create tasks.
      </p>
    </div>

    <div v-else class="kanban-board">
      <!-- Todo Column -->
      <div class="kanban-column">
        <div class="column-header ow-eyebrow">
          <span class="column-title">TODO</span>
          <span class="count-badge mono">{{ todoTasks.length }}</span>
        </div>
        <div class="column-body">
          <div
            v-for="t in todoTasks"
            :key="t.id"
            class="task-card"
            @click="openTaskDetail(t.id)"
          >
            <div class="card-top-row">
              <span class="task-id mono">#{{ t.id }}</span>
              <span
                class="status-pill mono"
                :style="{ color: taskStatus[t.status]?.color, borderColor: taskStatus[t.status]?.color }"
              >
                {{ taskStatus[t.status]?.glyph }} {{ taskStatus[t.status]?.label }}
              </span>
            </div>
            <h3 class="task-card-title">{{ t.title }}</h3>
            <p v-if="t.description" class="task-card-desc">{{ t.description }}</p>
            <div class="card-bottom-row mono">
              <span class="p-badge">P{{ t.priority || 2 }}</span>
              <span v-if="t.assignee" class="assignee-badge">@{{ t.assignee }}</span>
            </div>
          </div>
          <div v-if="todoTasks.length === 0" class="column-empty mono">No todo tasks</div>
        </div>
      </div>

      <!-- In Progress Column -->
      <div class="kanban-column">
        <div class="column-header ow-eyebrow">
          <span class="column-title">IN PROGRESS</span>
          <span class="count-badge mono">{{ inProgressTasks.length }}</span>
        </div>
        <div class="column-body">
          <div
            v-for="t in inProgressTasks"
            :key="t.id"
            class="task-card active"
            @click="openTaskDetail(t.id)"
          >
            <div class="card-top-row">
              <span class="task-id mono">#{{ t.id }}</span>
              <span
                class="status-pill mono"
                :style="{ color: taskStatus[t.status]?.color, borderColor: taskStatus[t.status]?.color }"
              >
                {{ taskStatus[t.status]?.glyph }} {{ taskStatus[t.status]?.label }}
              </span>
            </div>
            <h3 class="task-card-title">{{ t.title }}</h3>
            <p v-if="t.description" class="task-card-desc">{{ t.description }}</p>
            <div class="card-bottom-row mono">
              <span class="p-badge">P{{ t.priority || 2 }}</span>
              <span v-if="t.assignee" class="assignee-badge">@{{ t.assignee }}</span>
            </div>
          </div>
          <div v-if="inProgressTasks.length === 0" class="column-empty mono">No active tasks</div>
        </div>
      </div>

      <!-- Review Column -->
      <div class="kanban-column">
        <div class="column-header ow-eyebrow">
          <span class="column-title">REVIEW</span>
          <span class="count-badge mono">{{ reviewTasks.length }}</span>
        </div>
        <div class="column-body">
          <div
            v-for="t in reviewTasks"
            :key="t.id"
            class="task-card"
            @click="openTaskDetail(t.id)"
          >
            <div class="card-top-row">
              <span class="task-id mono">#{{ t.id }}</span>
              <span
                class="status-pill mono"
                :style="{ color: taskStatus[t.status]?.color, borderColor: taskStatus[t.status]?.color }"
              >
                {{ taskStatus[t.status]?.glyph }} {{ taskStatus[t.status]?.label }}
              </span>
            </div>
            <h3 class="task-card-title">{{ t.title }}</h3>
            <p v-if="t.description" class="task-card-desc">{{ t.description }}</p>
            <div class="card-bottom-row mono">
              <span class="p-badge">P{{ t.priority || 2 }}</span>
              <span v-if="t.assignee" class="assignee-badge">@{{ t.assignee }}</span>
            </div>
          </div>
          <div v-if="reviewTasks.length === 0" class="column-empty mono">No review tasks</div>
        </div>
      </div>

      <!-- Done / Failed Column -->
      <div class="kanban-column">
        <div class="column-header ow-eyebrow">
          <span class="column-title">DONE / COMPLETED</span>
          <span class="count-badge mono">{{ doneTasks.length }}</span>
        </div>
        <div class="column-body">
          <div
            v-for="t in doneTasks"
            :key="t.id"
            class="task-card"
            @click="openTaskDetail(t.id)"
          >
            <div class="card-top-row">
              <span class="task-id mono">#{{ t.id }}</span>
              <span
                class="status-pill mono"
                :style="{ color: taskStatus[t.status]?.color, borderColor: taskStatus[t.status]?.color }"
              >
                {{ taskStatus[t.status]?.glyph }} {{ taskStatus[t.status]?.label }}
              </span>
            </div>
            <h3 class="task-card-title">{{ t.title }}</h3>
            <p v-if="t.description" class="task-card-desc">{{ t.description }}</p>
            <div class="card-bottom-row mono">
              <span class="p-badge">P{{ t.priority || 2 }}</span>
              <span v-if="t.assignee" class="assignee-badge">@{{ t.assignee }}</span>
            </div>
          </div>
          <div v-if="doneTasks.length === 0" class="column-empty mono">No completed tasks</div>
        </div>
      </div>
    </div>

    <!-- Create Task Dialog -->
    <Dialog
      v-model:visible="isCreateOpen"
      header="Create New Task"
      :modal="true"
      :style="{ width: '480px' }"
    >
      <div class="create-form">
        <div class="form-field">
          <label class="field-label ow-eyebrow">Task Title *</label>
          <InputText
            v-model="newTitle"
            placeholder="e.g. Implement user authentication route"
            class="w-full mono p-inputtext-sm"
          />
        </div>
        <div class="form-field">
          <label class="field-label ow-eyebrow">Description</label>
          <Textarea
            v-model="newDescription"
            rows="3"
            placeholder="Task scope, acceptance criteria, and notes..."
            class="w-full mono p-inputtext-sm"
          />
        </div>
        <div class="form-row">
          <div class="form-field flex-1">
            <label class="field-label ow-eyebrow">Priority</label>
            <Select
              v-model="newPriority"
              :options="priorityOptions"
              option-label="label"
              option-value="value"
              class="w-full mono p-inputtext-sm"
            />
          </div>
          <div class="form-field flex-1">
            <label class="field-label ow-eyebrow">Assignee</label>
            <Select
              v-model="newAssignee"
              :options="agentOptions"
              option-label="label"
              option-value="value"
              placeholder="Unassigned"
              class="w-full mono p-inputtext-sm"
            />
          </div>
        </div>
      </div>
      <template #footer>
        <div class="dialog-footer">
          <Button
            label="Cancel"
            class="p-button-text p-button-secondary p-button-sm mono"
            @click="isCreateOpen = false"
          />
          <Button
            label="Create Task"
            icon="pi pi-check"
            class="p-button-primary p-button-sm mono"
            :loading="isSubmittingCreate"
            :disabled="!newTitle.trim() || isSubmittingCreate"
            @click="handleCreateTask"
          />
        </div>
      </template>
    </Dialog>

    <!-- Detail Panel Slide-Over -->
    <DetailPanelTask
      v-model:visible="isDetailOpen"
      :task-id="selectedTaskId"
      @updated="loadTasks"
      @deleted="loadTasks"
    />
  </div>
</template>

<style scoped>
.view-container {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.view-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-left {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.header-actions {
  display: flex;
  gap: 10px;
}

.view-title {
  font-size: var(--p-text-lg, 20px);
  font-weight: 600;
  color: var(--p-surface-0);
  margin: 0;
}

.view-subtitle {
  color: var(--p-surface-400);
}

.filter-bar {
  display: flex;
  gap: 12px;
  align-items: center;
}

.search-wrap {
  flex: 1;
  position: relative;
}

.search-input {
  width: 100%;
}

.status-select {
  width: 180px;
}

.placeholder-card {
  background: var(--p-surface-900);
  border: 1px solid var(--p-surface-800);
  border-radius: var(--p-radius-sm, 2px);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.card-header {
  color: var(--p-surface-400);
}

.empty-prompt {
  font-size: var(--p-text-sm, 13px);
  color: var(--p-primary-400);
  background: var(--p-surface-950);
  padding: 10px 14px;
  border-radius: var(--p-radius-sm, 2px);
  border: 1px solid var(--p-surface-800);
}

.prompt-sigil {
  color: var(--p-signal-400, #5fb3b3);
}

.empty-desc {
  font-size: var(--p-text-sm, 13px);
  color: var(--p-surface-300);
  margin: 0;
}

.kanban-board {
  display: grid;
  grid-template-columns: repeat(4, minmax(240px, 1fr));
  gap: 16px;
  align-items: start;
}

.kanban-column {
  background: var(--p-surface-950);
  border: 1px solid var(--p-surface-800);
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  min-height: 400px;
}

.column-header {
  padding: 12px 14px;
  background: var(--p-surface-900);
  border-bottom: 1px solid var(--p-surface-800);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.column-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--p-surface-300);
  letter-spacing: 0.05em;
}

.count-badge {
  font-size: 11px;
  background: var(--p-surface-800);
  color: var(--p-primary-400);
  padding: 2px 8px;
  border-radius: 9999px;
}

.column-body {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
}

.column-empty {
  padding: 24px;
  text-align: center;
  font-size: 12px;
  color: var(--p-surface-500);
}

.task-card {
  background: var(--p-surface-900);
  border: 1px solid var(--p-surface-800);
  border-radius: 4px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.task-card:hover {
  border-color: var(--p-primary-400, #e8a33d);
  background: var(--p-surface-800);
}

.task-card.active {
  border-left: 3px solid var(--p-primary-400);
}

.card-top-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.task-id {
  color: var(--p-primary-400, #e8a33d);
  font-size: 11px;
}

.status-pill {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 9999px;
  border: 1px solid currentColor;
}

.task-card-title {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--p-surface-0);
}

.task-card-desc {
  margin: 0;
  font-size: 11px;
  color: var(--p-surface-400);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-bottom-row {
  display: flex;
  gap: 8px;
  font-size: 11px;
  color: var(--p-surface-400);
  margin-top: 4px;
}

.p-badge {
  background: var(--p-surface-800);
  padding: 1px 6px;
  border-radius: 2px;
}

.assignee-badge {
  color: var(--p-signal-400, #5fb3b3);
}

.create-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-top: 8px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-row {
  display: flex;
  gap: 12px;
}

.field-label {
  font-size: 11px;
  color: var(--p-surface-400);
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.spin-glyph {
  display: inline-block;
  animation: spin 1.2s infinite linear;
  margin-right: 6px;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
