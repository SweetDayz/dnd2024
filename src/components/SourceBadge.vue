<script setup lang="ts">
// 來源書徽章，例如「XPHB p.165」。滑鼠停留會顯示完整書名。
import { computed } from 'vue'
import { useCatalogStore } from '@/stores/catalog'

// 條目本身缺頁碼時顯示 p.?（目前只有上游 AU 的部分資料如此），讓使用者知道不是漏顯示。
const props = defineProps<{ source: string; page?: number | string }>()
const catalog = useCatalogStore()

const title = computed(() => {
  const s = catalog.sourceMap.get(props.source)
  const book = s ? `${s.name}（${s.engName}，${s.published}）` : props.source
  return props.page === undefined ? `${book}\n上游資料沒有頁碼` : book
})
</script>

<template>
  <span class="badge" :title="title" data-testid="source-badge">
    {{ source }}<template v-if="page !== undefined"> p.{{ page }}</template><template v-else> p.?</template>
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
