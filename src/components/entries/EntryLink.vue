<script setup lang="ts">
// 可連結的標籤（法術、物品、狀態…）。滑鼠移上去時才載入對應資料檔，並顯示摘要 tooltip。
// tooltip 用 <Teleport to="body"> 搬到 <body> 底下，避免被外層 overflow: hidden 裁掉。
import { computed, ref } from 'vue'
import { summarize } from '@/data/summary'
import type { TagView } from '@/data/tags'
import { fileOfKind, indexKey, useCatalogStore } from '@/stores/catalog'
import SourceBadge from '../SourceBadge.vue'
import RichText from './RichText.vue'

const props = defineProps<{ view: Extract<TagView, { type: 'link' }> }>()
const catalog = useCatalogStore()

const el = ref<HTMLElement | null>(null)
const open = ref(false)
const pos = ref({ left: 0, top: 0 })
let timer: ReturnType<typeof setTimeout> | undefined

const file = computed(() => fileOfKind(props.view.kind))
const entry = computed(() => {
  const v = props.view
  return catalog.get(indexKey(v.kind, v.name, v.source, ...(v.extra ?? [])))
})

function show() {
  clearTimeout(timer)
  timer = setTimeout(() => {
    void catalog.ensure(file.value)
    const r = el.value?.getBoundingClientRect()
    if (r) pos.value = { left: Math.min(r.left, window.innerWidth - 360), top: r.bottom + 4 }
    open.value = true
  }, 150)
}
function hide() {
  clearTimeout(timer)
  open.value = false
}
</script>

<template>
  <span ref="el" class="link" :class="{ missing: catalog.isLoaded(file) && !entry }" @mouseenter="show" @mouseleave="hide"
    ><RichText :text="view.text"
  /></span>
  <Teleport to="body">
    <div v-if="open" class="tooltip" role="tooltip" :style="{ left: pos.left + 'px', top: pos.top + 'px' }">
      <template v-if="entry">
        <div class="head">
          <strong>{{ entry.name }}</strong>
          <span v-if="entry.engName" class="eng">{{ entry.engName }}</span>
          <SourceBadge :source="entry.source" :page="entry.page" />
        </div>
        <p class="body">{{ summarize(entry) }}</p>
      </template>
      <p v-else-if="!catalog.isLoaded(file)" class="muted">載入中…</p>
      <p v-else class="muted">找不到「{{ view.name }}｜{{ view.source }}」（該書可能不在白名單內）</p>
    </div>
  </Teleport>
</template>

<style scoped>
.link {
  color: var(--color-accent);
  border-bottom: 1px dotted currentColor;
  cursor: help;
}
.link.missing {
  color: var(--color-text-muted);
}
.tooltip {
  position: fixed;
  z-index: 100;
  width: 340px;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface-raised);
  box-shadow: 0 6px 20px rgb(0 0 0 / 0.5);
  pointer-events: none;
}
.head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-2);
}
.eng {
  color: var(--color-text-muted);
  font-size: 0.85rem;
}
.body {
  margin: var(--space-1) 0 0;
  font-size: 0.9rem;
}
.muted {
  margin: 0;
  color: var(--color-text-muted);
}
</style>
