<script setup lang="ts">
// 依等級列出職業或子職特性的完整內文。TCE 可選特性、未啟用書目的特性依篩選隱藏。
import { computed } from 'vue'
import type { FeatureRef } from '@/data/classRefs'
import { useCatalogStore } from '@/stores/catalog'
import { useSourceFilterStore } from '@/stores/sourceFilter'
import SourceBadge from '../SourceBadge.vue'
import EntryBlock from '../entries/EntryBlock.vue'

const props = defineProps<{ refs: FeatureRef[] }>()
const catalog = useCatalogStore()
const filter = useSourceFilterStore()

const features = computed(() =>
  props.refs
    .map((r) => ({ ref: r, entry: catalog.get(r.id) }))
    .filter(({ entry }) => !entry || (filter.enabledSet.has(entry.source) && (!entry.tceOptional || filter.tceOptional))),
)
</script>

<template>
  <ol class="features">
    <li v-for="{ ref, entry } in features" :key="ref.id">
      <div class="head">
        <span class="lv">{{ ref.level }} 级</span>
        <template v-if="entry">
          <strong>{{ entry.name }}</strong>
          <span v-if="entry.engName" class="eng">{{ entry.engName }}</span>
          <span v-if="entry.tceOptional" class="tce">TCE 可選規則</span>
          <SourceBadge :source="entry.source" :page="entry.page" />
        </template>
        <span v-else class="muted">{{ ref.id.split('|')[1] }}（找不到資料）</span>
      </div>
      <EntryBlock v-if="entry?.entries" :entry="entry.entries" :depth="1" />
    </li>
  </ol>
</template>

<style scoped>
.features {
  margin: 0;
  padding: 0;
  list-style: none;
}
.features > li {
  padding: var(--space-2) 0;
  border-top: 1px dashed var(--color-border);
}
.head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-2);
  margin-bottom: var(--space-1);
}
.lv {
  min-width: 3em;
  color: var(--color-accent);
  font-size: 0.85rem;
}
.eng,
.muted {
  color: var(--color-text-muted);
  font-size: 0.85rem;
}
.tce {
  color: var(--color-tce);
  font-size: 0.75rem;
}
</style>
