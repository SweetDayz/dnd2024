<script setup lang="ts">
// 「已有新版：PHB24 p.xx」徽章：條目在目前書目下已被重印取代時才出現。
// 點擊發出 jump 事件（帶新版條目），由父元件決定怎麼「跳過去」（瀏覽器改搜尋、精靈改預覽…）。
// 用 <span role="button"> 而不是 <button>：它常被放在整列可點的 <button> 裡，HTML 不允許按鈕巢狀。
import { computed, watchEffect } from 'vue'
import { kindOfId } from '@/data/ids'
import { formatSource } from '@/data/sourceDisplay'
import type { Entry } from '@/data/types'
import { supersededBy } from '@/data/visibility'
import { fileOfKind, useCatalogStore } from '@/stores/catalog'
import { useSourceFilterStore } from '@/stores/sourceFilter'

const props = defineProps<{ entry: Entry }>()
const emit = defineEmits<{ jump: [newer: Entry] }>()
const filter = useSourceFilterStore()
const catalog = useCatalogStore()
const newerId = computed(() => supersededBy(props.entry, filter.enabledSet))
// 跨類別的重印（例如可選特性 → 專長）：新版所在的資料檔可能還沒載入，先載入才拿得到頁碼
watchEffect(() => {
  if (newerId.value) void catalog.ensure(fileOfKind(kindOfId(newerId.value)))
})
const newer = computed(() => (newerId.value ? catalog.get(newerId.value) : undefined))
</script>

<template>
  <span
    v-if="newer"
    role="button"
    tabindex="0"
    class="legacy"
    data-testid="superseded"
    :title="`已被重印取代：${newer.name}${newer.engName ? ` ${newer.engName}` : ''}（點擊查看新版）`"
    @click.stop="emit('jump', newer)"
    @keydown.enter.stop.prevent="emit('jump', newer)"
  >
    已有新版：{{ formatSource(newer.source, newer.page) }}
  </span>
</template>

<style scoped>
.legacy {
  display: inline-block;
  padding: 0 var(--space-2);
  border: 1px solid var(--color-legacy);
  border-radius: var(--radius);
  background: transparent;
  color: var(--color-legacy);
  font: inherit;
  font-size: 0.75rem;
  line-height: 1.6;
  white-space: nowrap;
  cursor: pointer;
}
.legacy:hover {
  color: var(--color-text);
}
</style>
