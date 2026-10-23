<script setup lang="ts">
// 從一串條目中選一個（職業、背景、種族）。左邊可搜尋的清單，右邊顯示選中條目的完整說明。
// 每個選項都有來源徽章；2014 條目標示「2014」，被 2024 版取代的舊版標示「已有 2024 版」。
import { computed, ref } from 'vue'
import { metaLine } from '@/data/display'
import { entryMatches } from '@/data/sourceDisplay'
import type { Entry } from '@/data/types'
import { useSourceFilterStore } from '@/stores/sourceFilter'
import SourceBadge from '../SourceBadge.vue'
import EntryBlock from '../entries/EntryBlock.vue'

const props = defineProps<{ entries: Entry[]; modelValue: string | null; compatNote?: string }>()
const emit = defineEmits<{ 'update:modelValue': [id: string | null] }>()
const filter = useSourceFilterStore()

const query = ref('')
const previewId = ref<string | null>(props.modelValue)

const shown = computed(() => {
  const q = query.value.trim().toLowerCase()
  const list = q ? props.entries.filter((e) => entryMatches(e, q)) : props.entries
  // 2024 版排前面，再依英文名排序
  return [...list].sort(
    (a, b) => (a.edition === b.edition ? 0 : a.edition === '2024' ? -1 : 1) || (a.engName ?? a.name).localeCompare(b.engName ?? b.name),
  )
})
const preview = computed(() => props.entries.find((e) => e.id === (previewId.value ?? props.modelValue)))

function pick(e: Entry) {
  previewId.value = e.id
  emit('update:modelValue', e.id)
}
</script>

<template>
  <div class="picker">
    <div class="list-col">
      <input v-model="query" class="search" type="search" placeholder="搜尋（中文或英文）" data-testid="picker-search" />
      <ul class="list" data-testid="picker-list">
        <li v-for="e in shown" :key="e.id">
          <button
            type="button"
            class="item"
            :class="{ sel: e.id === modelValue, preview: e.id === previewId }"
            :data-id="e.id"
            @click="pick(e)"
          >
            <span class="name">{{ e.name }}</span>
            <span v-if="e.engName" class="eng">{{ e.engName }}</span>
            <span class="tags">
              <span v-if="e.edition === '2014'" class="chip e2014" :title="compatNote">2014</span>
              <span v-if="filter.superseded(e)" class="chip legacy">已有 2024 版</span>
              <SourceBadge :source="e.source" :page="e.page" />
            </span>
          </button>
        </li>
      </ul>
      <p class="muted count">共 {{ shown.length }} 項</p>
    </div>
    <div class="detail-col">
      <template v-if="preview">
        <h3>
          {{ preview.name }} <small class="eng">{{ preview.engName }}</small>
          <SourceBadge :source="preview.source" :page="preview.page" />
        </h3>
        <p v-if="metaLine(preview)" class="muted">{{ metaLine(preview) }}</p>
        <p v-if="preview.edition === '2014' && compatNote" class="compat">{{ compatNote }}</p>
        <slot name="detail" :entry="preview" />
        <EntryBlock v-if="preview.entries" :entry="preview.entries" />
      </template>
      <p v-else class="muted">從左側選一項，這裡會顯示完整說明。</p>
    </div>
  </div>
</template>

<style scoped>
.picker {
  display: grid;
  grid-template-columns: minmax(260px, 340px) 1fr;
  gap: var(--space-3);
  min-height: 0;
}
.search {
  width: 100%;
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-bg);
  color: inherit;
  font: inherit;
}
.list {
  max-height: 60vh;
  overflow: auto;
  margin: var(--space-2) 0 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
}
.item {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-1) var(--space-2);
  width: 100%;
  padding: var(--space-1) var(--space-2);
  border: 0;
  border-bottom: 1px solid var(--color-border);
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.item:hover,
.item.preview {
  background: var(--color-surface);
}
.item.sel {
  background: var(--color-surface-raised);
  box-shadow: inset 3px 0 0 var(--color-accent);
}
.name {
  font-weight: 600;
}
.eng {
  color: var(--color-text-muted);
  font-size: 0.85rem;
  font-weight: normal;
}
.tags {
  display: inline-flex;
  gap: var(--space-1);
  margin-left: auto;
}
.chip {
  padding: 0 var(--space-1);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  font-size: 0.7rem;
}
.e2014,
.legacy {
  color: var(--color-legacy);
}
.legacy {
  border-style: dashed;
}
.detail-col {
  max-height: 70vh;
  overflow: auto;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
}
h3 {
  margin-top: 0;
}
.compat {
  padding: var(--space-1) var(--space-2);
  border: 1px dashed var(--color-legacy);
  border-radius: var(--radius);
  color: var(--color-legacy);
  font-size: 0.85rem;
}
.muted {
  color: var(--color-text-muted);
}
.count {
  font-size: 0.8rem;
}
</style>
