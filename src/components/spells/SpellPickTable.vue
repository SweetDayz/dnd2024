<script setup lang="ts">
// 法術選擇表格：不用點開就看得到環階（儀式）、施法時間、學派、專注、射程、持續時間、成分（含耗材）與來源。
// 點欄位標題排序（再點一次反向）；點勾選框選取；點其他地方在下方顯示詳情。
// 不符合欄位條件的法術（開啟「顯示但反灰」時）與選滿後的其他列，勾選框停用並在 tooltip 說明原因。
import type { Entry, SpellIndex } from '@/data/types'
import type { SpellSort, SpellSortKey } from '@/data/spellFilter'
import { schoolName } from '@/data/summary'
import { castingTime, durationText, materialText, rangeText } from '@/rules/spells'
import LegacyBadge from '../LegacyBadge.vue'
import SourceBadge from '../SourceBadge.vue'

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

const COLS: { key: SpellSortKey; label: string }[] = [
  { key: 'name', label: '名稱' },
  { key: 'level', label: '環階' },
  { key: 'time', label: '施法時間' },
  { key: 'school', label: '學派' },
  { key: 'conc', label: '專注' },
  { key: 'range', label: '射程' },
  { key: 'duration', label: '持續時間' },
  { key: 'components', label: '成分' },
  { key: 'source', label: '來源' },
]

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
</script>

<template>
  <table class="pick" :data-slot="slotKey" data-testid="spell-pick-table">
    <thead>
      <tr>
        <th class="chk"></th>
        <th v-for="c in COLS" :key="c.key" :class="{ sorted: sort.key === c.key }" :data-sort="c.key" @click="emit('sort', c.key)">
          {{ c.label }}<span v-if="sort.key === c.key" class="arrow">{{ sort.dir === 1 ? '▲' : '▼' }}</span>
        </th>
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="r in rows"
        :key="r.spell.id"
        :class="{ sel: r.selected, blocked: !!r.blocked, open: openId === r.spell.id }"
        :data-spell-row="r.spell.id"
        :title="r.blocked ? `不能選：${r.blocked}` : ''"
        @click="emit('open', r.spell)"
      >
        <td class="chk" @click.stop>
          <input
            :type="multi ? 'checkbox' : 'radio'"
            :name="slotKey"
            :checked="r.selected"
            :disabled="!!(r.blocked || r.disabled)"
            :title="r.blocked ? `不能選：${r.blocked}` : r.disabled"
            :data-value="r.spell.id"
            @change="emit('toggle', r.spell)"
          />
        </td>
        <td class="name">
          <span class="zh">{{ r.spell.name }}</span> <small class="muted">{{ r.spell.engName }}</small>
          <LegacyBadge :entry="r.spell" @jump="(e: Entry) => emit('jump', e)" />
          <div v-if="r.holders.length" class="holders" data-testid="spell-holders">已由 {{ r.holders.join('、') }} 取得</div>
          <div v-if="r.blocked" class="reason">{{ r.blocked }}</div>
        </td>
        <td class="lv">
          {{ r.spell.level === 0 ? '戲法' : `${r.spell.level} 環` }}<small v-if="idx(r.spell).ritual" class="rit" title="可儀式施展">儀式</small>
        </td>
        <td class="nowrap">{{ castingTime(r.spell) }}</td>
        <td class="nowrap">{{ schoolName(r.spell.school) }}</td>
        <td class="conc" :title="idx(r.spell).conc ? '需要專注' : ''">{{ idx(r.spell).conc ? '×' : '' }}</td>
        <td>{{ rangeText(r.spell) }}</td>
        <td>{{ durationText(r.spell).text }}</td>
        <td class="comp" :title="compTitle(r.spell)">{{ comps(r.spell) }}</td>
        <td><SourceBadge :source="r.spell.source" :page="r.spell.page" /></td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.pick {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}
th {
  position: sticky;
  top: 0;
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
.zh {
  font-weight: 600;
}
.lv,
.comp,
.conc,
.nowrap {
  white-space: nowrap;
}
.conc {
  text-align: center;
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
