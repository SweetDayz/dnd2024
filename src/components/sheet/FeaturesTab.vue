<script setup lang="ts">
// 特性與特質：職業／子職特性、種族特質、專長、背景，可篩選。每個特性底下列出它的選擇
// （選了什麼，或紅字「未選擇 (No Choice Made)」），點標題收合原文。
import { computed, ref } from 'vue'
import SourceBadge from '@/components/SourceBadge.vue'
import EntryBlock from '@/components/entries/EntryBlock.vue'
import { useCharacterBuild } from '@/composables/useCharacterBuild'
import type { Feature } from '@/rules/build'

const { build } = useCharacterBuild()
const FILTERS = [
  { id: 'all', label: '全部' },
  { id: 'class', label: '職業特性' },
  { id: 'race', label: '種族特質' },
  { id: 'feat', label: '專長' },
  { id: 'background', label: '背景' },
] as const
type FilterId = (typeof FILTERS)[number]['id']
const filter = ref<FilterId>('all')
const collapsed = ref(new Set<string>())

const matchCat = (f: Feature) =>
  filter.value === 'all' ||
  (filter.value === 'class' ? ['class', 'subclass', 'optionalfeature'].includes(f.category) : f.category === filter.value)
const features = computed(() => (build.value?.features ?? []).filter(matchCat))
const slotOf = (key: string) => build.value?.slots.find((s) => s.key === key)
const picked = (key: string) => {
  const s = slotOf(key)
  return s ? s.selected.filter(Boolean).map((v) => s.options.find((o) => o.value === v)?.label ?? v) : []
}
const CAT: Record<Feature['category'], string> = {
  class: '職業',
  subclass: '子職',
  race: '種族',
  background: '背景',
  feat: '專長',
  optionalfeature: '可選特性',
}
function toggle(k: string) {
  const s = new Set(collapsed.value)
  if (s.has(k)) s.delete(k)
  else s.add(k)
  collapsed.value = s
}
</script>

<template>
  <div class="features">
    <div class="filters">
      <button
        v-for="f in FILTERS"
        :key="f.id"
        type="button"
        :class="{ sel: filter === f.id }"
        :data-filter="f.id"
        @click="filter = f.id"
      >
        {{ f.label }}
      </button>
    </div>
    <article v-for="f in features" :key="f.key" class="feature" data-testid="feature">
      <header @click="toggle(f.key)">
        <strong>{{ f.entry.name }}</strong>
        <small class="muted">{{ f.entry.engName }}</small>
        <span class="cat">{{ CAT[f.category] }}｜{{ f.origin.name }}</span>
        <span v-if="f.entry.tceOptional" class="tce">TCE 可選規則</span>
        <span v-if="f.origin.compat" class="compat">2024 相容</span>
        <SourceBadge :source="f.entry.source" :page="f.entry.page" />
      </header>
      <ul v-if="f.slotKeys.length" class="choices">
        <li v-for="k in f.slotKeys" :key="k">
          <span class="muted">{{ slotOf(k)?.label }}：</span>
          <template v-if="picked(k).length">{{ picked(k).join('、') }}</template>
          <span v-else class="none">未選擇 (No Choice Made)</span>
        </li>
      </ul>
      <div v-if="!collapsed.has(f.key)" class="body">
        <EntryBlock v-if="f.entry.entries" :entry="f.entry.entries" />
      </div>
    </article>
    <p v-if="!features.length" class="muted">沒有符合的特性。</p>
  </div>
</template>

<style scoped>
.filters {
  display: flex;
  gap: var(--space-1);
  margin-bottom: var(--space-2);
}
.filters button {
  padding: 2px var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-bg);
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.filters .sel {
  border-color: var(--color-accent);
  color: var(--color-accent);
}
.feature {
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--color-border);
}
header {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-2);
  cursor: pointer;
}
.cat {
  font-size: 0.8rem;
  color: var(--color-text-muted);
}
.choices {
  margin: var(--space-1) 0;
  padding-left: var(--space-3);
  font-size: 0.9rem;
}
.none {
  color: var(--color-danger);
}
.body {
  font-size: 0.92rem;
}
.tce {
  color: var(--color-tce);
  font-size: 0.75rem;
}
.compat {
  color: var(--color-legacy);
  font-size: 0.75rem;
}
.muted {
  color: var(--color-text-muted);
}
</style>
