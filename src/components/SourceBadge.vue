<script setup lang="ts">
// 來源書徽章，例如「XPHB p.165」。滑鼠停留會顯示完整書名。
import { computed } from 'vue'
import { useCatalogStore } from '@/stores/catalog'

const props = defineProps<{ source: string; page?: number | string }>()
const catalog = useCatalogStore()

const title = computed(() => {
  const s = catalog.sourceMap.get(props.source)
  return s ? `${s.name}（${s.engName}，${s.published}）` : props.source
})
</script>

<template>
  <span class="badge" :title="title" data-testid="source-badge">
    {{ source }}<template v-if="page !== undefined"> p.{{ page }}</template>
  </span>
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
