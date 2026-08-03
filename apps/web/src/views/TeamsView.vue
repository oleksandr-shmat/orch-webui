<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';

import DetailPanelTeam from '@/components/DetailPanelTeam.vue';
import LinkEntityModal from '@/components/LinkEntityModal.vue';

import { useWorkspaceStore } from '@/stores/workspace';
import { useRegistry } from '@/composables/useRegistry';
import { api, type TeamRecord } from '@/api/client';

const store = useWorkspaceStore();
const registry = useRegistry();

const teams = ref<TeamRecord[]>([]);
const isLoading = ref(false);
const searchQuery = ref('');

const selectedTeamId = ref<string | null>(null);
const isDetailOpen = ref(false);
const isLinkModalOpen = ref(false);

async function loadData() {
  if (!store.activeWorkspace?.id) return;
  isLoading.value = true;
  try {
    const [fetchedTeams] = await Promise.all([
      api.getTeams(store.activeWorkspace.id),
      registry.loadRegistry(store.activeWorkspace.id),
    ]);
    teams.value = fetchedTeams;
  } catch (err) {
    console.error('Failed to load teams:', err);
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

function openTeamDetail(teamId: string) {
  selectedTeamId.value = teamId;
  isDetailOpen.value = true;
}

async function handleSyncTeam(linkId: string) {
  if (!store.activeWorkspace?.id) return;
  try {
    await registry.syncSingleTeam(store.activeWorkspace.id, linkId);
    await loadData();
  } catch (err) {
    console.error('Failed to sync team:', err);
  }
}
</script>

<template>
  <div class="view-container">
    <div class="view-header">
      <div class="header-left">
        <h1 class="view-title">Teams</h1>
        <span class="ow-eyebrow view-subtitle mono">
          Workspace: {{ store.activeWorkspace?.label || 'None' }}
        </span>
      </div>
      <div class="header-actions">
        <Button
          icon="pi pi-link"
          label="Link Teams..."
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
          placeholder="Search teams by name, lead agent, or description..."
          class="p-inputtext-sm mono search-input"
        />
      </span>
    </div>

    <!-- Teams Grid -->
    <div v-if="isLoading && teams.length === 0" class="placeholder-card mono">
      <span class="spin-glyph">↻</span> Loading teams...
    </div>

    <div v-else-if="teams.length === 0" class="placeholder-card">
      <div class="card-header ow-eyebrow">Team Roster</div>
      <div class="empty-prompt mono">
        <span class="prompt-sigil">$</span> orch team add "TeamName" --lead agt_lead
      </div>
      <p class="empty-desc">
        No teams defined in this workspace. Create teams via CLI or link them from another workspace.
      </p>
    </div>

    <div v-else class="teams-grid">
      <div
        v-for="tm in teams"
        :key="tm.id"
        class="team-card"
        @click="openTeamDetail(tm.id)"
      >
        <div class="card-top-row">
          <div class="team-identity">
            <span class="team-name">{{ tm.name }}</span>
            <span class="team-id mono">#{{ tm.id }}</span>
          </div>

          <span v-if="registry.getLinkForTeam(tm.id)" class="linked-pill mono">
            🔗 LINKED
          </span>
        </div>

        <p v-if="tm.description" class="team-desc">{{ tm.description }}</p>

        <div class="team-meta mono">
          <div class="meta-item">
            <span class="meta-label">LEAD</span>
            <span class="lead-badge">@{{ tm.lead_agent_id }}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">MEMBERS</span>
            <span class="meta-val">{{ tm.member_agent_ids?.length || 0 }}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">TASKS</span>
            <span class="meta-val">{{ tm.task_ids?.length || 0 }}</span>
          </div>
        </div>

        <!-- Members snippet -->
        <div v-if="tm.member_agent_ids && tm.member_agent_ids.length > 0" class="members-row mono">
          <span v-for="mId in tm.member_agent_ids.slice(0, 4)" :key="mId" class="member-chip">
            @{{ mId }}
          </span>
          <span v-if="tm.member_agent_ids.length > 4" class="more-chip">
            +{{ tm.member_agent_ids.length - 4 }} more
          </span>
        </div>

        <!-- Linked Sync Action Bar -->
        <div v-if="registry.getLinkForTeam(tm.id)" class="card-link-actions" @click.stop>
          <span class="link-label mono">Linked team</span>
          <Button
            icon="pi pi-sync"
            label="Sync Team"
            class="p-button-outlined p-button-secondary p-button-xs mono"
            :loading="registry.isSyncing.value"
            @click="handleSyncTeam(registry.getLinkForTeam(tm.id)!.id)"
          />
        </div>
      </div>
    </div>

    <!-- Link Modal -->
    <LinkEntityModal
      v-model:visible="isLinkModalOpen"
      kind="team"
      :target-workspace-id="store.activeWorkspace?.id || ''"
      :default-registry-workspace-id="registry.settings.value.defaultRegistryWorkspaceId"
      :existing-links="registry.links.value"
      @linked="loadData"
    />

    <!-- Detail Panel Slide-Over -->
    <DetailPanelTeam
      v-model:visible="isDetailOpen"
      :team-id="selectedTeamId"
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

.teams-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.team-card {
  background: var(--p-surface-900);
  border: 1px solid var(--p-surface-800);
  border-radius: 4px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.team-card:hover {
  border-color: var(--p-primary-400, #e8a33d);
  background: var(--p-surface-800);
}

.card-top-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.team-identity {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.team-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--p-surface-0);
}

.team-id {
  font-size: 11px;
  color: var(--p-primary-400);
}

.linked-pill {
  font-size: 10px;
  padding: 2px 6px;
  background: var(--p-surface-800);
  color: var(--p-signal-400, #5fb3b3);
  border-radius: 9999px;
  border: 1px solid var(--p-surface-700);
}

.team-desc {
  font-size: 12px;
  color: var(--p-surface-300);
  margin: 0;
  line-height: 1.4;
}

.team-meta {
  display: flex;
  gap: 16px;
  padding: 8px 12px;
  background: var(--p-surface-950);
  border: 1px solid var(--p-surface-800);
  border-radius: 4px;
}

.meta-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.meta-label {
  font-size: 9px;
  color: var(--p-surface-400);
}

.meta-val {
  font-size: 12px;
  color: var(--p-surface-100);
  font-weight: 600;
}

.lead-badge {
  font-size: 11px;
  color: var(--p-signal-400, #5fb3b3);
  font-weight: 500;
}

.members-row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.member-chip {
  font-size: 10px;
  color: var(--p-surface-300);
  background: var(--p-surface-800);
  padding: 2px 6px;
  border-radius: 2px;
}

.more-chip {
  font-size: 10px;
  color: var(--p-surface-400);
}

.card-link-actions {
  margin-top: 4px;
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
