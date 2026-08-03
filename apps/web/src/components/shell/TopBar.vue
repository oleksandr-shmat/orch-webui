<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import Button from 'primevue/button';
import { useWorkspaceStore } from '@/stores/workspace';
import { api } from '@/api/client';

const store = useWorkspaceStore();
const isDropdownOpen = ref(false);
const isRunningAll = ref(false);

function toggleDropdown() {
  isDropdownOpen.value = !isDropdownOpen.value;
}

function closeDropdown() {
  isDropdownOpen.value = false;
}

function selectWorkspace(id: string) {
  store.selectWorkspace(id);
  closeDropdown();
}

function handleOpenModal() {
  closeDropdown();
  store.openBrowseModal();
}

async function handleRunAll() {
  if (!store.activeWorkspace) return;
  isRunningAll.value = true;
  try {
    await api.runAllTasks(store.activeWorkspace.id);
  } catch (err) {
    console.error('Failed to trigger run-all:', err);
  } finally {
    isRunningAll.value = false;
  }
}

// Close dropdown on click outside
function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement;
  if (!target.closest('.workspace-switcher')) {
    closeDropdown();
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});
</script>

<template>
  <header class="top-bar">
    <div class="brand-section">
      <div class="logo">
        <span class="logo-dot">●</span>
        <span class="logo-text mono">ORCH</span>
        <span class="ow-eyebrow logo-badge">Web UI</span>
      </div>

      <!-- Workspace Switcher -->
      <div class="workspace-switcher">
        <button
          type="button"
          class="switcher-button"
          :class="{ active: isDropdownOpen }"
          @click.stop="toggleDropdown"
          title="Switch workspace folder"
        >
          <span class="folder-icon">📂</span>
          <div class="workspace-meta">
            <span class="ws-label">{{ store.activeWorkspace?.label || 'Select Workspace' }}</span>
            <span class="ws-path mono">{{ store.activeWorkspace?.projectRoot || 'No folder selected' }}</span>
          </div>
          <span class="chevron mono">{{ isDropdownOpen ? '▲' : '▼' }}</span>
        </button>

        <!-- Dropdown Menu -->
        <div v-if="isDropdownOpen" class="switcher-dropdown">
          <div class="dropdown-header ow-eyebrow">Recent Workspaces</div>
          
          <div class="workspace-list">
            <div v-if="store.workspaces.length === 0" class="empty-list mono">
              No recent workspaces
            </div>
            <button
              v-for="ws in store.workspaces"
              :key="ws.id"
              type="button"
              class="ws-item"
              :class="{ selected: ws.id === store.activeWorkspaceId }"
              @click="selectWorkspace(ws.id)"
            >
              <span class="ws-check mono">{{ ws.id === store.activeWorkspaceId ? '✓' : ' ' }}</span>
              <div class="ws-item-info">
                <span class="ws-item-label">{{ ws.label }}</span>
                <span class="ws-item-path mono">{{ ws.projectRoot }}</span>
              </div>
              <span v-if="ws.isInitialized === false" class="uninit-badge mono">no .orchestry</span>
            </button>
          </div>

          <div class="dropdown-footer">
            <button type="button" class="open-folder-btn mono" @click="handleOpenModal">
              <span>+</span> Open folder...
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Right Controls Section -->
    <div class="controls-section">
      <!-- Init Prompt Banner (when active workspace is not initialized) -->
      <div v-if="store.activeWorkspace && !store.isInitialized" class="init-prompt-banner">
        <span class="init-warning-glyph">⚠️</span>
        <span class="init-text mono">No .orchestry in workspace</span>
        <Button
          label="Init (.orchestry)"
          icon="pi pi-bolt"
          class="p-button-warning p-button-sm init-btn"
          :loading="store.isInitializing"
          @click="store.initActiveWorkspace()"
        />
      </div>

      <!-- Orchestrator Status Pill + Controls -->
      <div class="orchestrator-controls">
        <!-- Status Pill -->
        <div
          class="status-pill mono"
          :class="{
            watching: store.isWatchRunning,
            locked: !!store.lockError,
            idle: !store.isWatchRunning && !store.lockError,
          }"
          :title="store.lockError || (store.isWatchRunning ? 'Orchestrator watch is running' : 'Orchestrator watch is stopped')"
        >
          <span class="status-glyph">
            {{ store.lockError ? '🔒' : store.isWatchRunning ? '●' : '○' }}
          </span>
          <span class="status-text">
            {{ store.lockError ? 'LOCKED' : store.isWatchRunning ? 'WATCHING' : 'IDLE' }}
          </span>
        </div>

        <!-- Lock Warning Tooltip / Message -->
        <span v-if="store.lockError" class="lock-error-text mono" :title="store.lockError">
          {{ store.lockError }}
        </span>

        <!-- Watch Start/Stop Toggle Button -->
        <Button
          :label="store.isWatchRunning ? 'Stop Watch' : 'Start Watch'"
          :icon="store.isWatchRunning ? 'pi pi-pause' : 'pi pi-play'"
          :class="[
            'p-button-sm',
            store.isWatchRunning ? 'p-button-outlined p-button-secondary' : 'p-button-primary'
          ]"
          :loading="store.isWatchLoading"
          :disabled="!store.activeWorkspace || !store.isInitialized"
          @click="store.toggleWatch()"
        />

        <!-- Run All Quick Button -->
        <Button
          label="Run All"
          icon="pi pi-forward"
          class="p-button-outlined p-button-secondary p-button-sm"
          :loading="isRunningAll"
          :disabled="!store.activeWorkspace || !store.isInitialized"
          @click="handleRunAll"
        />
      </div>
    </div>
  </header>
</template>

<style scoped>
.top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 48px;
  padding: 0 16px;
  background: var(--p-surface-900);
  border-bottom: 1px solid var(--p-surface-800);
  position: relative;
  z-index: 100;
}

.brand-section {
  display: flex;
  align-items: center;
  gap: 20px;
}

.logo {
  display: flex;
  align-items: center;
  gap: 8px;
}

.logo-dot {
  color: var(--p-primary-400);
  font-size: 14px;
}

.logo-text {
  font-weight: 600;
  font-size: 14px;
  letter-spacing: 0.08em;
  color: var(--p-surface-0);
}

.logo-badge {
  background: var(--p-surface-800);
  padding: 2px 6px;
  border-radius: var(--p-radius-sm, 2px);
  color: var(--p-surface-300);
}

/* Workspace Switcher */
.workspace-switcher {
  position: relative;
}

.switcher-button {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--p-surface-950);
  border: 1px solid var(--p-surface-700);
  border-radius: var(--p-radius-sm, 2px);
  padding: 4px 10px;
  color: var(--p-surface-100);
  cursor: pointer;
  transition: all var(--p-motion-duration-fast, 100ms) ease-out;
  max-width: 320px;
}

.switcher-button:hover, .switcher-button.active {
  border-color: var(--p-primary-400);
  background: var(--p-surface-800);
}

.folder-icon {
  font-size: 14px;
}

.workspace-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  overflow: hidden;
  text-align: left;
}

.ws-label {
  font-size: var(--p-text-xs, 12px);
  font-weight: 500;
  color: var(--p-surface-0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}

.ws-path {
  font-size: 10px;
  color: var(--p-surface-400);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 220px;
}

.chevron {
  font-size: 10px;
  color: var(--p-surface-400);
  margin-left: 4px;
}

/* Dropdown */
.switcher-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  width: 340px;
  background: var(--p-surface-900);
  border: 1px solid var(--p-surface-700);
  border-radius: var(--p-radius-md, 4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.dropdown-header {
  padding: 8px 12px;
  background: var(--p-surface-950);
  border-bottom: 1px solid var(--p-surface-800);
  color: var(--p-surface-400);
}

.workspace-list {
  max-height: 220px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.empty-list {
  padding: 12px;
  font-size: var(--p-text-xs, 12px);
  color: var(--p-surface-400);
  text-align: center;
}

.ws-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--p-surface-800);
  color: var(--p-surface-200);
  text-align: left;
  cursor: pointer;
  transition: background var(--p-motion-duration-fast, 100ms) ease-out;
}

.ws-item:last-child {
  border-bottom: none;
}

.ws-item:hover {
  background: var(--p-surface-800);
}

.ws-item.selected {
  background: var(--p-surface-800);
  color: var(--p-primary-400);
}

.ws-check {
  font-size: 12px;
  color: var(--p-primary-400);
  width: 14px;
}

.ws-item-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
}

.ws-item-label {
  font-size: var(--p-text-xs, 12px);
  font-weight: 500;
}

.ws-item-path {
  font-size: 10px;
  color: var(--p-surface-400);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.uninit-badge {
  font-size: 9px;
  color: var(--p-status-warning, #e8a33d);
  background: rgba(232, 163, 61, 0.15);
  padding: 1px 4px;
  border-radius: 2px;
}

.dropdown-footer {
  padding: 6px;
  background: var(--p-surface-950);
  border-top: 1px solid var(--p-surface-800);
}

.open-folder-btn {
  width: 100%;
  padding: 6px;
  background: transparent;
  border: 1px dashed var(--p-surface-700);
  border-radius: var(--p-radius-sm, 2px);
  color: var(--p-signal-400, #5fb3b3);
  font-size: var(--p-text-xs, 12px);
  cursor: pointer;
  transition: all var(--p-motion-duration-fast, 100ms) ease-out;
}

.open-folder-btn:hover {
  background: var(--p-surface-800);
  border-color: var(--p-signal-400, #5fb3b3);
}

/* Controls Section */
.controls-section {
  display: flex;
  align-items: center;
  gap: 16px;
}

/* Init Prompt Banner */
.init-prompt-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 8px;
  background: rgba(232, 163, 61, 0.12);
  border: 1px solid rgba(232, 163, 61, 0.4);
  border-radius: var(--p-radius-sm, 2px);
}

.init-warning-glyph {
  font-size: 12px;
}

.init-text {
  font-size: var(--p-text-xs, 12px);
  color: var(--p-primary-400);
}

.init-btn {
  font-size: 11px !important;
  padding: 2px 8px !important;
}

/* Orchestrator Controls */
.orchestrator-controls {
  display: flex;
  align-items: center;
  gap: 10px;
}

.status-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: 9999px;
  font-size: var(--p-text-xs, 12px);
  font-weight: 500;
  border: 1px solid var(--p-surface-700);
  background: var(--p-surface-950);

  &.watching {
    border-color: var(--p-primary-400);
    color: var(--p-primary-400);

    .status-glyph {
      animation: pulse 1.6s infinite ease-in-out;
    }
  }

  &.locked {
    border-color: var(--p-status-danger, #c1585a);
    color: var(--p-status-danger, #c1585a);
  }

  &.idle {
    color: var(--p-surface-400);
  }
}

.lock-error-text {
  font-size: 11px;
  color: var(--p-status-danger, #c1585a);
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
</style>
