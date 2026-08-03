<script setup lang="ts">
import { computed } from 'vue';
import Drawer from 'primevue/drawer';
import Button from 'primevue/button';
import Message from 'primevue/message';
import type { StatusVisual } from '@/theme/status';

const props = withDefaults(
  defineProps<{
    visible: boolean;
    kind: 'task' | 'agent' | 'goal' | 'team';
    title: string;
    subtitle?: string;
    statusVisual?: StatusVisual;
    loading?: boolean;
    error?: string | null;
  }>(),
  {
    visible: false,
    subtitle: '',
    loading: false,
    error: null,
  }
);

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'close'): void;
}>();

const kindLabel = computed(() => props.kind.toUpperCase());

function handleClose() {
  emit('update:visible', false);
  emit('close');
}
</script>

<template>
  <Drawer
    :visible="visible"
    position="right"
    :style="{ width: '560px', maxWidth: '100vw' }"
    class="ow-detail-drawer"
    :modal="true"
    :dismissable="true"
    @update:visible="(val) => emit('update:visible', val)"
  >
    <template #header>
      <div class="drawer-header-content">
        <div class="header-top-row">
          <span class="kind-badge ow-eyebrow" :class="`kind-${kind}`">{{ kindLabel }}</span>
          <span v-if="statusVisual" class="status-pill mono" :style="{ color: statusVisual.color, borderColor: statusVisual.color }">
            <span class="status-glyph">{{ statusVisual.glyph }}</span>
            <span class="status-label">{{ statusVisual.label }}</span>
          </span>
        </div>
        <div class="header-main-row">
          <h2 class="drawer-title" :title="title">{{ title }}</h2>
        </div>
        <div v-if="subtitle" class="drawer-subtitle mono" :title="subtitle">
          {{ subtitle }}
        </div>
      </div>
    </template>

    <div class="drawer-body">
      <!-- Error Notification -->
      <Message v-if="error" severity="error" :closable="false" class="drawer-error mono">
        <span class="error-sigil">✗</span> {{ error }}
      </Message>

      <!-- Loading State -->
      <div v-if="loading" class="drawer-loading mono">
        <span class="spin-glyph">↻</span> Loading {{ kind }} details...
      </div>

      <!-- Main Slot Content -->
      <div v-else class="drawer-content">
        <slot />
      </div>
    </div>

    <template #footer>
      <div class="drawer-footer">
        <slot name="actions">
          <Button label="Close" icon="pi pi-times" class="p-button-text p-button-secondary" @click="handleClose" />
        </slot>
      </div>
    </template>
  </Drawer>
</template>

<style scoped>
.ow-detail-drawer {
  background: var(--p-surface-950);
  border-left: 1px solid var(--p-surface-800);
}

.drawer-header-content {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}

.header-top-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.kind-badge {
  font-size: var(--p-text-2xs, 11px);
  padding: 2px 8px;
  border-radius: var(--p-radius-sm, 2px);
  background: var(--p-surface-900);
  border: 1px solid var(--p-surface-700);
  color: var(--p-surface-200);
  letter-spacing: 0.05em;
}

.kind-badge.kind-task {
  border-color: rgba(232, 163, 61, 0.4);
  color: var(--p-primary-400, #e8a33d);
}

.kind-badge.kind-agent {
  border-color: rgba(95, 179, 179, 0.4);
  color: var(--p-signal-400, #5fb3b3);
}

.kind-badge.kind-goal {
  border-color: rgba(91, 154, 111, 0.4);
  color: var(--p-status-success, #5b9a6f);
}

.kind-badge.kind-team {
  border-color: rgba(193, 88, 90, 0.4);
  color: var(--p-surface-200, #d0d5d0);
}

.status-pill {
  font-size: var(--p-text-xs, 12px);
  padding: 2px 8px;
  border-radius: 9999px;
  background: var(--p-surface-900);
  border: 1px solid currentColor;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.status-glyph {
  font-weight: bold;
}

.drawer-title {
  font-size: var(--p-text-md, 16px);
  font-weight: 600;
  color: var(--p-surface-0);
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drawer-subtitle {
  font-size: var(--p-text-xs, 12px);
  color: var(--p-surface-400);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drawer-body {
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
  flex: 1;
}

.drawer-error {
  font-size: var(--p-text-xs, 12px);
  margin-bottom: 8px;
}

.error-sigil {
  color: var(--p-status-danger, #c1585a);
}

.drawer-loading {
  padding: 32px 0;
  text-align: center;
  color: var(--p-surface-400);
  font-size: var(--p-text-xs, 12px);
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

.drawer-content {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.drawer-footer {
  padding: 16px 20px;
  border-top: 1px solid var(--p-surface-800);
  background: var(--p-surface-950);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}
</style>
