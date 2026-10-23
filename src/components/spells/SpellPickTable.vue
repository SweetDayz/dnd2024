<script setup lang="ts">
// 法術選擇表格：不用點開就看得到環階（儀式）、施法時間、學派、專注、射程、持續時間、成分（含耗材）與來源。
// 點欄位標題排序（再點一次反向）；點勾選框選取；點其他地方在下方顯示詳情。
// 不符合欄位條件的法術（開啟「顯示但反灰」時）與選滿後的其他列，勾選框停用並在 tooltip 說明原因。
// 表格本體是通用的 SortableTable（M7-6 抽出），這裡只定義欄位與各格的內容。
import type { Entry, SpellIndex } from '@/data/types'
import type { SpellSort, SpellSortKey } from '@/data/spellFilter'
import { schoolName } from '@/data/summary'
import { castingTime, durationText, materialText, rangeText } from '@/rules/spells'
import LegacyBadge from '../LegacyBadge.vue'
import SourceBadge from '../SourceBadge.vue'
import SortableTable from '../table/SortableTable.vue'
import type { Column } from '../table/types'

export interface PickRow {
  spell: Entry
  selected: boolean
  /** 不符合這個欄位條件的原因（反灰顯示） */
  blocked?: string
  /** 勾選框停用的原因（例如已選滿） */
  disabled?: string
  /** 已經從其他來源取得：「種族：侏儒」 */
  holders: string[]
}

defineProps<{ rows: PickRow[]; sort: SpellSort; multi: boolean; slotKey: string; openId?: string }>()
const emit = defineEmits<{ toggle: [spell: Entry]; open: [spell: Entry]; sort: [key: SpellSortKey]; jump: [newer: Entry] }>()

const idx = (sp: Entry) => (sp.idx as SpellIndex | undefined) ?? ({} as Partial<SpellIndex>)
/** 「V S M★†」：★ 材料有花費、† 會消耗（‡ 可能消耗） */
function comps(sp: Entry): string {
  const c = idx(sp).comp ?? []
  const parts = (['V', 'S', 'M', 'R'] as const).filter((x) => c.includes(x)).map((x) => x as string)
  const mi = parts.indexOf('M')
  if (mi >= 0) {
    if (c.includes('Mcost')) parts[mi] += '★'
    if (c.includes('Mconsume')) parts[mi] += '†'
    else if (c.includes('MconsumeOpt')) parts[mi] += '‡'
  }
  return parts.join(' ')
}
function compTitle(sp: Entry): string {
  const m = materialText(sp)
  const c = idx(sp).comp ?? []
  const notes = [c.includes('Mcost') && '★ 材料有標價', c.includes('Mconsume') && '† 施法會消耗材料', c.includes('MconsumeOpt') && '‡ 材料可能被消耗']
  return [m && `材料：${m}`, ...notes].filter(Boolean).join('\n')
}

const COLS: Column<PickRow, SpellSortKey>[] = [
  { key: 'name', label: '名稱' },
  { key: 'level', label: '環階', cls: 'nowrap' },
  { key: 'time', label: '施法時間', cls: 'nowrap', text: (r) => castingTime(r.spell) },
  { key: 'school', label: '學派', cls: 'nowrap', text: (r) => schoolName(r.spell.school) },
  { key: 'conc', label: '專注', cls: 'nowrap center' },
  { key: 'range', label: '射程', text: (r) => rangeText(r.spell) },
  { key: 'duration', label: '持續時間', text: (r) => durationText(r.spell).text },
  { key: 'components', label: '成分', cls: 'nowrap' },
  { key: 'source', label: '來源' },
]
</script>

<template>
  <SortableTable
    class="pick"
    :data-slot="slotKey"
    data-testid="spell-pick-table"
    :columns="COLS"
    :rows="rows"
    :row-key="(r) => r.spell.id"
    :sort="sort"
    :select="multi ? 'checkbox' : 'radio'"
    :name="slotKey"
    :selected="(r) => r.selected"
    :disabled="(r) => (r.blocked ? `不能選：${r.blocked}` : r.disabled)"
    :row-class="(r) => ({ sel: r.selected, blocked: !!r.blocked, open: openId === r.spell.id })"
    :row-title="(r) => (r.blocked ? `不能選：${r.blocked}` : '')"
    row-attr="data-spell-row"
    @sort="(k) => emit('sort', k)"
    @toggle="(r) => emit('toggle', r.spell)"
    @open="(r) => emit('open', r.spell)"
  >
    <template #cell-name="{ row: r }">
      <span class="zh">{{ r.spell.name }}</span> <small class="muted">{{ r.spell.engName }}</small>
      <LegacyBadge :entry="r.spell" @jump="(e: Entry) => emit('jump', e)" />
      <div v-if="r.holders.length" class="holders" data-testid="spell-holders">已由 {{ r.holders.join('、') }} 取得</div>
      <div v-if="r.blocked" class="reason">{{ r.blocked }}</div>
    </template>
    <template #cell-level="{ row: r }">
      {{ r.spell.level === 0 ? '戲法' : `${r.spell.level} 環` }}<small v-if="idx(r.spell).ritual" class="rit" title="可儀式施展">儀式</small>
    </template>
    <template #cell-conc="{ row: r }">
      <span class="conc" :title="idx(r.spell).conc ? '需要專注' : ''">{{ idx(r.spell).conc ? '×' : '' }}</span>
    </template>
    <template #cell-components="{ row: r }">
      <span :title="compTitle(r.spell)">{{ comps(r.spell) }}</span>
    </template>
    <template #cell-source="{ row: r }"><SourceBadge :source="r.spell.source" :page="r.spell.page" /></template>
  </SortableTable>
</template>

<style scoped>
.zh {
  font-weight: 600;
}
.conc {
  color: var(--color-dice);
}
.rit {
  margin-left: var(--space-1);
  color: var(--color-tce);
}
.holders {
  color: var(--color-dice);
  font-size: 0.75rem;
}
.reason {
  color: var(--color-danger);
  font-size: 0.75rem;
}
.muted {
  color: var(--color-text-muted);
}
</style>
