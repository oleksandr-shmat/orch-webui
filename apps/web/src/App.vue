<script setup lang="ts">
import { onMounted } from 'vue';
import { RouterView } from 'vue-router';
import TopBar from '@/components/shell/TopBar.vue';
import TabBar from '@/components/shell/TabBar.vue';
import AppFooter from '@/components/shell/AppFooter.vue';
import BrowseFolderModal from '@/components/shell/BrowseFolderModal.vue';
import { useWorkspaceStore } from '@/stores/workspace';

const workspaceStore = useWorkspaceStore();

onMounted(() => {
  workspaceStore.fetchWorkspaces();
});
</script>

<template>
  <div class="orch-app-shell">
    <!-- Top Bar: workspace switcher, init prompt banner, orchestrator status pill & watch controls -->
    <TopBar />

    <!-- Tab Bar: Tasks, Agents, Goals, Teams, Activity navigation -->
    <TabBar />

    <!-- Main Content Area -->
    <main class="orch-main">
      <RouterView />
    </main>

    <!-- Footer Status Bar -->
    <AppFooter />

    <!-- Open Workspace Browse Modal -->
    <BrowseFolderModal />
  </div>
</template>

<style scoped>
.orch-app-shell {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: var(--p-surface-950);
  color: var(--p-surface-0);
}

.orch-main {
  flex: 1;
  background: var(--p-surface-950);
  display: flex;
  flex-direction: column;
}
</style>
