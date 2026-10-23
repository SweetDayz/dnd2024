<script setup lang="ts">
// 來源書徽章，例如「PHB24 p.165」（內部代碼 XPHB 只在 tooltip 顯示，見 src/data/sourceDisplay.ts）。
// 滑鼠停留會顯示中英文書名、原始代碼、出版日期。
import { computed } from 'vue'
import { formatSource, sourceTooltip } from '@/data/sourceDisplay'
import { useCatalogStore } from '@/stores/catalog'

// 條目本身缺頁碼時顯示 p.?（目前只有上游 AU 的部分資料如此），讓使用者知道不是漏顯示。
const props = defineProps<{ source: string; page?: number | string }>()
const catalog = useCatalogStore()

const title = computed(() => sourceTooltip(props.source, catalog.sourceMap.get(props.source), props.page))
</script>

<template>
  <span class="badge" :title="title" :data-source="source" data-testid="source-badge">{{ formatSource(source, page) }}</span>
</template>

<style scoped>
.badge {
  display: inline-block;
  padding: 0 var(--space-2);
  border-radius: var(--radius);
  background: var(--color-badge-bg);
  color: var(--color-badge-text);
  font-size: 0.75rem;
  line-height: 1.6;
  white-space: nowrap;
  vertical-align: middle;
}
</style>
