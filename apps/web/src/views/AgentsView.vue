<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';

import DetailPanelAgent from '@/components/DetailPanelAgent.vue';
import LinkEntityModal from '@/components/LinkEntityModal.vue';
import ConfirmRecreateModal from '@/components/ConfirmRecreateModal.vue';

import { useWorkspaceStore } from '@/stores/workspace';
import { useRegistry } from '@/composables/useRegistry';
import { api, type AgentRecord } from '@/api/client';
import { agentStatus } from '@/theme/status';

const store = useWorkspaceStore();
const registry = useRegistry();

const agents = ref<AgentRecord[]>([]);
const isLoading = ref(false);
const searchQuery = ref('');

const selectedAgentId = ref<string | null>(null);
const isDetailOpen = ref(false);

// Link & Recreate modals
const isLinkModalOpen = ref(false);
const isRecreateModalOpen = ref(false);
const targetRecreateAgent = ref<{ linkId: string; name: string } | null>(null);

async function loadData() {
  if (!store.activeWorkspace?.id) return;
  isLoading.value = true;
  try {
    const [fetchedAgents] = await Promise.all([
      api.getAgents(store.activeWorkspace.id),
      registry.loadRegistry(store.activeWorkspace.id),
    ]);
    agents.value = fetchedAgents;
  } catch (err) {
    console.error('Failed to load agents or registry:', err);
  } finally {
    isLoading.value = false;
  }
}

watch(
  () => store.activeWorkspace?.id,
  (id) => {
    if (id) loadData();
  },
  { immediate: true }
);

onMounted(() => {
  if (store.activeWorkspace?.id) {
    loadData();
  }
});

function openAgentDetail(agentId: string) {
  selectedAgentId.value = agentId;
  isDetailOpen.value = true;
}

async function handleSyncSingle(linkId: string) {
  if (!store.activeWorkspace?.id) return;
  try {
    await registry.syncSingleAgent(store.activeWorkspace.id, linkId);
    await loadData();
  } catch (err) {
    console.error('Failed to sync agent:', err);
  }
}

function promptRecreate(linkId: string, agentName: string) {
  targetRecreateAgent.value = { linkId, name: agentName };
  isRecreateModalOpen.value = true;
}

async function handleSyncAllOutdated() {
  if (!store.activeWorkspace?.id) return;
  await registry.syncAllOutdated(store.activeWorkspace.id);
  await loadData();
}
</script>

<template>
  <div class="view-container">
    <div class="view-header">
      <div class="header-left">
        <h1 class="view-title">Agents</h1>
        <span class="ow-eyebrow view-subtitle mono">
          Workspace: {{ store.activeWorkspace?.label || 'None' }}
        </span>
      </div>
      <div class="header-actions">
        <Button
          v-if="registry.staleAgentCount.value > 0"
          icon="pi pi-sync"
          :label="`Sync ${registry.staleAgentCount.value} Outdated`"
          class="p-button-warning p-button-sm mono"
          :loading="registry.isSyncing.value"
          @click="handleSyncAllOutdated"
        />
        <Button
          icon="pi pi-link"
          label="Link Agents..."
          class="p-button-outlined p-button-primary p-button-sm mono"
          @click="isLinkModalOpen = true"
        />
        <Button
          icon="pi pi-refresh"
          label="Refresh"
          class="p-button-outlined p-button-secondary p-button-sm mono"
          :loading="isLoading"
          @click="loadData"
        />
      </div>
    </div>

    <!-- Filter Bar -->
    <div class="filter-bar">
      <span class="p-input-icon-left search-wrap">
        <i class="pi pi-search" />
        <InputText
          v-model="searchQuery"
          placeholder="Search agents by name, adapter, model or skill..."
          class="p-inputtext-sm mono search-input"
        />
      </span>
    </div>

    <!-- Agents Grid -->
    <div v-if="isLoading && agents.length === 0" class="placeholder-card mono">
      <span class="spin-glyph">↻</span> Loading agents...
    </div>

    <div v-else-if="agents.length === 0" class="placeholder-card">
      <div class="card-header ow-eyebrow">Agent Registry</div>
      <div class="empty-prompt mono">
        <span class="prompt-sigil">$</span> orch agent add "AgentName" --adapter claude --role "Role description"
      </div>
      <p class="empty-desc">
        No agents found in this workspace. Create agents via CLI or link them from the main registry.
      </p>
    </div>

    <div v-else class="agents-grid">
      <div
        v-for="ag in agents"
        :key="ag.id"
        class="agent-card"
        @click="openAgentDetail(ag.id)"
      >
        <div class="card-top-row">
          <div class="agent-identity">
            <span class="agent-name">{{ ag.name }}</span>
            <span class="agent-id mono">#{{ ag.id }}</span>
          </div>

          <div class="top-pills">
            <!-- Status Pill -->
            <span
              class="status-pill mono"
              :style="{ color: agentStatus[ag.status]?.color, borderColor: agentStatus[ag.status]?.color }"
            >
              {{ agentStatus[ag.status]?.glyph }} {{ agentStatus[ag.status]?.label }}
            </span>

            <!-- Staleness Badge if Linked -->
            <template v-if="registry.getLinkForAgent(ag.id)">
              <span
                v-if="registry.getStalenessForAgent(ag.id)?.stale"
                class="staleness-pill stale mono"
                title="Registry source has changed"
              >
                ⚠ Outdated
              </span>
              <span
                v-else
                class="staleness-pill sync mono"
                title="In sync with source registry"
              >
                ✓ In Sync
              </span>
            </template>
          </div>
        </div>

        <p v-if="ag.role" class="agent-role">{{ ag.role }}</p>

        <div class="meta-row mono">
          <span class="meta-badge adapter">{{ ag.adapter }}</span>
          <span v-if="ag.model" class="meta-badge model">{{ ag.model }}</span>
          <span v-if="ag.effort" class="meta-badge effort">{{ ag.effort }}</span>
        </div>

        <!-- Skills list -->
        <div v-if="ag.skills && ag.skills.length > 0" class="skills-row mono">
          <span v-for="s in ag.skills" :key="s" class="skill-tag">/{{ s }}</span>
        </div>

        <!-- Linked Action Bar -->
        <div v-if="registry.getLinkForAgent(ag.id)" class="card-link-actions" @click.stop>
          <span class="link-label mono">Linked from source</span>

          <div class="link-btns">
            <Button
              v-if="registry.getStalenessForAgent(ag.id)?.stale"
              icon="pi pi-sync"
              label="Sync"
              class="p-button-warning p-button-xs mono"
              :loading="registry.isSyncing.value"
              @click="handleSyncSingle(registry.getLinkForAgent(ag.id)!.id)"
            />
            <Button
              v-if="registry.getStalenessForAgent(ag.id)?.stale"
              icon="pi pi-refresh"
              label="Recreate"
              class="p-button-danger p-button-xs mono"
              @click="promptRecreate(registry.getLinkForAgent(ag.id)!.id, ag.name)"
            />
          </div>
        </div>

      </div>
    </div>

    <!-- Modals -->
    <LinkEntityModal
      v-model:visible="isLinkModalOpen"
      kind="agent"
      :target-workspace-id="store.activeWorkspace?.id || ''"
      :default-registry-workspace-id="registry.settings.value.defaultRegistryWorkspaceId"
      :existing-links="registry.links.value"
      @linked="loadData"
    />

    <ConfirmRecreateModal
      v-if="targetRecreateAgent"
      v-model:visible="isRecreateModalOpen"
      :link-id="targetRecreateAgent.linkId"
      :target-agent-name="targetRecreateAgent.name"
      :target-workspace-id="store.activeWorkspace?.id || ''"
      @recreated="loadData"
    />

    <!-- Detail Panel Slide-Over -->
    <DetailPanelAgent
      v-model:visible="isDetailOpen"
      :agent-id="selectedAgentId"
      @updated="loadData"
      @deleted="loadData"
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
}

.search-wrap {
  flex: 1;
}

.search-input {
  width: 100%;
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

.agents-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.agent-card {
  background: var(--p-surface-900);
  border: 1px solid var(--p-surface-800);
  border-radius: 4px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.agent-card:hover {
  border-color: var(--p-primary-400, #e8a33d);
  background: var(--p-surface-800);
}

.card-top-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.agent-identity {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.agent-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--p-surface-0);
}

.agent-id {
  font-size: 11px;
  color: var(--p-primary-400);
}

.top-pills {
  display: flex;
  gap: 6px;
  align-items: center;
}

.status-pill {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 9999px;
  border: 1px solid currentColor;
}

.staleness-pill {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 9999px;
}

.staleness-pill.stale {
  background: rgba(245, 158, 11, 0.15);
  border: 1px solid rgba(245, 158, 11, 0.4);
  color: var(--p-primary-400, #f59e0b);
}

.staleness-pill.sync {
  background: rgba(91, 154, 111, 0.15);
  border: 1px solid rgba(91, 154, 111, 0.4);
  color: var(--p-status-success, #5b9a6f);
}

.agent-role {
  font-size: 12px;
  color: var(--p-surface-300);
  margin: 0;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.meta-row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.meta-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 2px;
  background: var(--p-surface-800);
  color: var(--p-surface-300);
}

.meta-badge.adapter {
  background: var(--p-surface-950);
  color: var(--p-signal-400, #5fb3b3);
  border: 1px solid var(--p-surface-800);
}

.skills-row {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.skill-tag {
  font-size: 10px;
  color: var(--p-primary-400);
  background: var(--p-surface-950);
  padding: 1px 5px;
  border-radius: 2px;
}

.card-link-actions {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--p-surface-800);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.link-label {
  font-size: 10px;
  color: var(--p-surface-400);
}

.link-btns {
  display: flex;
  gap: 6px;
}

.p-button-xs {
  font-size: 10px !important;
  padding: 2px 8px !important;
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
