<script setup lang="ts">
// 瀏覽器的一列：中英文名、來源徽章、版本標記；點一下展開完整內文。
// 額外內容（例如職業的子職清單）由父元件透過 <slot> 塞進展開區。
import { computed, ref } from 'vue'
import { metaLine } from '@/data/display'
import type { Entry } from '@/data/types'
import LegacyBadge from '../LegacyBadge.vue'
import SourceBadge from '../SourceBadge.vue'
import EntryBlock from '../entries/EntryBlock.vue'

const props = defineProps<{ entry: Entry }>()
const emit = defineEmits<{ jump: [newer: Entry] }>()
const open = ref(false)
const meta = computed(() => metaLine(props.entry))
</script>

<template>
  <li class="row" :class="{ open }" data-testid="entry-row">
    <button type="button" class="head" :aria-expanded="open" @click="open = !open">
      <span class="name">{{ entry.name }}</span>
      <span v-if="entry.engName" class="eng">{{ entry.engName }}</span>
      <span v-if="meta" class="meta">{{ meta }}</span>
      <span class="tags">
        <span v-if="entry.tceOptional" class="chip tce">TCE 可選規則</span>
        <LegacyBadge :entry="entry" @jump="(n) => emit('jump', n)" />
        <span class="chip" :class="entry.edition === '2024' ? 'e2024' : 'e2014'">{{ entry.edition }}</span>
        <SourceBadge :source="entry.source" :page="entry.page" />
      </span>
    </button>
    <div v-if="open" class="detail">
      <slot name="before" />
      <EntryBlock v-if="entry.entries" :entry="entry.entries" />
      <EntryBlock v-if="entry.entriesHigherLevel" :entry="entry.entriesHigherLevel" />
      <slot />
    </div>
  </li>
</template>

<style scoped>
.row {
  list-style: none;
  border-bottom: 1px solid var(--color-border);
}
.head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-2);
  width: 100%;
  padding: var(--space-2) var(--space-2);
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.head:hover,
.open .head {
  background: var(--color-surface);
}
.name {
  font-weight: 600;
}
.eng,
.meta {
  color: var(--color-text-muted);
  font-size: 0.85rem;
}
.tags {
  display: inline-flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  margin-left: auto;
}
.chip {
  padding: 0 var(--space-2);
  border-radius: var(--radius);
  font-size: 0.75rem;
  line-height: 1.6;
  border: 1px solid var(--color-border);
  white-space: nowrap;
}
.e2024 {
  color: var(--color-accent);
}
.e2014 {
  color: var(--color-legacy);
}
.tce {
  color: var(--color-tce);
  border-color: var(--color-tce);
}
.detail {
  padding: var(--space-2) var(--space-3) var(--space-3);
  background: var(--color-surface);
}
</style>
