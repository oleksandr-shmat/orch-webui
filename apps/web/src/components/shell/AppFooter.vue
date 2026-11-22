<script setup lang="ts">
import { useWorkspaceStore } from '@/stores/workspace';

const store = useWorkspaceStore();
</script>

<template>
  <footer class="app-footer">
    <div class="footer-left mono">
      <span class="host-badge">127.0.0.1:4317</span>
      <span class="divider">│</span>
      <span class="path-text" :title="store.activeWorkspace?.projectRoot">
        {{ store.activeWorkspace?.projectRoot || 'No workspace loaded' }}
      </span>
    </div>

    <div class="footer-center mono">
      <span class="legend-item"><kbd>1-5</kbd> Tabs</span>
    </div>

    <div class="footer-right mono">
      <span class="sse-status">
        <span class="sse-dot">●</span> SSE LIVE
      </span>
    </div>
  </footer>
</template>

<style scoped>
.app-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 24px;
  padding: 0 16px;
  background: var(--p-surface-950);
  border-top: 1px solid var(--p-surface-800);
  font-size: 11px;
  color: var(--p-surface-400);
  user-select: none;
}

.footer-left {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow: hidden;
}

.host-badge {
  color: var(--p-surface-400);
}

.divider {
  color: var(--p-surface-700);
}

.path-text {
  color: var(--p-surface-300);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 400px;
}

.footer-center {
  display: flex;
  align-items: center;
  gap: 16px;
}

.legend-item {
  color: var(--p-surface-400);
}

kbd {
  background: var(--p-surface-800);
  border: 1px solid var(--p-surface-700);
  border-radius: 2px;
  padding: 0 4px;
  font-size: 10px;
  color: var(--p-surface-200);
}

.footer-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sse-status {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--p-signal-400, #5fb3b3);
}

.sse-dot {
  font-size: 9px;
}
</style>
