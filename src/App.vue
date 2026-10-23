<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { loadData } from '@/data/loader'

interface DemoData {
  message: string
}

// ref() 建立「會觸發畫面更新」的變數；在 <template> 裡直接用名字讀取。
const demoMessage = ref<string | null>(null)
const loadError = ref<string | null>(null)

onMounted(async () => {
  try {
    const demo = await loadData<DemoData>('demo')
    demoMessage.value = demo.message
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : String(err)
  }
})
</script>

<template>
  <main class="page">
    <h1>Hello DND</h1>
    <p v-if="loadError" class="error" data-testid="demo-error">{{ loadError }}</p>
    <p v-else-if="demoMessage" data-testid="demo-line">{{ demoMessage }}</p>
    <p v-else class="muted">資料載入中…</p>
  </main>
</template>

<style scoped>
.page {
  max-width: 960px;
  margin: 0 auto;
  padding: var(--space-4);
}

h1 {
  color: var(--color-accent);
}

.muted {
  color: var(--color-text-muted);
}

.error {
  color: var(--color-danger);
}
</style>
