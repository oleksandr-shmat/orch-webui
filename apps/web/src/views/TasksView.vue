<script setup lang="ts">
import { useWorkspaceStore } from '@/stores/workspace';
const store = useWorkspaceStore();
</script>

<template>
  <div class="view-container">
    <div class="view-header">
      <h1 class="view-title">Tasks</h1>
      <span class="ow-eyebrow view-subtitle mono">
        Workspace: {{ store.activeWorkspace?.label || 'None' }}
      </span>
    </div>

    <div class="placeholder-card">
      <div class="card-header ow-eyebrow">Task Board</div>
      <div class="empty-prompt mono">
        <span class="prompt-sigil">$</span> orch task list --status in_progress
      </div>
      <p class="empty-desc">
        Tasks view skeleton ready. Full Kanban board and task execution stream will land here in subsequent tasks.
      </p>
    </div>
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
</style>
