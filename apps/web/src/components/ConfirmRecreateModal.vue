<script setup lang="ts">
import { ref, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import { api, type RecreatePreviewResponse, getErrorMessage } from '@/api/client';

const props = defineProps<{
  visible: boolean;
  linkId: string;
  targetAgentName: string;
  targetWorkspaceId: string;
}>();

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void;
  (e: 'recreated'): void;
}>();

const isLoadingPreview = ref(false);
const isRecreating = ref(false);
const previewData = ref<RecreatePreviewResponse | null>(null);
const errorMessage = ref<string | null>(null);

async function loadPreview() {
  if (!props.linkId || !props.targetWorkspaceId) return;
  isLoadingPreview.value = true;
  errorMessage.value = null;
  try {
    previewData.value = await api.previewRecreateAgent(props.targetWorkspaceId, props.linkId);
  } catch (err) {
    errorMessage.value = getErrorMessage(err) || 'Failed to load recreate preview';
  } finally {
    isLoadingPreview.value = false;
  }
}

watch(
  () => props.visible,
  (val) => {
    if (val) {
      loadPreview();
    }
  }
);

async function handleConfirmRecreate() {
  isRecreating.value = true;
  errorMessage.value = null;
  try {
    await api.recreateAgent(props.targetWorkspaceId, props.linkId, true);
    emit('recreated');
    emit('update:visible', false);
  } catch (err) {
    errorMessage.value = getErrorMessage(err) || 'Failed to recreate agent';
  } finally {
    isRecreating.value = false;
  }
}
</script>

<template>
  <Dialog
    :visible="visible"
    header="Confirm Agent Recreate"
    :modal="true"
    :style="{ width: '500px' }"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="modal-body">
      <div class="alert-box danger mono">
        ⚠ Recreating agent <strong>"{{ targetAgentName }}"</strong> is a DESTRUCTIVE action!
      </div>

      <p class="description">
        The existing agent will be permanently removed from this workspace and re-created from the updated registry snapshot.
      </p>

      <div v-if="isLoadingPreview" class="loading-state mono">
        Checking warnings...
      </div>

      <div v-else-if="errorMessage" class="error-banner mono">
        {{ errorMessage }}
      </div>

      <div v-else-if="previewData" class="warnings-box">
        <div v-if="previewData.hasTeamLeadWarning" class="warning-item mono">
          ● Warning: This agent is currently designated as a Team Lead.
        </div>
        <div v-if="previewData.runningTasksWarningCount && previewData.runningTasksWarningCount > 0" class="warning-item mono">
          ● Warning: Agent has {{ previewData.runningTasksWarningCount }} running task(s).
        </div>
        <div v-if="previewData.warnings && previewData.warnings.length > 0" class="warning-list">
          <div v-for="(w, idx) in previewData.warnings" :key="idx" class="warning-item mono">
            ● {{ w }}
          </div>
        </div>
        <div v-if="!previewData.hasTeamLeadWarning && !previewData.runningTasksWarningCount && (!previewData.warnings || previewData.warnings.length === 0)" class="no-warning mono">
          ✓ No active task or team lead conflicts detected.
        </div>
      </div>
    </div>

    <template #footer>
      <div class="modal-footer">
        <Button
          label="Cancel"
          class="p-button-text p-button-secondary p-button-sm mono"
          @click="emit('update:visible', false)"
        />
        <Button
          label="Confirm & Recreate"
          icon="pi pi-refresh"
          class="p-button-danger p-button-sm mono"
          :loading="isRecreating"
          @click="handleConfirmRecreate"
        />
      </div>
    </template>
  </Dialog>
</template>

<style scoped>
.modal-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-top: 8px;
}

.alert-box {
  padding: 10px 14px;
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: var(--p-status-error, #ef4444);
  font-size: 13px;
  border-radius: 4px;
}

.description {
  font-size: 13px;
  color: var(--p-surface-300);
  margin: 0;
  line-height: 1.5;
}

.warnings-box {
  background: var(--p-surface-950);
  border: 1px solid var(--p-surface-800);
  border-radius: 4px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.warning-item {
  color: var(--p-primary-400, #f59e0b);
  font-size: 12px;
}

.no-warning {
  color: var(--p-status-success, #5b9a6f);
  font-size: 12px;
}

.loading-state {
  font-size: 12px;
  color: var(--p-surface-400);
}

.error-banner {
  color: var(--p-status-error, #ef4444);
  font-size: 12px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
