<script setup lang="ts">
// 法術選擇表格：不用點開就看得到環階（儀式）、施法時間、學派、專注、射程、持續時間、成分（含耗材）、狀態與來源。
// 點欄位標題排序（再點一次反向）。
// 最左邊是勾選控制項，點**名稱**才是開詳情（兩者分開，M9.md §2.5）：
//   - 一般池子：勾選框（單選池子為圓鈕）。
//   - 法術書制（法師）：兩階段按鈕，依序「未擁有 → 在法術書 → 已準備 → 未擁有」；右鍵（或長按）有「只取消準備」「移出法術書」。
// 表格本體是通用的 SortableTable（M7-6 抽出），這裡只定義欄位與各格的內容。
import { ref } from 'vue'
import type { Entry, SpellIndex } from '@/data/types'
import type { SpellSort, SpellSortKey } from '@/data/spellFilter'
import { schoolName } from '@/data/summary'
import { castingTime, durationText, materialText, rangeText } from '@/rules/spells'
import type { BookStatus } from '@/rules/spells/spellbook'
import LegacyBadge from '../LegacyBadge.vue'
import SourceBadge from '../SourceBadge.vue'
import SortableTable from '../table/SortableTable.vue'
import type { Column } from '../table/types'

export interface PickBadge {
  text: string
  cls: string
  title?: string
}

export interface PickRow {
  spell: Entry
  /** 一般池子：已選 */
  selected: boolean
  /** 法術書制：目前狀態 */
  book?: BookStatus
  /** 不符合這個池子條件的原因（反灰顯示） */
  blocked?: string
  /** 勾選框停用的原因（例如已選滿、已由其他來源取得） */
  disabled?: string
  /** 狀態欄徽章：在法術書、已準備、已由 X 取得、免費、儀式 */
  badges: PickBadge[]
  /** 上一次點擊被擋下的原因（例如「法術書已滿 16/16」） */
  hint?: string
}

const props = defineProps<{
  rows: PickRow[]
  sort: SpellSort
  /** multi＝勾選框；single＝圓鈕；book＝法術書兩階段 */
  mode: 'multi' | 'single' | 'book'
  slotKey: string
  openId?: string
}>()
const emit = defineEmits<{
  toggle: [spell: Entry]
  open: [spell: Entry]
  sort: [key: SpellSortKey]
  jump: [newer: Entry]
  /** 法術書：只取消準備／移出法術書 */
  bookAction: [spell: Entry, action: 'unprepare' | 'remove']
}>()

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

/** 狀態欄不能排序，所以欄位 key 比排序 key 多一個 status */
type ColKey = SpellSortKey | 'status'
const COLS: Column<PickRow, ColKey>[] = [
  { key: 'name', label: '名稱' },
  { key: 'level', label: '環階', cls: 'nowrap' },
  { key: 'time', label: '施法時間', text: (r) => castingTime(r.spell) },
  { key: 'school', label: '學派', cls: 'nowrap', text: (r) => schoolName(r.spell.school) },
  { key: 'conc', label: '專注', cls: 'nowrap center' },
  { key: 'range', label: '射程', text: (r) => rangeText(r.spell) },
  { key: 'duration', label: '持續時間', text: (r) => durationText(r.spell).text },
  { key: 'components', label: '成分', cls: 'nowrap' },
  { key: 'status', label: '狀態', sortable: false },
  { key: 'source', label: '來源' },
]

const BOOK_LABEL: Record<BookStatus, string> = { none: '未擁有：點一下抄進法術書', book: '在法術書：點一下設為準備', prepared: '已準備：點一下移出法術書（同時取消準備）' }
const BOOK_ICON: Record<BookStatus, string> = { none: '○', book: '📖', prepared: '📖✓' }

// ---- 右鍵／長按選單（法術書） ----
const menu = ref<{ id: string; spell: Entry; x: number; y: number; status: BookStatus } | null>(null)
let pressTimer: ReturnType<typeof setTimeout> | undefined
function openMenu(r: PickRow, ev: MouseEvent | PointerEvent) {
  if (props.mode !== 'book' || !r.book || r.book === 'none') return
  menu.value = { id: r.spell.id, spell: r.spell, x: ev.clientX, y: ev.clientY, status: r.book }
}
function pressStart(r: PickRow, ev: PointerEvent) {
  if (ev.pointerType === 'mouse') return
  pressTimer = setTimeout(() => openMenu(r, ev), 500)
}
const pressEnd = () => clearTimeout(pressTimer)
function act(action: 'unprepare' | 'remove') {
  if (menu.value) emit('bookAction', menu.value.spell, action)
  menu.value = null
}
const memo = (r: PickRow) => [r.selected, r.book, r.blocked, r.disabled, r.hint, r.badges.map((b) => b.text).join(), props.openId === r.spell.id, props.mode]
</script>

<template>
  <div class="pick-wrap" @click="menu = null">
    <SortableTable
      class="pick"
      :data-slot="slotKey"
      data-testid="spell-pick-table"
      :columns="COLS"
      :rows="rows"
      :row-key="(r) => r.spell.id"
      :sort="sort"
      :select="mode === 'book' ? 'custom' : mode === 'multi' ? 'checkbox' : 'radio'"
      :name="slotKey"
      :selected="(r) => r.selected"
      :disabled="(r) => (r.blocked ? `不能選：${r.blocked}` : r.disabled)"
      :row-class="(r) => ({ sel: r.selected || r.book === 'prepared', inbook: r.book === 'book', blocked: !!r.blocked, open: openId === r.spell.id })"
      :row-title="(r) => (r.blocked ? `不能選：${r.blocked}` : '')"
      :memo="memo"
      row-attr="data-spell-row"
      @sort="(k) => k !== 'status' && emit('sort', k)"
      @toggle="(r) => emit('toggle', r.spell)"
    >
      <template #select="{ row: r }">
        <button
          type="button"
          class="book-ctl"
          :class="r.book"
          :data-value="r.spell.id"
          :data-book="r.book"
          :disabled="!!r.blocked"
          :title="r.blocked ? `不能選：${r.blocked}` : BOOK_LABEL[r.book ?? 'none']"
          @click="emit('toggle', r.spell)"
          @contextmenu.prevent="openMenu(r, $event)"
          @pointerdown="pressStart(r, $event)"
          @pointerup="pressEnd"
          @pointerleave="pressEnd"
        >
          {{ BOOK_ICON[r.book ?? 'none'] }}
        </button>
      </template>
      <template #cell-name="{ row: r }">
        <button type="button" class="name" :data-open="r.spell.id" title="開啟法術詳情" @click.stop="emit('open', r.spell)">
          <span class="zh">{{ r.spell.name }}</span> <small class="muted">{{ r.spell.engName }}</small>
        </button>
        <LegacyBadge :entry="r.spell" @jump="(e: Entry) => emit('jump', e)" />
        <div v-if="r.blocked" class="reason">{{ r.blocked }}</div>
        <div v-if="r.hint" class="hint" data-testid="spell-hint">⚠ {{ r.hint }}</div>
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
      <template #cell-status="{ row: r }">
        <span v-for="b in r.badges" :key="b.text" class="badge" :class="b.cls" :title="b.title" data-testid="spell-status">{{ b.text }}</span>
      </template>
      <template #cell-source="{ row: r }"><SourceBadge :source="r.spell.source" :page="r.spell.page" /></template>
    </SortableTable>
    <div v-if="menu" class="menu" :style="{ left: `${menu.x}px`, top: `${menu.y}px` }" data-testid="book-menu" @click.stop>
      <button v-if="menu.status === 'prepared'" type="button" data-action="unprepare" @click="act('unprepare')">只取消準備</button>
      <button type="button" data-action="remove" @click="act('remove')">移出法術書</button>
    </div>
  </div>
</template>

<style scoped>
.pick-wrap {
  position: relative;
}
/* 欄位多：縮小內距，讓 1366 寬也放得下（不允許水平捲動） */
.pick-wrap :deep(td),
.pick-wrap :deep(th) {
  padding: var(--space-1) 6px;
}
.name {
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.name:hover .zh {
  text-decoration: underline;
}
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
.reason {
  color: var(--color-danger);
  font-size: 0.75rem;
}
.hint {
  color: var(--color-dice);
  font-size: 0.75rem;
}
.badge {
  display: inline-block;
  margin: 0 2px 2px 0;
  padding: 0 4px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  font-size: 0.7rem;
  white-space: nowrap;
}
.badge.book {
  border-color: var(--color-text-muted);
}
.badge.prep {
  border-color: var(--color-accent);
  color: var(--color-accent);
}
.badge.held,
.badge.free {
  border-color: var(--color-dice);
  color: var(--color-dice);
}
.badge.ritual {
  border-color: var(--color-tce);
  color: var(--color-tce);
}
.book-ctl {
  min-width: 2.4em;
  padding: 0 2px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-bg);
  color: var(--color-text-muted);
  font: inherit;
  font-size: 0.8rem;
  cursor: pointer;
}
.book-ctl.book {
  border-color: var(--color-text);
  color: var(--color-text);
}
.book-ctl.prepared {
  border-color: var(--color-accent);
  background: color-mix(in srgb, var(--color-accent) 20%, transparent);
  color: var(--color-accent);
}
.book-ctl:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
:deep(tr.inbook) {
  background: color-mix(in srgb, var(--color-text) 5%, transparent);
}
.menu {
  position: fixed;
  z-index: 20;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface-raised);
}
.menu button {
  padding: var(--space-1) var(--space-3);
  border: 0;
  background: none;
  color: var(--color-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.menu button:hover {
  background: var(--color-surface);
}
.muted {
  color: var(--color-text-muted);
}
</style>
