<script setup lang="ts">
import Card from 'primevue/card';
import Button from 'primevue/button';
</script>

<template>
  <div class="placeholder-container">
    <Card class="placeholder-card">
      <template #title>
        <div class="card-title-row">
          <span class="status-dot">●</span>
          <span>ORCH Web UI</span>
        </div>
      </template>
      <template #subtitle>
        App Shell Placeholder
      </template>
      <template #content>
        <p class="placeholder-text">
          Frontend scaffold ready: Vue 3, Vite, PrimeVue (Aura preset with custom dark theme),
          @tanstack/vue-query, Pinia, and Vue Router configured.
        </p>
      </template>
      <template #footer>
        <Button label="Scaffold Active" icon="pi pi-check" severity="primary" size="small" />
      </template>
    </Card>
  </div>
</template>

<style scoped>
.placeholder-container {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 3rem 1rem;
}

.placeholder-card {
  max-width: 540px;
  width: 100%;
}

.card-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-dot {
  color: var(--p-primary-400);
}

.placeholder-text {
  margin: 0;
  line-height: var(--p-line-height-body);
  color: var(--p-surface-200);
}
</style>
