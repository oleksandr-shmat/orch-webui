<script setup lang="ts">
import { ref, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import { useWorkspaceStore } from '@/stores/workspace';
import { api, type BrowseItem } from '@/api/client';

const store = useWorkspaceStore();

const customPath = ref('~');
const currentPath = ref('~');
const parentPath = ref<string | null>(null);
const items = ref<BrowseItem[]>([]);
const isLoading = ref(false);
const isSubmitting = ref(false);
const errorMessage = ref<string | null>(null);

async function loadDirectory(path: string) {
  isLoading.value = true;
  errorMessage.value = null;
  try {
    const data = await api.browseDirectory(path);
    currentPath.value = data.currentPath;
    customPath.value = data.currentPath;
    parentPath.value = data.parentPath;
    items.value = data.items;
  } catch (err: any) {
    errorMessage.value = err.message || 'Failed to browse directory';
  } finally {
    isLoading.value = false;
  }
}

watch(
  () => store.isBrowseModalOpen,
  (open) => {
    if (open) {
      const initial = store.activeWorkspace?.projectRoot || '~';
      loadDirectory(initial);
    }
  }
);

function navigateUp() {
  if (parentPath.value) {
    loadDirectory(parentPath.value);
  }
}

function selectItem(item: BrowseItem) {
  if (item.isDir) {
    loadDirectory(item.path);
  }
}

async function handleConfirm() {
  if (!customPath.value.trim()) return;
  isSubmitting.value = true;
  errorMessage.value = null;
  try {
    await store.registerAndSelect(customPath.value.trim());
    store.closeBrowseModal();
  } catch (err: any) {
    errorMessage.value = err.message || 'Could not register workspace folder';
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <Dialog
    :visible="store.isBrowseModalOpen"
    modal
    header="Open Workspace Folder"
    :style="{ width: '560px' }"
    :breakpoints="{ '960px': '75vw', '641px': '90vw' }"
    @update:visible="(val) => (!val ? store.closeBrowseModal() : null)"
    class="browse-dialog"
  >
    <div class="browse-container">
      <div class="path-input-group">
        <label class="ow-eyebrow">Project Root Path</label>
        <div class="input-row">
          <InputText
            v-model="customPath"
            placeholder="/path/to/project"
            class="path-input mono"
            @keyup.enter="handleConfirm"
          />
          <Button
            label="Open"
            icon="pi pi-check"
            class="p-button-primary"
            :loading="isSubmitting"
            @click="handleConfirm"
          />
        </div>
      </div>

      <div class="browser-section">
        <div class="browser-header">
          <span class="ow-eyebrow">Directory Browser</span>
          <span class="current-path mono">{{ currentPath }}</span>
        </div>

        <div class="file-tree">
          <div v-if="isLoading" class="tree-message mono">
            <span class="spin-glyph">↻</span> Loading directory...
          </div>
          <div v-else-if="errorMessage" class="tree-error mono">
            <span class="error-glyph">✗</span> {{ errorMessage }}
          </div>
          <div v-else class="tree-list">
            <button
              v-if="parentPath"
              type="button"
              class="tree-item parent-item mono"
              @click="navigateUp"
            >
              <span class="item-icon">📁</span>
              <span class="item-name">.. (parent directory)</span>
            </button>

            <button
              v-for="item in items"
              :key="item.path"
              type="button"
              class="tree-item mono"
              :class="{ 'has-orch': item.hasOrchestry }"
              @click="selectItem(item)"
            >
              <span class="item-icon">{{ item.isDir ? '📁' : '📄' }}</span>
              <span class="item-name">{{ item.name }}</span>
              <span v-if="item.hasOrchestry" class="orch-badge">.orchestry</span>
            </button>

            <div v-if="items.length === 0" class="tree-empty mono">
              $ no subdirectories found in {{ currentPath }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="modal-footer">
        <Button label="Cancel" class="p-button-text p-button-secondary" @click="store.closeBrowseModal()" />
        <Button label="Select Current Folder" class="p-button-primary" :loading="isSubmitting" @click="handleConfirm" />
      </div>
    </template>
  </Dialog>
</template>

<style scoped>
.browse-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.path-input-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.input-row {
  display: flex;
  gap: 8px;
}

.path-input {
  flex: 1;
  font-size: var(--p-text-sm, 13px);
  background: var(--p-surface-950);
  color: var(--p-surface-0);
  border: 1px solid var(--p-surface-700);
  border-radius: var(--p-radius-sm, 2px);
  padding: 6px 10px;
}

.browser-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.browser-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.current-path {
  font-size: var(--p-text-xs, 12px);
  color: var(--p-surface-400);
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-tree {
  background: var(--p-surface-950);
  border: 1px solid var(--p-surface-800);
  border-radius: var(--p-radius-sm, 2px);
  height: 240px;
  overflow-y: auto;
  padding: 4px;
}

.tree-list {
  display: flex;
  flex-direction: column;
}

.tree-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: transparent;
  border: none;
  color: var(--p-surface-200);
  font-size: var(--p-text-xs, 12px);
  text-align: left;
  cursor: pointer;
  border-radius: var(--p-radius-sm, 2px);
  transition: background var(--p-motion-duration-fast, 100ms) ease-out;
}

.tree-item:hover {
  background: var(--p-surface-800);
  color: var(--p-surface-0);
}

.tree-item.has-orch {
  color: var(--p-primary-400);
}

.orch-badge {
  margin-left: auto;
  font-size: 10px;
  background: rgba(232, 163, 61, 0.15);
  color: var(--p-primary-400);
  padding: 1px 6px;
  border-radius: 9999px;
  border: 1px solid rgba(232, 163, 61, 0.3);
}

.tree-message, .tree-error, .tree-empty {
  padding: 16px;
  font-size: var(--p-text-xs, 12px);
  color: var(--p-surface-400);
}

.tree-error {
  color: var(--p-status-danger, #c1585a);
}

.spin-glyph {
  display: inline-block;
  animation: spin 1.2s infinite linear;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
