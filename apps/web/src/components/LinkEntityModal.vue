<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import Select from 'primevue/select';
import Checkbox from 'primevue/checkbox';
import InputText from 'primevue/inputtext';

import {
  api,
  type WorkspaceRecord,
  type AgentRecord,
  type TeamRecord,
  type RegistryLinkRecord,
} from '@/api/client';

const props = defineProps<{
  visible: boolean;
  kind: 'agent' | 'team';
  targetWorkspaceId: string;
  defaultRegistryWorkspaceId?: string | null;
  existingLinks?: RegistryLinkRecord[];
}>();

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void;
  (e: 'linked'): void;
}>();

const workspaces = ref<WorkspaceRecord[]>([]);
const selectedSourceWorkspaceId = ref<string>('');
const sourceAgents = ref<AgentRecord[]>([]);
const sourceTeams = ref<TeamRecord[]>([]);

const selectedEntityIds = ref<string[]>([]);
const renames = ref<Record<string, string>>({});

const isLoadingWorkspaces = ref(false);
const isLoadingEntities = ref(false);
const isSubmitting = ref(false);
const errorMessage = ref<string | null>(null);
const collisionInfo = ref<{ sourceAgentId?: string; sourceAgentName?: string; sourceTeamId?: string; sourceTeamName?: string } | null>(null);

const availableWorkspaces = computed(() => {
  return workspaces.value.filter((w) => w.id !== props.targetWorkspaceId);
});

const isAlreadyLinked = (id: string) => {
  if (!props.existingLinks) return false;
  return props.existingLinks.some((l) => l.kind === props.kind && l.sourceEntityId === id);
};

async function loadWorkspaces() {
  isLoadingWorkspaces.value = true;
  try {
    const list = await api.getWorkspaces();
    workspaces.value = list;

    if (props.defaultRegistryWorkspaceId && list.some((w) => w.id === props.defaultRegistryWorkspaceId && w.id !== props.targetWorkspaceId)) {
      selectedSourceWorkspaceId.value = props.defaultRegistryWorkspaceId;
    } else if (availableWorkspaces.value.length > 0) {
      selectedSourceWorkspaceId.value = availableWorkspaces.value[0].id;
    }
  } catch (err) {
    errorMessage.value = 'Failed to load workspaces';
  } finally {
    isLoadingWorkspaces.value = false;
  }
}

async function loadSourceEntities() {
  if (!selectedSourceWorkspaceId.value) return;
  isLoadingEntities.value = true;
  errorMessage.value = null;
  selectedEntityIds.value = [];
  renames.value = {};
  collisionInfo.value = null;

  try {
    if (props.kind === 'agent') {
      sourceAgents.value = await api.getAgents(selectedSourceWorkspaceId.value);
    } else {
      sourceTeams.value = await api.getTeams(selectedSourceWorkspaceId.value);
    }
  } catch (err) {
    errorMessage.value = `Failed to load source ${props.kind}s`;
  } finally {
    isLoadingEntities.value = false;
  }
}

watch(
  () => props.visible,
  (val) => {
    if (val) {
      errorMessage.value = null;
      collisionInfo.value = null;
      loadWorkspaces();
    }
  }
);

watch(selectedSourceWorkspaceId, () => {
  if (props.visible) {
    loadSourceEntities();
  }
});

function toggleSelection(id: string) {
  if (isAlreadyLinked(id)) return;
  const idx = selectedEntityIds.value.indexOf(id);
  if (idx > -1) {
    selectedEntityIds.value.splice(idx, 1);
  } else {
    selectedEntityIds.value.push(id);
  }
}

async function handleLink() {
  if (selectedEntityIds.value.length === 0 || !selectedSourceWorkspaceId.value) return;

  isSubmitting.value = true;
  errorMessage.value = null;
  collisionInfo.value = null;

  try {
    if (props.kind === 'agent') {
      await api.linkAgents(
        props.targetWorkspaceId,
        selectedSourceWorkspaceId.value,
        selectedEntityIds.value,
        renames.value
      );
    } else {
      await api.linkTeams(
        props.targetWorkspaceId,
        selectedSourceWorkspaceId.value,
        selectedEntityIds.value,
        renames.value
      );
    }

    emit('linked');
    emit('update:visible', false);
  } catch (err: any) {
    if (err.status === 409 && err.data?.requiresRename) {
      if (props.kind === 'agent') {
        collisionInfo.value = {
          sourceAgentId: err.data.sourceAgentId,
          sourceAgentName: err.data.sourceAgentName,
        };
        renames.value[err.data.sourceAgentId] = `${err.data.sourceAgentName}-linked`;
      } else {
        collisionInfo.value = {
          sourceTeamId: err.data.sourceTeamId,
          sourceTeamName: err.data.sourceTeamName,
        };
        renames.value[err.data.sourceTeamId] = `${err.data.sourceTeamName}-linked`;
      }
      errorMessage.value = `Name collision detected for "${err.data.sourceAgentName || err.data.sourceTeamName}". Please provide a unique rename below and click Link again.`;
    } else {
      errorMessage.value = err.message || 'Failed to link entities';
    }
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <Dialog
    :visible="visible"
    :header="`Link ${kind === 'agent' ? 'Agents' : 'Teams'} from Registry`"
    :modal="true"
    :style="{ width: '560px' }"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="modal-body">
      <div v-if="errorMessage" class="error-banner mono">
        ⚠ {{ errorMessage }}
      </div>

      <!-- Source Workspace Selector -->
      <div class="field-row">
        <label class="field-label ow-eyebrow">Source Workspace</label>
        <Select
          v-model="selectedSourceWorkspaceId"
          :options="availableWorkspaces"
          option-label="label"
          option-value="id"
          placeholder="Select source workspace"
          class="w-full mono"
          :disabled="isLoadingWorkspaces || isSubmitting"
        />
      </div>

      <!-- Entity Picker -->
      <div class="entities-section">
        <div class="section-header ow-eyebrow">
          Select {{ kind === 'agent' ? 'Agents' : 'Teams' }} to Link
        </div>

        <div v-if="isLoadingEntities" class="loading-state mono">
          Loading {{ kind }}s...
        </div>

        <div v-else-if="kind === 'agent' && sourceAgents.length === 0" class="empty-state mono">
          No agents found in source workspace.
        </div>

        <div v-else-if="kind === 'team' && sourceTeams.length === 0" class="empty-state mono">
          No teams found in source workspace.
        </div>

        <div v-else class="entities-list">
          <template v-if="kind === 'agent'">
            <div
              v-for="ag in sourceAgents"
              :key="ag.id"
              class="entity-item"
              :class="{ disabled: isAlreadyLinked(ag.id) }"
              @click="toggleSelection(ag.id)"
            >
              <Checkbox
                :model-value="selectedEntityIds.includes(ag.id) || isAlreadyLinked(ag.id)"
                :disabled="isAlreadyLinked(ag.id)"
                :binary="true"
              />
              <div class="entity-info">
                <span class="entity-name">{{ ag.name }}</span>
                <span class="entity-sub mono">{{ ag.adapter }} • {{ ag.model || 'default' }}</span>
              </div>
              <span v-if="isAlreadyLinked(ag.id)" class="linked-tag mono">ALREADY LINKED</span>
            </div>
          </template>

          <template v-else>
            <div
              v-for="tm in sourceTeams"
              :key="tm.id"
              class="entity-item"
              :class="{ disabled: isAlreadyLinked(tm.id) }"
              @click="toggleSelection(tm.id)"
            >
              <Checkbox
                :model-value="selectedEntityIds.includes(tm.id) || isAlreadyLinked(tm.id)"
                :disabled="isAlreadyLinked(tm.id)"
                :binary="true"
              />
              <div class="entity-info">
                <span class="entity-name">{{ tm.name }}</span>
                <span class="entity-sub mono">Lead: {{ tm.lead_agent_id }}</span>
              </div>
              <span v-if="isAlreadyLinked(tm.id)" class="linked-tag mono">ALREADY LINKED</span>
            </div>
          </template>
        </div>
      </div>

      <!-- Rename on Collision Input -->
      <div v-if="collisionInfo" class="collision-box">
        <label class="field-label ow-eyebrow">
          Rename Target {{ kind === 'agent' ? 'Agent' : 'Team' }}
        </label>
        <InputText
          v-if="collisionInfo.sourceAgentId"
          v-model="renames[collisionInfo.sourceAgentId]"
          class="w-full mono p-inputtext-sm"
          placeholder="New name in target workspace"
        />
        <InputText
          v-else-if="collisionInfo.sourceTeamId"
          v-model="renames[collisionInfo.sourceTeamId]"
          class="w-full mono p-inputtext-sm"
          placeholder="New name in target workspace"
        />
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
          :label="isSubmitting ? 'Linking...' : 'Link Selected'"
          icon="pi pi-link"
          class="p-button-primary p-button-sm mono"
          :disabled="selectedEntityIds.length === 0 || isSubmitting"
          :loading="isSubmitting"
          @click="handleLink"
        />
      </div>
    </template>
  </Dialog>
</template>

<style scoped>
.modal-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-top: 8px;
}

.error-banner {
  padding: 10px 14px;
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: var(--p-status-error, #ef4444);
  font-size: 12px;
  border-radius: 4px;
}

.field-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 11px;
  color: var(--p-surface-400);
}

.entities-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-header {
  font-size: 11px;
  color: var(--p-surface-400);
}

.entities-list {
  max-height: 240px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: var(--p-surface-950);
  border: 1px solid var(--p-surface-800);
  border-radius: 4px;
  padding: 8px;
}

.entity-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  background: var(--p-surface-900);
  border: 1px solid var(--p-surface-800);
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.entity-item:hover:not(.disabled) {
  background: var(--p-surface-800);
  border-color: var(--p-primary-400);
}

.entity-item.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.entity-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.entity-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--p-surface-100);
}

.entity-sub {
  font-size: 11px;
  color: var(--p-surface-400);
}

.linked-tag {
  font-size: 10px;
  color: var(--p-surface-500);
}

.loading-state,
.empty-state {
  padding: 20px;
  text-align: center;
  font-size: 12px;
  color: var(--p-surface-400);
  background: var(--p-surface-950);
  border: 1px solid var(--p-surface-800);
  border-radius: 4px;
}

.collision-box {
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.3);
  padding: 12px;
  border-radius: 4px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
