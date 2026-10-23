<script setup lang="ts">
// 法術選擇（M9）：
//   左中：選擇導覽——依來源分組（各施法職業、其他來源），組內依步驟排序（戲法 → 已知／法術書與準備 → 子職免費）。
//         選中一個池子後，標題列顯示規則白話文、每格的限制與來源徽章；互斥方案（例如魔法學徒選哪個職業）用分段按鈕切換。
//   中：  法術清單。法師的法術書與準備是同一份清單：同一列點兩下（未擁有 → 在法術書 → 已準備）。其他池子是單一勾選。
//   右：  「已學會的法術」；點任何法術名稱，右欄切換成詳情模式（← 返回已學會，或按 Esc），已學會的捲動位置保留。
//
// 資料流：
//   規則引擎的選擇欄位（options 已經是符合條件的法術）＝候選範圍
//   → 篩選（三態標籤，存在 spellPrefs store，每個池子各自一份）＋文字搜尋 → 排序 → 表格
// 法師的點擊交給 spells/spellbook.ts 的狀態機（書滿、備滿、免費抄寫、永遠準備…），結果存進 character.spellbooks。
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useCharacterBuild } from '@/composables/useCharacterBuild'
import {
  SPELL_GROUPS,
  SPELL_GROUP_IDS,
  availableTags,
  defaultFilterState,
  filterSpells,
  makeFacetCache,
  sortSpells,
  tagLabel,
  type SpellFilterState,
  type SpellGroupId,
  type SpellSortKey,
} from '@/data/spellFilter'
import type { Entry } from '@/data/types'
import type { ChoiceSlot, SpellGrant } from '@/rules/build'
import { spellHolders, spellScopePool, spellScopeReason, type SpellRow } from '@/rules/spells'
import { GRANT_KIND_LABEL, castModeLabel } from '@/rules/spells/grants'
import { buildSpellPools, spellbookRules, spellbookState, togglePoolSpell, type SpellPool } from '@/rules/spells/pools'
import { bookCounts, bookStatus, cycleSpellbookState, prepare, unprepare, type SpellbookState } from '@/rules/spells/spellbook'
import { useCharacterStore } from '@/stores/character'
import { useSourceFilterStore } from '@/stores/sourceFilter'
import { useSpellPrefsStore } from '@/stores/spellPrefs'
import LegacyHint from '../LegacyHint.vue'
import OriginChip from '../builder/OriginChip.vue'
import KnownSpells from './KnownSpells.vue'
import SpellDetail from './SpellDetail.vue'
import FacetFilterPanel from '../filter/FacetFilterPanel.vue'
import SpellPickTable, { type PickBadge, type PickRow } from './SpellPickTable.vue'

const { data, build, sheet, spells, mods } = useCharacterBuild()
const store = useCharacterStore()
const filter = useSourceFilterStore()
const prefs = useSpellPrefsStore()

// ---- 導覽：依來源分組的池子 ----
const groups = computed(() => (build.value ? buildSpellPools(build.value) : []))
const pools = computed(() => groups.value.flatMap((g) => g.pools))
/** 法術的互斥方案（`<前綴>:spells:alt`），例如魔法學徒選牧師／德魯伊／法師 */
const altSlots = computed(() => (build.value?.slots ?? []).filter((s) => s.type === 'alternative' && s.key.endsWith(':spells:alt')))
/** 還沒選方案、所以還沒有池子的互斥選擇 */
const pendingAlts = computed(() => altSlots.value.filter((s) => !s.selected.length))
/** 固定給予、不必選擇的其他來源（導覽上打勾顯示） */
const fixedSources = computed(() => {
  const withPool = new Set(pools.value.map((p) => p.slot.origin.entry?.id))
  const m = new Map<string, string>()
  for (const r of spells.value) {
    for (const g of r.grants) {
      const o = g.origin
      if (o.type === 'class' || o.type === 'subclass' || withPool.has(o.entry?.id)) continue
      m.set(o.entry?.id ?? o.name, o.name.replace(/ \d+ 级$/, ''))
    }
  }
  return [...m.values()]
})
const hasOtherGroup = computed(() => groups.value.some((g) => g.id === 'other'))

const activeId = ref<string | null>(null)
/** 目前選的是「還沒選方案」的互斥選擇 */
const choosingAlt = computed(() => (activeId.value?.endsWith(':spells:alt') ? altSlots.value.find((s) => s.key === activeId.value) : undefined))
const active = computed<SpellPool | undefined>(() =>
  choosingAlt.value ? undefined : (pools.value.find((p) => p.id === activeId.value) ?? pools.value.find((p) => !p.done) ?? pools.value[0]),
)
/** 目前池子所屬的互斥方案（池子頂端的分段按鈕） */
const activeAlt = computed(() => {
  if (!active.value) return undefined
  const key = active.value.slot.key.replace(/:spells:[^:]+$/, ':spells:alt')
  return altSlots.value.find((s) => s.key === key)
})
const isBook = computed(() => !!active.value?.book)

function poolStatus(p: SpellPool) {
  return p.done ? 'done' : p.filled ? 'part' : 'none'
}
/** 導覽上的計數：法師「書 16/16・備 0/10」，其他「0/3」 */
function poolCount(p: SpellPool): string {
  if (p.book && build.value) {
    const c = bookCounts(spellbookState(p.book, build.value.slots), spellbookRules(p.book, data.value))
    return `書 ${c.book}/${p.book.bookCap}・備 ${c.prepared}/${p.book.prepCap}`
  }
  return `${p.filled}/${p.count}`
}
function selectPool(id: string) {
  activeId.value = id
  pinnedId.value = null
  hints.value = new Map()
}
function chooseAlt(slot: ChoiceSlot, value: string) {
  store.setChoice(slot.key, [value])
  if (activeId.value === slot.key) activeId.value = null
}

// ---- 篩選狀態（每個池子各自存在 spellPrefs；沒動過就用預設值） ----
const prefKey = computed(() => active.value?.id)
const slotPrefs = computed(() => (prefKey.value ? prefs.get(prefKey.value) : undefined))
const defaults = computed(() => defaultFilterState({ enabledSources: filter.enabled, showLegacy: filter.showLegacy }))
const query = ref('')
const revealLegacy = ref(false)
const stored = computed<SpellFilterState>(() => slotPrefs.value?.filter ?? defaults.value)
/** 實際套用的篩選：「已隱藏 N 個重印舊版」點開時，暫時拿掉重印排除 */
const effective = computed<SpellFilterState>(() => {
  const st = stored.value
  if (!revealLegacy.value || st.misc?.tags.reprinted !== -1) return st
  const tags = { ...st.misc.tags }
  delete tags.reprinted
  return { ...st, misc: { ...st.misc, tags } }
})
function setFilter(st: SpellFilterState) {
  if (prefKey.value) prefs.update(prefKey.value, { filter: st })
}
function setSort(key: SpellSortKey) {
  if (!prefKey.value || !slotPrefs.value) return
  const cur = slotPrefs.value.sort
  bookOrder.value = 'level'
  prefs.update(prefKey.value, { sort: { key, dir: cur.key === key ? (cur.dir === 1 ? -1 : 1) : 1 } })
}
function resetPrefs() {
  if (prefKey.value) prefs.reset(prefKey.value)
  query.value = ''
  revealLegacy.value = false
  bookOrder.value = 'state'
  bookView.value = 'all'
}
// 換池子時清掉搜尋與暫時顯示
watch(prefKey, () => {
  query.value = ''
  revealLegacy.value = false
})

// ---- facets（每道法術在各篩選群組的標籤）：書目或開關改變時重算一次 ----
const facetsOf = computed(() =>
  makeFacetCache({
    tceOptional: filter.tceOptional,
    sourceEnabled: (s) => filter.enabledSet.has(s),
    superseded: (e) => filter.superseded(e),
  }),
)
/** 子職標籤：資料存的是短名，這裡換成正式名稱（例如「逸闻」→「逸闻学院」） */
const subclassNames = computed(() => {
  const m = new Map<string, string>()
  for (const sc of data.value.list('subclass')) m.set(`${sc.className}|${sc.classSource}|${sc.shortName}|${sc.source}`, sc.name)
  return m
})
const subclassName = (key: string) => subclassNames.value.get(key)
const label = (g: SpellGroupId, v: string) => tagLabel(g, v, subclassName)

// ---- 法術書（法師）：狀態機 ----
const bookState = computed<SpellbookState | undefined>(() =>
  active.value?.book && build.value ? spellbookState(active.value.book, build.value.slots) : undefined,
)
const bookRules = computed(() => (active.value?.book ? spellbookRules(active.value.book, data.value) : undefined))
/** 清單排序：已準備 → 在法術書 → 未擁有（state），或單純依表頭排序（level） */
const bookOrder = ref<'state' | 'level'>('state')
/** 篩選：全部／只看法術書／只看已準備 */
const bookView = ref<'all' | 'book' | 'prepared'>('all')

// ---- 候選範圍、反灰範圍、篩選、排序 ----
const candidates = computed(() => {
  const list = (active.value?.slot.options ?? []).map((o) => o.entry).filter((e): e is Entry => !!e)
  if (!active.value?.book) return list
  // 法術書池子：免費抄寫的法術一定列出（即使不在法師清單上）
  const ids = new Set(list.map((e) => e.id))
  for (const [id] of active.value.book.free) if (!ids.has(id) && data.value.get(id)) list.push(data.value.get(id)!)
  return list
})
const blocked = computed(() => {
  const m = new Map<string, string>()
  if (!active.value || !slotPrefs.value?.showBlocked) return m
  const ids = new Set(candidates.value.map((e) => e.id))
  for (const sp of spellScopePool(data.value, active.value.slot.spell)) {
    if (!ids.has(sp.id)) m.set(sp.id, spellScopeReason(data.value, sp, active.value.slot.spell) ?? '不符合這個池子的條件')
  }
  return m
})
const universe = computed(() => [
  ...candidates.value,
  ...[...blocked.value.keys()].map((id) => data.value.get(id)).filter((e): e is Entry => !!e),
])
const tags = computed(() =>
  Object.fromEntries(SPELL_GROUP_IDS.map((g) => [g, availableTags(g, universe.value, facetsOf.value, (v) => label(g, v))])),
)
/** 從右側點進來的法術：即使被篩選掉也暫時顯示 */
const pinnedId = ref<string | null>(null)
const BOOK_RANK = { prepared: 0, book: 1, none: 2 } as const
const shown = computed(() => {
  let list = filterSpells(universe.value, effective.value, facetsOf.value, query.value)
  const st = bookState.value
  const R = bookRules.value
  if (st && R && bookView.value !== 'all') {
    list = list.filter((e) => (bookView.value === 'book' ? bookStatus(st, R, e.id) !== 'none' : bookStatus(st, R, e.id) === 'prepared'))
  }
  const pinned = pinnedId.value ? universe.value.find((e) => e.id === pinnedId.value) : undefined
  if (pinned && !list.includes(pinned)) list.unshift(pinned)
  const sorted = sortSpells(list, slotPrefs.value?.sort)
  if (st && R && bookOrder.value === 'state') {
    return sorted
      .map((e, i) => ({ e, i, r: BOOK_RANK[bookStatus(st, R, e.id)] }))
      .sort((a, b) => a.r - b.r || Number(a.e.level) - Number(b.e.level) || a.i - b.i)
      .map((x) => x.e)
  }
  return sorted
})
const legacyHidden = computed(() =>
  stored.value.misc?.tags.reprinted === -1 ? universe.value.filter((e) => facetsOf.value(e).misc.includes('reprinted')).length : 0,
)

// ---- 表格列 ----
const holders = computed(() => (build.value ? spellHolders(build.value) : new Map<string, SpellGrant[]>()))
/** 上一次點擊被擋下的原因（每列一則，換池子時清掉） */
const hints = ref(new Map<string, string>())
const filled = (s: ChoiceSlot) => s.selected.filter(Boolean).length
const full = computed(
  () => !!active.value && !isBook.value && active.value.slot.count > 1 && !active.value.slot.spell.slots && filled(active.value.slot) >= active.value.slot.count,
)

/** 這道法術從「這個池子以外」的來源取得的紀錄 */
function otherSources(id: string): string[] {
  const keys = new Set([active.value?.slot.key, active.value?.prepSlot?.key])
  return (holders.value.get(id) ?? [])
    .filter((g) => !g.slotKey || !keys.has(g.slotKey))
    .map((g) => `${GRANT_KIND_LABEL[g.kind]}・${g.origin.name.replace(/ \d+ 级$/, '')}`)
}

const rows = computed<PickRow[]>(() => {
  const p = active.value
  if (!p) return []
  const st = bookState.value
  const R = bookRules.value
  const optDisabled = new Map(p.slot.options.filter((o) => o.disabled).map((o) => [o.value, o.disabled!]))
  return shown.value.map((sp) => {
    const reason = blocked.value.get(sp.id)
    const badges: PickBadge[] = []
    const ritual = !!(sp.meta as { ritual?: boolean } | undefined)?.ritual
    let row: PickRow
    if (st && R) {
      const status = bookStatus(st, R, sp.id)
      const free = R.free.get(sp.id)
      const always = R.always.get(sp.id)
      if (status !== 'none') badges.push({ text: free ? `在法術書（免費・${free}）` : '在法術書', cls: free ? 'free' : 'book' })
      if (status === 'prepared') badges.push({ text: '已準備', cls: 'prep' })
      if (always) badges.push({ text: `已由 ${always} 永遠準備`, cls: 'held', title: '準備階段鎖住，不必占準備名額' })
      if (ritual && status !== 'none') badges.push({ text: '儀式施放', cls: 'ritual', title: '法術書內的儀式法術不必準備就能以儀式施放' })
      row = { spell: sp, selected: false, book: status, badges }
    } else {
      const sel = p.slot.selected.includes(sp.id)
      const held = optDisabled.get(sp.id)
      if (sel) badges.push({ text: '已選', cls: 'prep' })
      if (held) badges.push({ text: held, cls: 'held' })
      else for (const o of otherSources(sp.id)) badges.push({ text: `已由 ${o} 取得`, cls: 'held' })
      if (ritual) badges.push({ text: '儀式', cls: 'ritual' })
      const disabled = !sel && held ? held : !sel && full.value ? `已選滿 ${filled(p.slot)}/${p.slot.count}` : undefined
      row = { spell: sp, selected: sel, badges, ...(disabled ? { disabled } : {}) }
    }
    const hint = hints.value.get(sp.id)
    return { ...row, ...(reason ? { blocked: reason } : {}), ...(hint ? { hint } : {}) }
  })
})
const selectedEntries = computed(() =>
  (active.value?.slot.selected ?? []).filter(Boolean).map((id) => data.value.get(id) ?? ({ id, name: id } as Entry)),
)
const legacySelected = computed(() => selectedEntries.value.filter((e) => e.kind && filter.superseded(e)))
const warnings = computed(() => [...(active.value?.slot.warnings ?? []), ...(active.value?.prepSlot?.warnings ?? [])])
/** 池子每一格目前放的法術（有格子條件的池子才顯示） */
const cells = computed(() =>
  (active.value?.slot.spell.slots ?? []).map((c, i) => {
    const id = active.value!.slot.selected[i]
    return { label: c.label, spell: id ? data.value.get(id) : undefined }
  }),
)

function hint(id: string, text: string | undefined) {
  const m = new Map(hints.value)
  if (text) m.set(id, text)
  else m.delete(id)
  hints.value = m
}

function saveBook(next: SpellbookState) {
  const info = active.value?.book
  if (info) store.setSpellbook(info.bookKey.replace(/:spellbook$/, ''), next)
}

function toggle(sp: Entry) {
  const p = active.value
  if (!p || blocked.value.has(sp.id)) return
  if (bookState.value && bookRules.value) {
    const r = cycleSpellbookState(bookState.value, sp.id, bookRules.value)
    hint(sp.id, r.blockedReason)
    if (!r.blockedReason) saveBook(r.state)
    return
  }
  const held = p.slot.options.find((o) => o.value === sp.id)?.disabled
  if (held && !p.slot.selected.includes(sp.id)) return hint(sp.id, held)
  const r = togglePoolSpell(data.value, p.slot, sp)
  hint(sp.id, r.blockedReason)
  if (!r.blockedReason) store.setChoice(p.slot.key, r.selected.some(Boolean) ? r.selected : [])
}
function bookAction(sp: Entry, action: 'unprepare' | 'remove') {
  const st = bookState.value
  const R = bookRules.value
  if (!st || !R) return
  if (action === 'unprepare') return saveBook(unprepare(st, sp.id))
  if (R.free.has(sp.id)) return hint(sp.id, `由 ${R.free.get(sp.id)} 免費加入，不能移出法術書`)
  saveBook({ book: st.book.filter((x) => x !== sp.id), prepared: st.prepared.filter((x) => x !== sp.id) })
}

// ---- 右欄：已學會 ↔ 詳情 ----
const openId = ref<string | null>(null)
const openSpell = computed(() => (openId.value ? data.value.get(openId.value) : undefined))
const openRow = computed(() => spells.value.find((r) => r.spell.id === openId.value))
const sideEl = ref<HTMLElement | null>(null)
let knownScroll = 0
function open(sp: Entry) {
  if (!openId.value && sideEl.value) knownScroll = sideEl.value.scrollTop
  openId.value = sp.id
  if (sideEl.value) sideEl.value.scrollTop = 0
}
function back() {
  openId.value = null
  requestAnimationFrame(() => {
    if (sideEl.value) sideEl.value.scrollTop = knownScroll
  })
}
const onKey = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && openId.value) back()
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

/** 「已有新版」：開新版的詳情（新版若在候選範圍內也會出現在表格） */
function jump(newer: Entry) {
  open(newer)
  pinnedId.value = newer.id
}
/** 已學會：點法術名稱 → 詳情；同時把清單切到取得它的池子並定位 */
function openKnown(r: SpellRow) {
  const pool = pools.value.find((p) => r.grants.some((g) => g.slotKey && (g.slotKey === p.slot.key || g.slotKey === p.prepSlot?.key)))
  if (pool && pool.id !== active.value?.id) selectPool(pool.id)
  pinnedId.value = r.spell.id
  open(r.spell)
}

/** 法術書職業（右側「準備／取消準備」按鈕） */
const bookPools = computed(() => pools.value.filter((p) => p.book))
const bookClasses = computed(() => bookPools.value.map((p) => p.book!.bookKey.replace(/:spellbook$/, '')))
const knownHint = ref('')
function knownBook(r: SpellRow, classId: string, action: 'prepare' | 'unprepare') {
  const p = bookPools.value.find((x) => x.book!.bookKey === `${classId}:spellbook`)
  if (!p || !build.value) return
  const st = spellbookState(p.book!, build.value.slots)
  knownHint.value = ''
  if (action === 'unprepare') return store.setSpellbook(classId, unprepare(st, r.spell.id))
  const res = prepare(st, r.spell.id, spellbookRules(p.book!, data.value))
  if (res.blockedReason) knownHint.value = `「${r.spell.name}」：${res.blockedReason}`
  else store.setSpellbook(classId, res.state)
}
/** 詳情裡的法術書按鈕（目前池子是法師的時候） */
const detailBook = computed(() => {
  const st = bookState.value
  const R = bookRules.value
  if (!st || !R || !openSpell.value || Number(openSpell.value.level) < 1) return undefined
  return { status: bookStatus(st, R, openSpell.value.id) }
})
</script>

<template>
  <div class="picker" data-testid="spell-picker">
    <div class="main">
      <nav v-if="groups.length || pendingAlts.length || fixedSources.length" class="pool-nav" aria-label="法術選擇" data-testid="pool-nav">
        <div v-for="g in groups" :key="g.id" class="pool-group" :data-group="g.id">
          <span class="g-label">{{ g.label }}</span>
          <button
            v-for="p in g.pools"
            :key="p.id"
            type="button"
            class="pool"
            :class="[poolStatus(p), { active: p.id === active?.id }]"
            :data-pool="p.id"
            :title="p.slot.label"
            @click="selectPool(p.id)"
          >
            {{ p.label }} <b>{{ poolCount(p) }}</b>
          </button>
          <template v-if="g.id === 'other'">
            <button
              v-for="s in pendingAlts"
              :key="s.key"
              type="button"
              class="pool none"
              :class="{ active: activeId === s.key }"
              :data-pool="s.key"
              @click="selectPool(s.key)"
            >
              {{ s.origin.name.replace(/ \d+ 级$/, '') }}・選方案 <b>0/1</b>
            </button>
            <span v-for="f in fixedSources" :key="f" class="fixed" title="固定給予，不必選擇" :data-fixed-source="f">{{ f }} ✓</span>
          </template>
        </div>
        <div v-if="!hasOtherGroup && (pendingAlts.length || fixedSources.length)" class="pool-group" data-group="other">
          <span class="g-label">其他來源</span>
          <button
            v-for="s in pendingAlts"
            :key="s.key"
            type="button"
            class="pool none"
            :class="{ active: activeId === s.key }"
            :data-pool="s.key"
            @click="selectPool(s.key)"
          >
            {{ s.origin.name.replace(/ \d+ 级$/, '') }}・選方案 <b>0/1</b>
          </button>
          <span v-for="f in fixedSources" :key="f" class="fixed" title="固定給予，不必選擇" :data-fixed-source="f">{{ f }} ✓</span>
        </div>
      </nav>
      <p v-else class="muted">沒有需要選擇的法術。種族、專長等固定給的法術列在右側。</p>

      <!-- 互斥方案還沒選：先選方案 -->
      <section v-if="choosingAlt" class="pool-head" data-testid="pool-head">
        <div class="title">
          <strong>{{ choosingAlt.origin.name }}：選擇一種方案</strong>
          <OriginChip :origin="choosingAlt.origin" />
        </div>
        <div class="seg" role="group" data-testid="alt-switch">
          <button v-for="o in choosingAlt.options" :key="o.value" type="button" :data-alt="o.value" @click="chooseAlt(choosingAlt, o.value)">
            {{ o.label }}
          </button>
        </div>
      </section>

      <template v-else-if="active">
        <section class="pool-head" data-testid="pool-head">
          <div class="title">
            <strong>{{ active.label }}</strong>
            <span class="status" :data-status="poolStatus(active)">
              {{ poolStatus(active) === 'none' ? '未選擇 (No Choice Made)' : poolCount(active) }}
            </span>
            <OriginChip :origin="active.slot.origin" />
          </div>
          <p class="rule" data-testid="pool-rule">{{ active.rule }}</p>
          <p v-if="active.restriction" class="restriction muted" data-testid="pool-restriction">每格限制：{{ active.restriction }}</p>
          <div v-if="activeAlt" class="seg" role="group" data-testid="alt-switch">
            <button
              v-for="o in activeAlt.options"
              :key="o.value"
              type="button"
              :class="{ on: activeAlt.selected.includes(o.value) }"
              :data-alt="o.value"
              @click="chooseAlt(activeAlt, o.value)"
            >
              {{ o.label }}
            </button>
          </div>
          <ul v-if="cells.length > 1" class="cells" data-testid="pool-cells">
            <li v-for="(c, i) in cells" :key="i" :class="{ empty: !c.spell }">
              <small>{{ c.label }}</small>
              <template v-if="c.spell">
                <button type="button" class="cell-name" @click="open(c.spell)">{{ c.spell.name }}</button>
                <button type="button" class="x" :title="`取消「${c.spell.name}」`" :data-unpick="c.spell.id" @click="toggle(c.spell)">×</button>
              </template>
              <span v-else class="muted">空</span>
            </li>
          </ul>
          <div v-else-if="selectedEntries.length && !isBook" class="picked" data-testid="picked-row">
            <span class="muted">已選：</span>
            <span v-for="e in selectedEntries" :key="e.id" class="chip">
              <button type="button" class="chip-name" @click="open(e)">{{ e.name }}</button>
              <button type="button" class="x" :title="`取消「${e.name}」`" :data-unpick="e.id" @click="toggle(e)">×</button>
            </span>
            <span v-if="full" class="full" data-testid="spell-full">已選滿 {{ filled(active.slot) }}/{{ active.slot.count }}</span>
          </div>
          <ul v-if="warnings.length || legacySelected.length" class="warnings">
            <li v-for="w in warnings" :key="w">⚠ {{ w }}</li>
            <li v-for="e in legacySelected" :key="e.id">⚠ 已選的「{{ e.name }}」已有新版（不會自動更換）</li>
          </ul>
        </section>

        <div class="tools">
          <input v-model="query" type="search" class="search" placeholder="搜尋法術（中文或英文）" data-testid="spell-search" />
          <button
            type="button"
            class="btn"
            :class="{ on: slotPrefs?.panelOpen }"
            data-testid="spell-filter-toggle"
            @click="prefs.update(active.id, { panelOpen: !slotPrefs?.panelOpen })"
          >
            篩選{{ slotPrefs?.panelOpen ? ' ▲' : ' ▼' }}
          </button>
          <button type="button" class="btn" title="篩選、排序、顯示選項回到預設" data-testid="spell-reset" @click="resetPrefs">重設為預設</button>
          <template v-if="isBook">
            <div class="seg small" role="group" aria-label="法術書篩選" data-testid="book-view">
              <button type="button" :class="{ on: bookView === 'all' }" data-view="all" @click="bookView = 'all'">全部</button>
              <button type="button" :class="{ on: bookView === 'book' }" data-view="book" @click="bookView = 'book'">只看法術書</button>
              <button type="button" :class="{ on: bookView === 'prepared' }" data-view="prepared" @click="bookView = 'prepared'">只看已準備</button>
            </div>
            <div class="seg small" role="group" aria-label="排序" data-testid="book-order">
              <button type="button" :class="{ on: bookOrder === 'state' }" @click="bookOrder = 'state'">已準備在前</button>
              <button type="button" :class="{ on: bookOrder === 'level' }" @click="bookOrder = 'level'">依環位</button>
            </div>
          </template>
          <label class="opt">
            <input
              type="checkbox"
              :checked="slotPrefs?.showBlocked"
              data-testid="spell-show-blocked"
              @change="prefs.update(active.id, { showBlocked: ($event.target as HTMLInputElement).checked })"
            />
            顯示不符合的法術（反灰）
          </label>
          <LegacyHint v-model="revealLegacy" :hidden="legacyHidden" />
          <span class="muted count" data-testid="spell-count">{{ shown.length }} 道</span>
        </div>
        <FacetFilterPanel
          v-if="slotPrefs?.panelOpen"
          data-testid="spell-filter-panel"
          :groups="SPELL_GROUPS"
          :state="stored"
          :tags="tags"
          :label="label"
          :defaults="defaults"
          @update="setFilter"
        />

        <SpellPickTable
          :rows="rows"
          :sort="slotPrefs!.sort"
          :mode="isBook ? 'book' : active.slot.count > 1 ? 'multi' : 'single'"
          :slot-key="active.id"
          :open-id="openId ?? undefined"
          @toggle="toggle"
          @open="open"
          @sort="setSort"
          @jump="jump"
          @book-action="bookAction"
        />
        <p v-if="!rows.length" class="muted empty">沒有符合條件的法術。</p>
      </template>
    </div>

    <div ref="sideEl" class="side" data-testid="spell-side">
      <div v-if="openSpell" class="detail-mode">
        <button type="button" class="back" data-testid="detail-back" @click="back">← 返回已學會</button>
        <SpellDetail :spell="openSpell" :subclass-name="subclassName" @jump="jump">
          <section v-if="openRow" class="grants" data-testid="detail-grants">
            <h5>此角色取得的方式</h5>
            <ul>
              <li v-for="v in openRow.variants" :key="v.grant.key">
                {{ GRANT_KIND_LABEL[v.grant.kind] }}{{ v.grant.free ? '（免費）' : '' }}・{{ v.sourceLabel }}
                <span class="muted">
                  <template v-if="v.attackBonus !== undefined">命中 {{ v.attackBonus >= 0 ? '+' : '' }}{{ v.attackBonus }}</template>
                  <template v-else-if="v.hitDc !== '—'">{{ v.hitDc }}</template>
                  <template v-for="m in v.grant.castModes" :key="m.type">・{{ castModeLabel(m, { pb: sheet?.profBonus ?? 2, mods }) }}</template>
                </span>
              </li>
            </ul>
          </section>
          <div v-if="detailBook" class="detail-book" data-testid="detail-book">
            <button v-if="detailBook.status === 'none'" type="button" class="btn" @click="toggle(openSpell)">抄進法術書</button>
            <button v-if="detailBook.status === 'book'" type="button" class="btn" @click="toggle(openSpell)">設為準備</button>
            <button v-if="detailBook.status === 'prepared'" type="button" class="btn" @click="bookAction(openSpell, 'unprepare')">取消準備</button>
            <span v-if="hints.get(openSpell.id)" class="hint">⚠ {{ hints.get(openSpell.id) }}</span>
          </div>
        </SpellDetail>
      </div>
      <div v-show="!openSpell">
        <p v-if="knownHint" class="hint">⚠ {{ knownHint }}</p>
        <KnownSpells
          v-if="sheet"
          :rows="spells"
          :mods="mods"
          :pb="sheet.profBonus"
          :book-classes="bookClasses"
          @open="openKnown"
          @prepare="(r, cls) => knownBook(r, cls, 'prepare')"
          @unprepare="(r, cls) => knownBook(r, cls, 'unprepare')"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.picker {
  display: grid;
  grid-template-columns: minmax(0, 1fr) clamp(280px, 22vw, 360px);
  gap: var(--space-3);
  align-items: start;
}
@media (max-width: 1100px) {
  .picker {
    grid-template-columns: minmax(0, 1fr);
  }
}
.main {
  min-width: 0;
}
/* 右欄：sticky，高度到視窗底；內容較長時在欄內捲動（整個畫面唯一的次要捲動區，M9.md §2.5） */
.side {
  position: sticky;
  top: var(--space-2);
  max-height: calc(100vh - 2 * var(--space-2));
  overflow-y: auto;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
}
.back {
  margin-bottom: var(--space-2);
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--color-accent);
  border-radius: var(--radius);
  background: transparent;
  color: var(--color-accent);
  font: inherit;
  cursor: pointer;
}
.grants h5 {
  margin: var(--space-2) 0 var(--space-1);
  color: var(--color-text-muted);
}
.grants ul {
  margin: 0;
  padding-left: var(--space-3);
  font-size: 0.85rem;
}
.detail-book {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-2);
}
.pool-nav {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin-bottom: var(--space-2);
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--color-border);
}
.pool-group {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-1);
}
.g-label {
  min-width: 5em;
  color: var(--color-accent);
  font-weight: 700;
}
.pool {
  padding: 2px var(--space-2);
  border: 1px solid var(--color-border);
  border-bottom: 3px solid var(--color-danger);
  border-radius: var(--radius);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  font-size: 0.85rem;
  cursor: pointer;
}
.pool.part {
  border-bottom-color: var(--color-dice);
}
.pool.done {
  border-bottom-color: var(--color-tce);
}
.pool.none b {
  color: var(--color-danger);
}
.pool.active {
  background: var(--color-surface-raised);
  border-color: var(--color-accent);
}
.fixed {
  padding: 2px var(--space-2);
  color: var(--color-text-muted);
  font-size: 0.85rem;
}
.pool-head {
  margin-bottom: var(--space-2);
}
.title {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-2);
}
.rule {
  margin: var(--space-1) 0;
  font-size: 0.9rem;
}
.restriction {
  margin: 0 0 var(--space-1);
  font-size: 0.85rem;
}
.status {
  font-size: 0.8rem;
}
.status[data-status='none'] {
  color: var(--color-danger);
}
.status[data-status='part'] {
  color: var(--color-dice);
}
.status[data-status='done'] {
  color: var(--color-tce);
}
.seg {
  display: inline-flex;
  flex-wrap: wrap;
  margin: var(--space-1) 0;
}
.seg button {
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  font-size: 0.85rem;
  cursor: pointer;
}
.seg.small button {
  padding: 2px var(--space-2);
  font-size: 0.8rem;
}
.seg button:first-child {
  border-radius: var(--radius) 0 0 var(--radius);
}
.seg button:last-child {
  border-radius: 0 var(--radius) var(--radius) 0;
}
.seg button.on {
  border-color: var(--color-accent);
  color: var(--color-accent);
}
.cells {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  margin: var(--space-1) 0;
  padding: 0;
  list-style: none;
  font-size: 0.85rem;
}
.cells li {
  display: inline-flex;
  align-items: baseline;
  gap: var(--space-1);
  padding: 0 var(--space-2);
  border: 1px solid var(--color-accent);
  border-radius: var(--radius);
}
.cells li.empty {
  border-style: dashed;
  border-color: var(--color-border);
}
.cell-name,
.chip button {
  border: 0;
  background: transparent;
  color: var(--color-text);
  font: inherit;
  cursor: pointer;
}
.warnings {
  margin: var(--space-1) 0 0;
  padding: 0;
  list-style: none;
  color: var(--color-dice);
  font-size: 0.85rem;
}
.picked {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-1);
  margin: var(--space-1) 0;
  font-size: 0.85rem;
}
.chip {
  display: inline-flex;
  border: 1px solid var(--color-accent);
  border-radius: var(--radius);
}
.chip-name {
  padding: 0 var(--space-1);
}
.x {
  padding: 0 var(--space-1);
  border: 0;
  background: transparent;
  color: var(--color-text-muted);
  font: inherit;
  cursor: pointer;
}
.full {
  margin-left: var(--space-2);
  color: var(--color-tce);
}
.tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
}
.search {
  flex: 1 1 220px;
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-bg);
  color: inherit;
  font: inherit;
}
.btn {
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  font-size: 0.85rem;
  cursor: pointer;
}
.btn.on {
  border-color: var(--color-accent);
}
.opt {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-size: 0.85rem;
  color: var(--color-text-muted);
  cursor: pointer;
}
.count {
  margin-left: auto;
  font-size: 0.8rem;
}
.hint {
  color: var(--color-dice);
  font-size: 0.85rem;
}
.empty {
  padding: var(--space-2);
}
.muted {
  color: var(--color-text-muted);
}
</style>
