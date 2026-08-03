<script setup lang="ts">
import { ref, watch } from 'vue';
import Button from 'primevue/button';
import DetailPanelGoal from '@/components/DetailPanelGoal.vue';
import { useWorkspaceStore } from '@/stores/workspace';
import { api, type GoalRecord } from '@/api/client';

const store = useWorkspaceStore();

const goals = ref<GoalRecord[]>([]);
const isLoading = ref(false);
const selectedGoalId = ref<string | null>(null);
const isDetailOpen = ref(false);

async function loadGoals() {
  if (!store.activeWorkspace?.id) return;
  isLoading.value = true;
  try {
    goals.value = await api.getGoals(store.activeWorkspace.id);
  } catch (err) {
    console.error('Failed to load goals:', err);
  } finally {
    isLoading.value = false;
  }
}

watch(
  () => store.activeWorkspace?.id,
  (id) => {
    if (id) loadGoals();
  },
  { immediate: true }
);

function openGoalDetail(goalId: string) {
  selectedGoalId.value = goalId;
  isDetailOpen.value = true;
}
</script>

<template>
  <div class="view-container">
    <div class="view-header">
      <div class="header-left">
        <h1 class="view-title">Goals</h1>
        <span class="ow-eyebrow view-subtitle mono">
          Workspace: {{ store.activeWorkspace?.label || 'None' }}
        </span>
      </div>
      <Button
        icon="pi pi-refresh"
        label="Refresh"
        class="p-button-outlined p-button-secondary p-button-sm mono"
        :loading="isLoading"
        @click="loadGoals"
      />
    </div>

    <div v-if="isLoading && goals.length === 0" class="placeholder-card mono">
      <span class="spin-glyph">↻</span> Loading goals...
    </div>

    <div v-else-if="goals.length === 0" class="placeholder-card">
      <div class="card-header ow-eyebrow">Goal Tracker</div>
      <div class="empty-prompt mono">
        <span class="prompt-sigil">$</span> orch goal list
      </div>
      <p class="empty-desc">
        No goals created in this workspace yet.
      </p>
    </div>

    <div v-else class="goals-grid">
      <div
        v-for="g in goals"
        :key="g.id"
        class="goal-card"
        @click="openGoalDetail(g.id)"
      >
        <div class="card-top-row">
          <span class="goal-id mono">#{{ g.id }}</span>
          <span class="status-tag mono">{{ g.status }}</span>
        </div>
        <h3 class="goal-title">{{ g.title }}</h3>
        <p v-if="g.description" class="goal-desc">{{ g.description }}</p>
        <div v-if="g.assignee" class="card-bottom-row mono">
          <span>Assignee: @{{ g.assignee }}</span>
        </div>
      </div>
    </div>

    <!-- Detail Panel Slide-Over -->
    <DetailPanelGoal
      v-model:visible="isDetailOpen"
      :goal-id="selectedGoalId"
      @updated="loadGoals"
      @deleted="loadGoals"
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

.view-title {
  font-size: var(--p-text-lg, 20px);
  font-weight: 600;
  color: var(--p-surface-0);
  margin: 0;
}

.view-subtitle {
  color: var(--p-surface-400);
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

.goals-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.goal-card {
  background: var(--p-surface-900);
  border: 1px solid var(--p-surface-800);
  border-radius: var(--p-radius-sm, 2px);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.goal-card:hover {
  border-color: var(--p-status-success, #5b9a6f);
  background: var(--p-surface-800);
}

.card-top-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.goal-id {
  color: var(--p-status-success, #5b9a6f);
  font-size: 12px;
}

.status-tag {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 2px;
  background: var(--p-surface-800);
  color: var(--p-surface-300);
}

.goal-title {
  margin: 0;
  font-size: var(--p-text-sm, 14px);
  font-weight: 500;
  color: var(--p-surface-0);
}

.goal-desc {
  margin: 0;
  font-size: 12px;
  color: var(--p-surface-400);
}

.card-bottom-row {
  font-size: 11px;
  color: var(--p-surface-400);
  margin-top: auto;
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
