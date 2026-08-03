<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();

const tabs = [
  { name: 'Tasks', path: '/tasks', shortcut: '1', glyph: '📋' },
  { name: 'Agents', path: '/agents', shortcut: '2', glyph: '🤖' },
  { name: 'Goals', path: '/goals', shortcut: '3', glyph: '🎯' },
  { name: 'Teams', path: '/teams', shortcut: '4', glyph: '👥' },
  { name: 'Activity', path: '/activity', shortcut: '5', glyph: '⚡' },
];

function handleKeyDown(event: KeyboardEvent) {
  // Ignore keyboard shortcuts if user is typing in an input/textarea
  const activeEl = document.activeElement;
  if (
    activeEl &&
    (activeEl.tagName === 'INPUT' ||
      activeEl.tagName === 'TEXTAREA' ||
      (activeEl as HTMLElement).isContentEditable)
  ) {
    return;
  }

  // Handle Alt+1 to Alt+5 or 1 to 5
  const key = event.key;
  if (['1', '2', '3', '4', '5'].includes(key)) {
    const targetTab = tabs.find((t) => t.shortcut === key);
    if (targetTab) {
      if (event.altKey || !event.ctrlKey) {
        router.push(targetTab.path);
      }
    }
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown);
});
</script>

<template>
  <nav class="tab-bar">
    <div class="tab-list">
      <router-link
        v-for="tab in tabs"
        :key="tab.path"
        :to="tab.path"
        class="tab-item"
        :class="{ active: route.path.startsWith(tab.path) || (route.path === '/' && tab.path === '/tasks') }"
      >
        <span class="tab-glyph">{{ tab.glyph }}</span>
        <span class="tab-name">{{ tab.name }}</span>
        <span class="tab-shortcut mono">[{{ tab.shortcut }}]</span>
      </router-link>
    </div>
  </nav>
</template>

<style scoped>
.tab-bar {
  display: flex;
  align-items: center;
  height: 40px;
  background: var(--p-surface-950);
  border-bottom: 1px solid var(--p-surface-800);
  padding: 0 16px;
}

.tab-list {
  display: flex;
  align-items: stretch;
  height: 100%;
  gap: 2px;
}

.tab-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  height: 100%;
  color: var(--p-surface-400);
  font-size: var(--p-text-sm, 13px);
  font-weight: 500;
  text-decoration: none;
  border-bottom: 2px solid transparent;
  transition: all var(--p-motion-duration-fast, 100ms) ease-out;
  position: relative;
}

.tab-item:hover {
  color: var(--p-surface-200);
  background: rgba(255, 255, 255, 0.02);
}

.tab-item.active {
  color: var(--p-primary-400);
  border-bottom-color: var(--p-primary-400);
  background: var(--p-surface-900);
}

.tab-glyph {
  font-size: 13px;
}

.tab-name {
  font-weight: 500;
}

.tab-shortcut {
  font-size: 10px;
  color: var(--p-surface-500);
  margin-left: 2px;
}

.tab-item.active .tab-shortcut {
  color: rgba(232, 163, 61, 0.6);
}
</style>
