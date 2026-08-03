<script setup lang="ts">
import { RouterView } from 'vue-router';
</script>

<template>
  <div class="orch-app-shell">
    <header class="orch-header">
      <div class="brand">
        <span class="logo-glyph">●</span>
        <span class="brand-title">ORCH</span>
        <span class="ow-eyebrow">Web UI</span>
      </div>
    </header>
    <main class="orch-main">
      <RouterView />
    </main>
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

.orch-header {
  display: flex;
  align-items: center;
  height: 48px;
  padding: 0 16px;
  background: var(--p-surface-900);
  border-bottom: 1px solid var(--p-surface-800);
}

.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--p-font-mono);
}

.logo-glyph {
  color: var(--p-primary-400);
}

.brand-title {
  font-weight: 600;
  letter-spacing: 0.05em;
}

.orch-main {
  flex: 1;
}
</style>
