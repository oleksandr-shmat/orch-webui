<script setup lang="ts">
import { useWorkspaceStore } from '@/stores/workspace';
const store = useWorkspaceStore();
</script>

<template>
  <div class="view-container">
    <div class="view-header">
      <h1 class="view-title">Activity Feed</h1>
      <span class="ow-eyebrow view-subtitle mono">
        SSE Live Event Stream — Workspace: {{ store.activeWorkspace?.label || 'None' }}
      </span>
    </div>

    <div class="feed-card">
      <div class="card-header ow-eyebrow">
        <span>Terminal Scrollback Log</span>
        <span class="live-badge mono">● LIVE-TAIL</span>
      </div>

      <div class="terminal-body mono">
        <div class="feed-line ow-feed-line-in">
          <span class="timestamp">[12:20:34]</span>
          <span class="status-glyph done">✓</span>
          <span class="event-type">workspace.activate</span>
          <span class="event-msg">Workspace activated: {{ store.activeWorkspace?.projectRoot }}</span>
        </div>

        <div class="feed-line ow-feed-line-in">
          <span class="timestamp">[12:20:35]</span>
          <span class="status-glyph info">◎</span>
          <span class="event-type">orchestrator.status</span>
          <span class="event-msg">
            Watch state: {{ store.isWatchRunning ? 'WATCHING' : 'IDLE' }}
          </span>
        </div>

        <div class="feed-line ow-feed-line-in prompt-line">
          <span class="prompt-sigil">$</span>
          <span class="feed-msg">Awaiting orchestrator events...</span>
          <span class="ow-cursor"></span>
        </div>
      </div>
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

.feed-card {
  background: var(--p-surface-950);
  border: 1px solid var(--p-surface-800);
  border-radius: var(--p-radius-sm, 2px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.card-header {
  padding: 10px 16px;
  background: var(--p-surface-900);
  border-bottom: 1px solid var(--p-surface-800);
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: var(--p-surface-400);
}

.live-badge {
  font-size: 10px;
  color: var(--p-signal-400, #5fb3b3);
}

.terminal-body {
  padding: 16px;
  font-size: var(--p-text-xs, 12px);
  line-height: 1.6;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 280px;
  background: var(--p-surface-950);
}

.feed-line {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--p-surface-200);
}

.timestamp {
  color: var(--p-surface-500);
  font-size: 11px;
}

.status-glyph.done {
  color: var(--p-status-success, #5b9a6f);
}

.status-glyph.info {
  color: var(--p-signal-400, #5fb3b3);
}

.event-type {
  color: var(--p-primary-400);
  font-weight: 500;
}

.event-msg {
  color: var(--p-surface-300);
}

.prompt-line {
  margin-top: 12px;
}

.prompt-sigil {
  color: var(--p-primary-400);
  font-weight: 600;
}

.feed-msg {
  color: var(--p-surface-400);
}
</style>
