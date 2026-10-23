<script setup lang="ts">
// 法術選擇（M5）：上方分頁列出角色所有法術選擇欄位（例如「法师戲法 3/3」「法術書 6/6」），
// 中間是篩選面板與可排序的法術表格，下方是點選法術的詳情，右側是「已學會的法術」。
//
// 資料流：
//   選擇欄位（規則引擎產生，options 已經是符合條件的法術）＝候選範圍
//   → 篩選（三態標籤，存在 spellPrefs store，每個欄位各自一份）＋文字搜尋 → 排序 → 表格
// 「選擇欄位的限制優先於篩選」：篩選只會在候選範圍內再縮小；打開「顯示不符合的法術」時，
// 範圍外的法術以反灰顯示並說明原因，但不能勾選。
import { computed, nextTick, ref, watch } from 'vue'
import { useCharacterBuild } from '@/composables/useCharacterBuild'
import {
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
import type { ChoiceSlot, SpellScope } from '@/rules/build'
import { holderLabel, otherHolders, spellHolders, spellScopePool, spellScopeReason, type SpellRow } from '@/rules/spells'
import { useCharacterStore } from '@/stores/character'
import { useSourceFilterStore } from '@/stores/sourceFilter'
import { useSpellPrefsStore } from '@/stores/spellPrefs'
import LegacyHint from '../LegacyHint.vue'
import OriginChip from '../builder/OriginChip.vue'
import KnownSpells from './KnownSpells.vue'
import SpellDetail from './SpellDetail.vue'
import SpellFilterPanel from './SpellFilterPanel.vue'
import SpellPickTable, { type PickRow } from './SpellPickTable.vue'

const { data, build, sheet, spells, mods } = useCharacterBuild()
const store = useCharacterStore()
const filter = useSourceFilterStore()
const prefs = useSpellPrefsStore()

// ---- 分頁：所有法術選擇欄位（職業的戲法、法術書、準備在前，其餘照規則引擎的順序） ----
const ROLE_ORDER: Record<SpellScope['role'], number> = { cantrips: 0, spellbook: 1, prepared: 2, known: 2, feature: 3 }
const slots = computed(() =>
  (build.value?.slots ?? [])
    .filter((s): s is ChoiceSlot & { spell: SpellScope } => s.type === 'spell' && !!s.spell)
    .map((s, i) => ({ s, i }))
    .sort((a, b) => ROLE_ORDER[a.s.spell.role] - ROLE_ORDER[b.s.spell.role] || a.i - b.i)
    .map((x) => x.s),
)
const scopes = computed(() => new Map(slots.value.map((s) => [s.key, s.spell])))
const activeKey = ref<string | null>(null)
const active = computed(
  () => slots.value.find((s) => s.key === activeKey.value) ?? slots.value.find((s) => !s.done) ?? slots.value[0],
)
const filled = (s: ChoiceSlot) => s.selected.filter(Boolean).length
const tabStatus = (s: ChoiceSlot) => (s.done ? 'done' : filled(s) ? 'part' : 'none')

// ---- 篩選狀態（每個欄位各自存在 spellPrefs；沒動過就用預設值） ----
const slotPrefs = computed(() => (active.value ? prefs.get(active.value.key) : undefined))
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
  if (active.value) prefs.update(active.value.key, { filter: st })
}
function setSort(key: SpellSortKey) {
  if (!active.value || !slotPrefs.value) return
  const cur = slotPrefs.value.sort
  prefs.update(active.value.key, { sort: { key, dir: cur.key === key ? (cur.dir === 1 ? -1 : 1) : 1 } })
}
function resetPrefs() {
  if (active.value) prefs.reset(active.value.key)
  query.value = ''
  revealLegacy.value = false
}
// 換分頁時清掉搜尋與暫時顯示
watch(
  () => active.value?.key,
  () => {
    query.value = ''
    revealLegacy.value = false
  },
)

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

// ---- 候選範圍、反灰範圍、篩選、排序 ----
const candidates = computed(() => (active.value?.options ?? []).map((o) => o.entry).filter((e): e is Entry => !!e))
const blocked = computed(() => {
  const m = new Map<string, string>()
  if (!active.value || !slotPrefs.value?.showBlocked) return m
  const ids = new Set(candidates.value.map((e) => e.id))
  for (const sp of spellScopePool(data.value, active.value.spell)) {
    if (!ids.has(sp.id)) m.set(sp.id, spellScopeReason(data.value, sp, active.value.spell) ?? '不符合這個欄位的條件')
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
const shown = computed(() => {
  const list = filterSpells(universe.value, effective.value, facetsOf.value, query.value)
  const pinned = pinnedId.value ? universe.value.find((e) => e.id === pinnedId.value) : undefined
  if (pinned && !list.includes(pinned)) list.unshift(pinned)
  return sortSpells(list, slotPrefs.value?.sort)
})
const legacyHidden = computed(() =>
  stored.value.misc?.tags.reprinted === -1 ? universe.value.filter((e) => facetsOf.value(e).misc.includes('reprinted')).length : 0,
)

// ---- 表格列：已選、反灰、選滿、跨來源重複 ----
const holders = computed(() => (build.value ? spellHolders(build.value) : new Map()))
const isSelected = (id: string) => !!active.value?.selected.includes(id)
const full = computed(() => !!active.value && active.value.count > 1 && filled(active.value) >= active.value.count)
const rows = computed<PickRow[]>(() =>
  shown.value.map((sp) => {
    const sel = isSelected(sp.id)
    const reason = blocked.value.get(sp.id)
    return {
      spell: sp,
      selected: sel,
      ...(reason ? { blocked: reason } : {}),
      ...(!sel && full.value ? { disabled: `已選滿 ${filled(active.value!)}/${active.value!.count}` } : {}),
      holders: active.value ? otherHolders(holders.value, active.value, sp.id).map(holderLabel) : [],
    }
  }),
)
const selectedEntries = computed(() =>
  (active.value?.selected ?? []).filter(Boolean).map((id) => data.value.get(id) ?? ({ id, name: id } as Entry)),
)
const hiddenSelected = computed(() => selectedEntries.value.filter((e) => !shown.value.some((s) => s.id === e.id)).length)
/** 已選、而且也從其他來源取得的法術（跨來源重複：允許，但提示） */
const duplicates = computed(() =>
  active.value
    ? selectedEntries.value
        .map((e) => ({ e, by: otherHolders(holders.value, active.value!, e.id).map(holderLabel) }))
        .filter((x) => x.by.length)
    : [],
)
const legacySelected = computed(() => selectedEntries.value.filter((e) => e.kind && filter.superseded(e)))

function toggle(sp: Entry) {
  const s = active.value
  if (!s || blocked.value.has(sp.id)) return
  const sel = s.selected.filter(Boolean)
  if (sel.includes(sp.id)) store.setChoice(s.key, sel.filter((v) => v !== sp.id))
  else if (s.count === 1) store.setChoice(s.key, [sp.id])
  else if (sel.length < s.count) store.setChoice(s.key, [...sel, sp.id])
}

// ---- 詳情與定位 ----
const openId = ref<string | null>(null)
const openSpell = computed(() => (openId.value ? data.value.get(openId.value) : undefined))
function open(sp: Entry) {
  openId.value = openId.value === sp.id ? null : sp.id
}
/** 「已有新版」：開新版的詳情（新版若在候選範圍內也會出現在表格） */
function jump(newer: Entry) {
  openId.value = newer.id
  pinnedId.value = newer.id
}
async function locate(r: SpellRow) {
  const key = r.grant.slotKey
  if (key && scopes.value.has(key)) activeKey.value = key
  query.value = ''
  pinnedId.value = r.spell.id
  openId.value = r.spell.id
  await nextTick()
  document.querySelector(`[data-spell-row="${CSS.escape(r.spell.id)}"]`)?.scrollIntoView({ block: 'center' })
  document.querySelector('[data-testid="spell-detail"]')?.scrollIntoView({ block: 'nearest' })
}
function selectTab(key: string) {
  activeKey.value = key
  pinnedId.value = null
}
</script>

<template>
  <div class="picker" data-testid="spell-picker">
    <div class="main">
      <nav v-if="slots.length" class="tabs" aria-label="法術選擇欄位">
        <button
          v-for="s in slots"
          :key="s.key"
          type="button"
          class="tab"
          :class="[tabStatus(s), { active: s.key === active?.key }]"
          :data-tab="s.key"
          :title="s.label"
          @click="selectTab(s.key)"
        >
          {{ s.spell.tab }} <b>{{ filled(s) }}/{{ s.count }}</b>
        </button>
      </nav>
      <p v-else class="muted">沒有需要選擇的法術。種族、專長等固定給的法術列在右側。</p>

      <template v-if="active">
        <div class="slot-head">
          <strong>{{ active.label }}</strong>
          <span class="status" :data-status="tabStatus(active)">
            {{ tabStatus(active) === 'none' ? '未選擇 (No Choice Made)' : `已選 ${filled(active)}／${active.count}` }}
          </span>
          <OriginChip :origin="active.origin" />
        </div>
        <ul v-if="active.warnings.length || duplicates.length || legacySelected.length" class="warnings">
          <li v-for="w in active.warnings" :key="w">⚠ {{ w }}</li>
          <li v-for="d in duplicates" :key="d.e.id" data-testid="spell-duplicate">⚠ 「{{ d.e.name }}」已由 {{ d.by.join('、') }} 取得（仍可選，例如抄進法術書）</li>
          <li v-for="e in legacySelected" :key="e.id">⚠ 已選的「{{ e.name }}」已有新版（不會自動更換）</li>
        </ul>
        <div v-if="selectedEntries.length" class="picked" data-testid="picked-row">
          <span class="muted">已選：</span>
          <span v-for="e in selectedEntries" :key="e.id" class="chip">
            <button type="button" class="chip-name" @click="openId = e.id">{{ e.name }}</button>
            <button type="button" class="x" :title="`取消「${e.name}」`" :data-unpick="e.id" @click="toggle(e)">×</button>
          </span>
          <span v-if="full" class="full" data-testid="spell-full">已選滿 {{ filled(active) }}/{{ active.count }}</span>
        </div>

        <div class="tools">
          <input v-model="query" type="search" class="search" placeholder="搜尋法術（中文或英文）" data-testid="spell-search" />
          <button
            type="button"
            class="btn"
            :class="{ on: slotPrefs?.panelOpen }"
            data-testid="spell-filter-toggle"
            @click="prefs.update(active.key, { panelOpen: !slotPrefs?.panelOpen })"
          >
            篩選{{ slotPrefs?.panelOpen ? ' ▲' : ' ▼' }}
          </button>
          <button type="button" class="btn" title="篩選、排序、顯示選項回到預設" data-testid="spell-reset" @click="resetPrefs">重設為預設</button>
          <label class="opt">
            <input
              type="checkbox"
              :checked="slotPrefs?.showBlocked"
              data-testid="spell-show-blocked"
              @change="prefs.update(active.key, { showBlocked: ($event.target as HTMLInputElement).checked })"
            />
            顯示不符合的法術（反灰）
          </label>
          <LegacyHint v-model="revealLegacy" :hidden="legacyHidden" />
          <span class="muted count" data-testid="spell-count">{{ shown.length }} 道</span>
        </div>
        <SpellFilterPanel
          v-if="slotPrefs?.panelOpen"
          :state="stored"
          :tags="tags"
          :label="label"
          :defaults="defaults"
          @update="setFilter"
        />
        <p v-if="hiddenSelected" class="muted" data-testid="hidden-selected">另有 {{ hiddenSelected }} 個已選法術不符合目前的篩選或搜尋</p>

        <div class="table-wrap">
          <SpellPickTable
            :rows="rows"
            :sort="slotPrefs!.sort"
            :multi="active.count > 1"
            :slot-key="active.key"
            :open-id="openId ?? undefined"
            @toggle="toggle"
            @open="open"
            @sort="setSort"
            @jump="jump"
          />
          <p v-if="!rows.length" class="muted empty">沒有符合條件的法術。</p>
        </div>
      </template>

      <SpellDetail v-if="openSpell" :spell="openSpell" :subclass-name="subclassName" class="detail" @jump="jump" />
    </div>

    <KnownSpells v-if="sheet" class="side" :rows="spells" :mods="mods" :pb="sheet.profBonus" :scopes="scopes" @locate="locate" />
  </div>
</template>

<style scoped>
.picker {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: var(--space-3);
  align-items: start;
}
@media (max-width: 1200px) {
  .picker {
    grid-template-columns: minmax(0, 1fr);
  }
}
.main {
  min-width: 0;
}
.side {
  position: sticky;
  top: var(--space-2);
  max-height: calc(100vh - 2 * var(--space-2));
  overflow-y: auto;
}
.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  margin-bottom: var(--space-2);
  border-bottom: 1px solid var(--color-border);
}
.tab {
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--color-border);
  border-bottom: 3px solid var(--color-danger);
  border-radius: var(--radius) var(--radius) 0 0;
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  font-size: 0.85rem;
  cursor: pointer;
}
.tab.part {
  border-bottom-color: var(--color-dice);
}
.tab.done {
  border-bottom-color: var(--color-tce);
}
.tab.none b {
  color: var(--color-danger);
}
.tab.active {
  background: var(--color-surface-raised);
  border-color: var(--color-accent);
}
.slot-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-2);
  margin-bottom: var(--space-1);
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
.warnings {
  margin: 0 0 var(--space-2);
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
  margin-bottom: var(--space-2);
  font-size: 0.85rem;
}
.chip {
  display: inline-flex;
  border: 1px solid var(--color-accent);
  border-radius: var(--radius);
}
.chip button {
  border: 0;
  background: transparent;
  color: var(--color-text);
  font: inherit;
  cursor: pointer;
}
.chip-name {
  padding: 0 var(--space-1);
}
.x {
  padding: 0 var(--space-1);
  color: var(--color-text-muted) !important;
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
.table-wrap {
  max-height: 60vh;
  overflow: auto;
  margin-top: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
}
.empty {
  padding: var(--space-2);
}
.detail {
  margin-top: var(--space-2);
}
.muted {
  color: var(--color-text-muted);
}
</style>
