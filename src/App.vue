<script setup lang="ts">
import { onMounted } from 'vue'
import SourceFilterPanel from '@/components/SourceFilterPanel.vue'
import { useCatalogStore } from '@/stores/catalog'

const catalog = useCatalogStore()

onMounted(async () => {
  try {
    await catalog.loadSources()
  } catch (err) {
    catalog.errors.push(err instanceof Error ? err.message : String(err))
  }
})
</script>

<template>
  <div class="layout">
    <header class="top">
      <h1>D&amp;D 2024 角色建立器</h1>
      <span class="muted">M1：資料瀏覽</span>
    </header>
    <aside class="side">
      <SourceFilterPanel />
    </aside>
    <main class="main">
      <p v-for="e in catalog.errors" :key="e" class="error" data-testid="load-error">{{ e }}</p>
      <p class="muted">選項瀏覽器（M1-6）</p>
    </main>
  </div>
</template>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: 300px 1fr;
  grid-template-rows: auto 1fr;
  grid-template-areas:
    'top top'
    'side main';
  min-height: 100vh;
}
.top {
  grid-area: top;
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-4);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
}
h1 {
  margin: 0;
  font-size: 1.25rem;
  color: var(--color-accent);
}
.side {
  grid-area: side;
  padding: var(--space-3);
  border-right: 1px solid var(--color-border);
  background: var(--color-surface);
}
.main {
  grid-area: main;
  padding: var(--space-3) var(--space-4);
  min-width: 0;
}
.muted {
  color: var(--color-text-muted);
}
.error {
  color: var(--color-danger);
}
</style>
