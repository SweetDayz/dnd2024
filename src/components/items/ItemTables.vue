<script setup lang="ts">
// 物品表格（M7-7）：資料瀏覽器的「物品」分頁與物品欄的「新增物品」共用。
// 一般物品、魔法物品分成兩個表（判斷用 isMundaneItem），共用一個搜尋與三態篩選面板（含價值、重量範圍）。
// 篩選、排序、面板展開存在 tablePrefs（localStorage）；兩個表各自記排序（`<id>`、`<id>:magic`）。
// pick 模式（物品欄）每列多一顆「加入」按鈕，emit pick。
import { computed, ref, watch } from 'vue'
import { nextSort } from '@/data/facetFilter'
import {
  ATTUNE_LABEL,
  ITEM_DEFAULT_SORT,
  ITEM_GROUPS,
  RARITY_LABEL,
  filterItems,
  itemLabels,
  itemRow,
  itemTagLabel,
  itemTags,
  sortItems,
  type ItemFilterState,
  type ItemGroupId,
  type ItemRanges,
  type ItemRow,
  type ItemSortKey,
} from '@/data/itemTable'
import type { Entry } from '@/data/types'
import type { RulesData } from '@/rules/data'
import { cpToText } from '@/rules/equipment'
import { useTablePrefsStore } from '@/stores/tablePrefs'
import EntryBlock from '../entries/EntryBlock.vue'
import FacetFilterPanel from '../filter/FacetFilterPanel.vue'
import LegacyBadge from '../LegacyBadge.vue'
import SourceBadge from '../SourceBadge.vue'
import SortableTable from '../table/SortableTable.vue'
import type { Column } from '../table/types'

const props = defineProps<{
  items: readonly Entry[]
  data: Pick<RulesData, 'list'>
  tableId: string
  defaults: ItemFilterState
  pick?: boolean
}>()
const emit = defineEmits<{ pick: [item: Entry]; jump: [newer: Entry] }>()

const PAGE = 100
const prefs = useTablePrefsStore()
const p = computed(() => prefs.get(props.tableId))
const state = computed(() => (p.value.filter as ItemFilterState | undefined) ?? props.defaults)
const ranges = computed(() => (p.value.ranges ?? {}) as ItemRanges)
type S = { key: ItemSortKey; dir: 1 | -1 }
const sortOf = (id: string) => (prefs.get(id).sort as S | undefined) ?? ITEM_DEFAULT_SORT
const query = ref('')
const limit = ref({ mundane: PAGE, magic: PAGE })
watch([query, state, ranges], () => (limit.value = { mundane: PAGE, magic: PAGE }))

const labels = computed(() => itemLabels(props.data))
const rows = computed(() => props.items.map(itemRow))
const tags = computed(() => itemTags(rows.value, labels.value))
const filtered = computed(() => filterItems(rows.value, state.value, query.value, ranges.value))
const tables = computed(() => [
  { id: 'mundane' as const, label: '一般物品', prefsId: props.tableId, rows: sortItems(filtered.value.filter((r) => !r.magic), sortOf(props.tableId), labels.value) },
  { id: 'magic' as const, label: '魔法物品', prefsId: `${props.tableId}:magic`, rows: sortItems(filtered.value.filter((r) => r.magic), sortOf(`${props.tableId}:magic`), labels.value) },
])
const openId = ref<string>()
const openRow = computed(() => rows.value.find((r) => r.entry.id === openId.value))

function setRange(key: keyof ItemRanges, i: 0 | 1, raw: string) {
  const cur: [number | null, number | null] = [...(ranges.value[key] ?? [null, null])]
  cur[i] = raw.trim() === '' ? null : Number(raw)
  prefs.update(props.tableId, { ranges: { ...ranges.value, [key]: cur } })
}

const weightText = (r: ItemRow) => (r.weight === undefined ? '—' : `${r.weight} 磅`)
const name: Column<ItemRow, ItemSortKey> = { key: 'name', label: '名稱' }
const eng: Column<ItemRow, ItemSortKey> = { key: 'engName', label: '英文名', text: (r) => r.entry.engName }
const type: Column<ItemRow, ItemSortKey> = { key: 'type', label: '類型', text: (r) => labels.value.type(r.type) }
const source: Column<ItemRow, ItemSortKey> = { key: 'source', label: '來源' }
const COLS = computed(() => ({
  mundane: [
    name,
    eng,
    type,
    { key: 'value', label: '價值', cls: 'num', text: (r) => (r.value === undefined ? '—' : cpToText(r.value)) },
    { key: 'weight', label: '重量', cls: 'num', text: weightText },
    source,
  ] as Column<ItemRow, ItemSortKey>[],
  magic: [
    name,
    eng,
    type,
    { key: 'weight', label: '重量', cls: 'num', text: weightText },
    { key: 'attune', label: '同調', text: (r) => (r.attune === 'none' ? '—' : r.attune === 'required' ? '需要' : '需特定條件') },
    { key: 'rarity', label: '稀有度', cls: 'nowrap' },
    source,
  ] as Column<ItemRow, ItemSortKey>[],
}))
</script>

<template>
  <div class="item-tables" data-testid="item-tables">
    <div class="toolbar">
      <input v-model="query" type="search" placeholder="搜尋中文或英文名，或來源…" data-testid="item-table-search" />
      <button type="button" :class="{ on: p.panelOpen }" data-testid="item-filter-toggle" @click="prefs.update(tableId, { panelOpen: !p.panelOpen })">
        篩選{{ p.filter || p.ranges ? '（已調整）' : '' }}
      </button>
      <button v-if="p.filter || p.ranges" type="button" data-testid="item-filter-reset" @click="prefs.update(tableId, { filter: undefined, ranges: undefined })">重設篩選</button>
      <span class="muted" data-testid="item-count">共 {{ filtered.length }} 項</span>
    </div>
    <FacetFilterPanel
      v-if="p.panelOpen"
      :groups="ITEM_GROUPS"
      :state="state"
      :tags="tags"
      :label="(g: ItemGroupId, v: string) => itemTagLabel(labels, g, v)"
      :defaults="defaults"
      @update="(st) => prefs.update(tableId, { filter: st })"
    >
      <div class="ranges">
        <label v-for="[key, title, unit] in ([['value', '價值', 'GP'], ['weight', '重量', '磅']] as const)" :key="key" :data-range="key">
          <strong>{{ title }}</strong>
          <input type="number" min="0" :value="ranges[key]?.[0] ?? ''" placeholder="下限" @change="setRange(key, 0, ($event.target as HTMLInputElement).value)" />
          ～
          <input type="number" min="0" :value="ranges[key]?.[1] ?? ''" placeholder="上限" @change="setRange(key, 1, ($event.target as HTMLInputElement).value)" />
          {{ unit }}
        </label>
      </div>
    </FacetFilterPanel>

    <template v-for="t in tables" :key="t.id">
      <section v-if="t.rows.length" class="tbl" :data-table="t.id">
        <h4>{{ t.label }}（{{ t.rows.length }}）</h4>
        <div class="wrap">
          <SortableTable
            :columns="COLS[t.id]"
            :rows="t.rows.slice(0, limit[t.id])"
            :row-key="(r) => r.entry.id"
            :sort="sortOf(t.prefsId)"
            :row-class="(r) => ({ open: openId === r.entry.id })"
            row-attr="data-item"
            @sort="(k) => prefs.update(t.prefsId, { sort: nextSort(sortOf(t.prefsId), k) })"
            @open="(r) => (openId = openId === r.entry.id ? undefined : r.entry.id)"
          >
            <template #cell-name="{ row: r }">
              <button v-if="pick" type="button" class="add" :data-id="r.entry.id" title="加入物品欄" @click.stop="emit('pick', r.entry)">＋</button>
              <strong>{{ r.entry.name }}</strong>
              <LegacyBadge :entry="r.entry" @jump="(e: Entry) => emit('jump', e)" />
            </template>
            <template #cell-rarity="{ row: r }"><span :data-rarity="r.rarity">{{ RARITY_LABEL[r.rarity] ?? r.rarity }}</span></template>
            <template #cell-value="{ row: r }"><span :data-cp="r.value ?? ''">{{ r.value === undefined ? '—' : cpToText(r.value) }}</span></template>
            <template #cell-source="{ row: r }"><SourceBadge :source="r.entry.source" :page="r.entry.page" /></template>
          </SortableTable>
        </div>
        <button v-if="t.rows.length > limit[t.id]" type="button" class="more" @click="limit[t.id] += PAGE">
          再顯示 {{ Math.min(PAGE, t.rows.length - limit[t.id]) }} 項（還有 {{ t.rows.length - limit[t.id] }} 項）
        </button>
      </section>
    </template>
    <p v-if="!filtered.length" class="muted">沒有符合條件的物品。</p>

    <section v-if="openRow" class="detail" data-testid="item-detail">
      <h4>
        {{ openRow.entry.name }} <small class="muted">{{ openRow.entry.engName }}</small>
        <SourceBadge :source="openRow.entry.source" :page="openRow.entry.page" />
      </h4>
      <p class="muted">
        {{ labels.type(openRow.type) }}・{{ RARITY_LABEL[openRow.rarity] ?? openRow.rarity }}・{{ ATTUNE_LABEL[openRow.attune] }}
        <template v-if="openRow.attuneText">（{{ openRow.attuneText }}）</template>
        <template v-if="openRow.properties.length">・屬性：{{ openRow.properties.map(labels.property).join('、') }}</template>
        <template v-if="openRow.mastery.length">・精通：{{ openRow.mastery.join('、') }}</template>
      </p>
      <EntryBlock v-if="openRow.entry.entries" :entry="openRow.entry.entries" />
    </section>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
}
input,
button {
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
}
.toolbar input {
  flex: 1 1 220px;
}
button {
  cursor: pointer;
}
button.on {
  border-color: var(--color-accent);
  color: var(--color-accent);
}
.ranges {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  font-size: 0.85rem;
}
.ranges strong {
  margin-right: var(--space-1);
  color: var(--color-accent);
  font-weight: 500;
}
.ranges input {
  width: 6em;
}
.tbl h4 {
  margin: var(--space-3) 0 var(--space-1);
}
.wrap {
  max-height: 480px;
  overflow-y: auto;
}
.add {
  margin-right: var(--space-1);
  padding: 0 var(--space-1);
  color: var(--color-accent);
}
.more {
  margin: var(--space-2) auto;
  display: block;
}
.detail {
  margin-top: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
}
.muted {
  color: var(--color-text-muted);
}
</style>
