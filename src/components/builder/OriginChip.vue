<script setup lang="ts">
// 「來自哪裡」的小標籤：例如「背景：侍僧 XPHB p.178」。2014 條目依 2024 規則處理時加註。
import { computed } from 'vue'
import type { Origin } from '@/rules/build'
import SourceBadge from '../SourceBadge.vue'

const props = defineProps<{ origin: Origin }>()
const TYPE: Record<Origin['type'], string> = {
  race: '種族',
  background: '背景',
  class: '職業',
  subclass: '子職',
  feat: '專長',
  optionalfeature: '可選特性',
  rule: '規則',
}
const typeLabel = computed(() => TYPE[props.origin.type])
</script>

<template>
  <span class="origin">
    <span class="type">{{ typeLabel }}</span>{{ origin.name }}
    <span v-if="origin.compat" class="compat" title="2014 版條目，依 2024 PHB 的相容規則處理">2024 相容</span>
    <SourceBadge v-if="origin.entry" :source="origin.entry.source" :page="origin.entry.page" />
  </span>
</template>

<style scoped>
.origin {
  display: inline-flex;
  align-items: baseline;
  gap: var(--space-1);
  font-size: 0.85rem;
  color: var(--color-text-muted);
}
.type {
  color: var(--color-accent);
  margin-right: 2px;
}
.compat {
  padding: 0 var(--space-1);
  border: 1px dashed var(--color-legacy);
  border-radius: var(--radius);
  color: var(--color-legacy);
  font-size: 0.75rem;
}
</style>
