<script setup lang="ts" generic="T, K extends string">
// 通用可排序表格（M7-6 從 M5 的法術表格抽出；法術、語言、物品共用）。
// - 點欄位標題 emit('sort', key)，由父元件決定新的排序（通常用 facetFilter.nextSort）並存進偏好 store。
// - 每格預設顯示 column.text(row)；要自訂就用具名 slot `#cell-<key>="{ row }"`（例如來源徽章）。
// - select='checkbox'／'radio' 時第一欄是勾選框：selected(row) 決定勾選、disabled(row) 回傳停用原因（也當 tooltip）。
//   select='custom' 時第一欄由 `#select="{ row }"` slot 自訂（例如法師法術書的兩階段控制項）。
// - memo(row)：列的 v-memo 依據（M9-0 量測 600 列約 200ms）；只有回傳的值改變時才重繪那一列。
// - 表頭 sticky，位置由 CSS 變數 --sticky-top 決定（預設 0：整頁捲動時貼齊視窗頂端）。
// - 點列的其他地方 emit('open', row)（顯示詳情）。
// `generic="T, K extends string"`：T 是列的型別、K 是欄位 key 的型別，都由使用的地方推斷。
import type { SortState } from '@/data/facetFilter'
import type { Column } from './types'

const props = defineProps<{
  columns: readonly Column<T, K>[]
  rows: readonly T[]
  rowKey: (row: T) => string
  sort?: SortState<K>
  select?: 'checkbox' | 'radio' | 'custom'
  /** radio 的 name（同一組只能選一個） */
  name?: string
  selected?: (row: T) => boolean
  disabled?: (row: T) => string | undefined
  rowClass?: (row: T) => Record<string, boolean>
  rowTitle?: (row: T) => string | undefined
  /** 把列的 key 放到這個 attribute 上（例如 data-spell-row），方便測試與樣式 */
  rowAttr?: string
  memo?: (row: T) => unknown[]
}>()
const emit = defineEmits<{ sort: [key: K]; toggle: [row: T]; open: [row: T] }>()

const attrs = (r: T) => (props.rowAttr ? { [props.rowAttr]: props.rowKey(r) } : {})
function clickHead(c: Column<T, K>) {
  if (props.sort && c.sortable !== false) emit('sort', c.key)
}
</script>

<template>
  <table class="stable" data-testid="sortable-table">
    <thead>
      <tr>
        <th v-if="select" class="chk" />
        <th
          v-for="c in columns"
          :key="c.key"
          :class="[c.cls, { sorted: sort?.key === c.key, nosort: !sort || c.sortable === false }]"
          :data-sort="c.key"
          :title="c.title"
          @click="clickHead(c)"
        >
          {{ c.label }}<span v-if="sort?.key === c.key" class="arrow">{{ sort.dir === 1 ? '▲' : '▼' }}</span>
        </th>
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="r in rows"
        :key="rowKey(r)"
        v-memo="memo ? memo(r) : [r]"
        :class="rowClass?.(r)"
        :title="rowTitle?.(r)"
        v-bind="attrs(r)"
        @click="emit('open', r)"
      >
        <td v-if="select === 'custom'" class="chk" @click.stop>
          <slot name="select" :row="r" />
        </td>
        <td v-else-if="select" class="chk" @click.stop>
          <input
            :type="select"
            :name="name"
            :checked="selected?.(r)"
            :disabled="!!disabled?.(r)"
            :title="disabled?.(r)"
            :data-value="rowKey(r)"
            @change="emit('toggle', r)"
          />
        </td>
        <td v-for="c in columns" :key="c.key" :class="c.cls" :data-col="c.key">
          <slot :name="`cell-${c.key}`" :row="r">{{ c.text?.(r) ?? '' }}</slot>
        </td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.stable {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}
th {
  position: sticky;
  top: var(--sticky-top, 0);
  z-index: 1;
  padding: var(--space-1) var(--space-2);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface-raised);
  color: var(--color-text-muted);
  font-weight: 500;
  font-size: 0.8rem;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
}
th.nosort,
th.chk {
  cursor: default;
}
th.sorted {
  color: var(--color-accent);
}
.arrow {
  margin-left: 2px;
  font-size: 0.7rem;
}
td {
  padding: var(--space-1) var(--space-2);
  border-bottom: 1px solid var(--color-border);
  vertical-align: top;
}
tbody tr {
  cursor: pointer;
}
tbody tr:hover {
  background: var(--color-surface);
}
tr.sel {
  background: color-mix(in srgb, var(--color-accent) 12%, transparent);
}
tr.open {
  outline: 1px solid var(--color-accent);
  outline-offset: -1px;
}
tr.blocked {
  opacity: 0.45;
}
.chk {
  width: 28px;
}
.nowrap {
  white-space: nowrap;
}
.center {
  text-align: center;
}
th.num,
td.num {
  text-align: right;
  white-space: nowrap;
}
</style>
