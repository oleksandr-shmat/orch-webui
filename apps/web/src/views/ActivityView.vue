<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';

import { useWorkspaceStore } from '@/stores/workspace';
import { useActivityStream } from '@/composables/useActivityStream';

const store = useWorkspaceStore();
const { events, isConnected, error, connect, disconnect, clear } = useActivityStream();

const searchQuery = ref('');
const selectedTopicFilter = ref('all');
const autoScroll = ref(true);
const expandedEventIds = ref<Set<string>>(new Set());
const logContainerRef = ref<HTMLElement | null>(null);

const topicOptions = [
  { label: 'All Event Topics', value: 'all' },
  { label: 'Task Events', value: 'task' },
  { label: 'Agent Events', value: 'agent' },
  { label: 'Run Events', value: 'run' },
  { label: 'Orchestrator Events', value: 'orchestrator' },
];

function scrollToBottom() {
  if (autoScroll.value && logContainerRef.value) {
    logContainerRef.value.scrollTop = 0; // Stack reversed (newest first) or auto scroll
  }
}

watch(
  () => store.activeWorkspace?.id,
  (id) => {
    if (id) {
      connect(id);
    } else {
      disconnect();
    }
  },
  { immediate: true }
);

watch(events, () => {
  nextTick(() => scrollToBottom());
});

onMounted(() => {
  if (store.activeWorkspace?.id) {
    connect(store.activeWorkspace.id);
  }
});

const filteredEvents = computed(() => {
  return events.value.filter((ev) => {
    if (selectedTopicFilter.value !== 'all') {
      if (!ev.topic.toLowerCase().includes(selectedTopicFilter.value)) {
        return false;
      }
    }
    if (searchQuery.value.trim()) {
      const q = searchQuery.value.toLowerCase();
      const matchTopic = ev.topic.toLowerCase().includes(q);
      const matchPayload = JSON.stringify(ev.payload).toLowerCase().includes(q);
      return matchTopic || matchPayload;
    }
    return true;
  });
});

function toggleExpand(eventId: string) {
  if (expandedEventIds.value.has(eventId)) {
    expandedEventIds.value.delete(eventId);
  } else {
    expandedEventIds.value.add(eventId);
  }
}

function formatTime(isoStr: string) {
  try {
    const d = new Date(isoStr);
    return d.toTimeString().split(' ')[0];
  } catch {
    return isoStr;
  }
}

function getGlyphForTopic(topic: string): { glyph: string; class: string } {
  if (topic.includes('task.done') || topic.includes('succeeded') || topic.includes('finish')) {
    return { glyph: '✓', class: 'done' };
  }
  if (topic.includes('fail') || topic.includes('error')) {
    return { glyph: '✕', class: 'error' };
  }
  if (topic.includes('start') || topic.includes('progress') || topic.includes('run')) {
    return { glyph: '▶', class: 'progress' };
  }
  return { glyph: '◎', class: 'info' };
}
</script>

<template>
  <div class="view-container">
    <div class="view-header">
      <div class="header-left">
        <h1 class="view-title">Activity Feed</h1>
        <span class="ow-eyebrow view-subtitle mono">
          SSE Stream — Workspace: {{ store.activeWorkspace?.label || 'None' }}
        </span>
      </div>
      <div class="header-actions">
        <Button
          :icon="autoScroll ? 'pi pi-lock' : 'pi pi-unlock'"
          :label="autoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF'"
          class="p-button-outlined p-button-secondary p-button-sm mono"
          @click="autoScroll = !autoScroll"
        />
        <Button
          icon="pi pi-trash"
          label="Clear Log"
          class="p-button-outlined p-button-secondary p-button-sm mono"
          @click="clear"
        />
        <Button
          icon="pi pi-refresh"
          label="Reconnect"
          class="p-button-outlined p-button-primary p-button-sm mono"
          @click="store.activeWorkspace?.id && connect(store.activeWorkspace.id)"
        />
      </div>
    </div>

    <!-- Filter Bar -->
    <div class="filter-bar">
      <span class="p-input-icon-left search-wrap">
        <i class="pi pi-search" />
        <InputText
          v-model="searchQuery"
          placeholder="Filter events by topic or payload..."
          class="p-inputtext-sm mono search-input"
        />
      </span>

      <Select
        v-model="selectedTopicFilter"
        :options="topicOptions"
        option-label="label"
        option-value="value"
        class="p-inputtext-sm mono topic-select"
      />
    </div>

    <!-- Live Terminal Feed Card -->
    <div class="feed-card">
      <div class="card-header ow-eyebrow">
        <span>Terminal Scrollback Log</span>
        <span v-if="isConnected" class="live-badge mono connected">● LIVE-TAIL</span>
        <span v-else-if="error" class="live-badge mono error">✕ DISCONNECTED</span>
        <span v-else class="live-badge mono connecting">○ CONNECTING</span>
      </div>

      <div ref="logContainerRef" class="terminal-body mono">
        <!-- Error Banner -->
        <div v-if="error" class="stream-error mono">
          ⚠ {{ error }}
        </div>

        <!-- Empty Feed Prompt -->
        <div v-if="events.length === 0" class="feed-line prompt-line">
          <span class="prompt-sigil">$</span>
          <span class="feed-msg">Awaiting live orchestrator events... (Source: /api/workspaces/{{ store.activeWorkspace?.id || ':id' }}/events)</span>
          <span class="ow-cursor"></span>
        </div>

        <!-- Event Lines -->
        <div
          v-for="ev in filteredEvents"
          :key="ev.id"
          class="feed-line-container"
          @click="toggleExpand(ev.id)"
        >
          <div class="feed-line">
            <span class="timestamp">[{{ formatTime(ev.timestamp) }}]</span>
            <span class="status-glyph" :class="getGlyphForTopic(ev.topic).class">
              {{ getGlyphForTopic(ev.topic).glyph }}
            </span>
            <span class="event-type">{{ ev.topic }}</span>
            <span class="event-msg">{{ ev.payload.message || ev.payload.title || JSON.stringify(ev.payload) }}</span>
            <span class="expand-icon">{{ expandedEventIds.has(ev.id) ? '▲' : '▼' }}</span>
          </div>

          <!-- Expanded Payload Details -->
          <div v-if="expandedEventIds.has(ev.id)" class="payload-box">
            <pre class="json-code">{{ JSON.stringify(ev.payload, null, 2) }}</pre>
          </div>
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
}

.search-wrap {
  flex: 1;
}

.search-input {
  width: 100%;
}

.topic-select {
  width: 200px;
}

.feed-card {
  background: var(--p-surface-950);
  border: 1px solid var(--p-surface-800);
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex: 1;
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
}

.live-badge.connected {
  color: var(--p-status-success, #5b9a6f);
}

.live-badge.error {
  color: var(--p-status-error, #ef4444);
}

.live-badge.connecting {
  color: var(--p-primary-400, #f59e0b);
}

.terminal-body {
  padding: 16px;
  font-size: 12px;
  line-height: 1.6;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 480px;
  max-height: 65vh;
  overflow-y: auto;
  background: var(--p-surface-950);
}

.stream-error {
  padding: 8px 12px;
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: var(--p-status-error, #ef4444);
  border-radius: 4px;
  font-size: 11px;
}

.feed-line-container {
  display: flex;
  flex-direction: column;
  padding: 4px 6px;
  border-radius: 2px;
  cursor: pointer;
}

.feed-line-container:hover {
  background: var(--p-surface-900);
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
  white-space: nowrap;
}

.status-glyph {
  font-weight: bold;
}

.status-glyph.done {
  color: var(--p-status-success, #5b9a6f);
}

.status-glyph.error {
  color: var(--p-status-error, #ef4444);
}

.status-glyph.progress {
  color: var(--p-primary-400, #f59e0b);
}

.status-glyph.info {
  color: var(--p-signal-400, #5fb3b3);
}

.event-type {
  color: var(--p-primary-400);
  font-weight: 500;
  white-space: nowrap;
}

.event-msg {
  color: var(--p-surface-300);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.expand-icon {
  font-size: 10px;
  color: var(--p-surface-600);
}

.payload-box {
  margin-top: 6px;
  margin-left: 24px;
  padding: 8px 12px;
  background: var(--p-surface-900);
  border: 1px solid var(--p-surface-800);
  border-radius: 4px;
  overflow-x: auto;
}

.json-code {
  margin: 0;
  font-size: 11px;
  color: var(--p-surface-200);
  font-family: inherit;
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
