<script setup lang="ts">
// 選項瀏覽器：分類分頁＋文字搜尋＋法術篩選。只顯示目前書目設定下可見的條目。
// 每個分頁第一次被打開時才載入對應的資料檔（避免一開頁就讀 7 MB）。
import { computed, ref, watch } from 'vue'
import type { EntryKind } from '@/data/ids'
import { entryMatches, sourceAbbr } from '@/data/sourceDisplay'
import { schoolName, spellLevelText } from '@/data/summary'
import { languageDefaults } from '@/data/languageTable'
import { useRulesData } from '@/composables/useRulesData'
import { languageRows } from '@/rules/data'
import type { DataFileName, Entry, SpellClassRef } from '@/data/types'
import { useCatalogStore } from '@/stores/catalog'
import { useSourceFilterStore } from '@/stores/sourceFilter'
import LegacyHint from '../LegacyHint.vue'
import LanguageTable from '../languages/LanguageTable.vue'
import ClassDetail from './ClassDetail.vue'
import EntryRow from './EntryRow.vue'

interface Tab {
  id: EntryKind
  label: string
  /** 這個分頁需要的資料檔 */
  files: DataFileName[]
}
const TABS: Tab[] = [
  { id: 'race', label: '種族', files: ['races'] },
  { id: 'background', label: '背景', files: ['backgrounds'] },
  { id: 'class', label: '職業', files: ['classes'] },
  { id: 'feat', label: '專長', files: ['feats'] },
  { id: 'spell', label: '法術', files: ['spells', 'classes'] },
  { id: 'item', label: '物品', files: ['items'] },
  { id: 'optionalfeature', label: '可選特性', files: ['optionalfeatures'] },
  { id: 'language', label: '語言', files: ['rules'] },
]
const PAGE = 60

const catalog = useCatalogStore()
const filter = useSourceFilterStore()

const tabId = ref<EntryKind>('race')
const tab = computed(() => TABS.find((t) => t.id === tabId.value)!)
const query = ref('')
const limit = ref(PAGE)
const spellLevel = ref<string>('')
const spellSchool = ref<string>('')
const spellClass = ref<string>('')
/** 這個分頁暫時顯示重印舊版（換分頁就恢復） */
const revealLegacy = ref(false)
watch(tabId, () => (revealLegacy.value = false))

watch(
  tab,
  (t) => {
    for (const f of t.files) void catalog.ensure(f)
  },
  { immediate: true },
)
watch([tabId, query, spellLevel, spellSchool, spellClass, revealLegacy, () => filter.state], () => (limit.value = PAGE))

const loaded = computed(() => tab.value.files.every((f) => catalog.isLoaded(f)))

/** 目前書目下可見的條目（還沒套搜尋），以及被隱藏的重印舊版數量。 */
const split = computed(() => filter.legacySplit(catalog.list(tabId.value), revealLegacy.value))
const visible = computed(() => split.value.shown)

/** 點「已有新版」：切到新版所在分頁並搜尋它的名稱 */
function jump(newer: Entry) {
  if (TABS.some((t) => t.id === newer.kind)) tabId.value = newer.kind
  query.value = newer.name
}

const classOptions = computed(() =>
  catalog
    .list('class')
    .filter(filter.visible)
    .map((c) => ({ key: `${c.name}|${c.source}`, label: `${c.name}（${sourceAbbr(c.source)}）` })),
)

function spellHasClass(sp: Entry, key: string): boolean {
  return ((sp.classes as SpellClassRef[] | undefined) ?? []).some(
    (c) =>
      `${c.className}|${c.classSource}` === key &&
      (!c.tceOptional || filter.tceOptional) &&
      (!c.definedIn || c.definedIn.some((s) => filter.enabledSet.has(s))),
  )
}

const results = computed(() => {
  const q = query.value.trim().toLowerCase()
  let list = visible.value
  if (q) {
    list = list.filter((e) => entryMatches(e, q))
  }
  if (tabId.value === 'spell') {
    if (spellLevel.value !== '') list = list.filter((e) => String(e.level) === spellLevel.value)
    if (spellSchool.value) list = list.filter((e) => e.school === spellSchool.value)
    if (spellClass.value) list = list.filter((e) => spellHasClass(e, spellClass.value))
  }
  return [...list].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN') || a.source.localeCompare(b.source))
})

const filtered = computed(
  () =>
    !!query.value.trim() ||
    (tabId.value === 'spell' && !!(spellLevel.value || spellSchool.value || spellClass.value)),
)

// 語言分頁（M7-6）：改用可排序表格＋三態篩選；同名語言合併成一列（languageRows）
const rules = useRulesData()
const langRows = computed(() => languageRows(rules.data.value).filter((r) => filter.visible(r.entry)))
const langDefaults = computed(() => languageDefaults(filter.enabled))

function subracesOf(race: Entry): Entry[] {
  return catalog
    .list('subrace')
    .filter((s) => s.raceName === race.name && s.raceSource === race.source && filter.visible(s))
}
</script>

<template>
  <section class="browser" data-testid="browser">
    <nav class="tabs" role="tablist">
      <button
        v-for="t in TABS"
        :key="t.id"
        type="button"
        role="tab"
        :aria-selected="t.id === tabId"
        :class="{ active: t.id === tabId }"
        :data-tab="t.id"
        @click="tabId = t.id"
      >
        {{ t.label }}
      </button>
    </nav>

    <div v-if="tabId !== 'language'" class="toolbar">
      <input v-model="query" type="search" placeholder="搜尋中文或英文名，或來源（PHB24／XPHB）…" data-testid="search" />
      <template v-if="tabId === 'spell'">
        <select v-model="spellLevel" data-testid="spell-level">
          <option value="">全部環位</option>
          <option v-for="n in 10" :key="n" :value="String(n - 1)">{{ spellLevelText(n - 1) }}</option>
        </select>
        <select v-model="spellSchool" data-testid="spell-school">
          <option value="">全部學派</option>
          <option v-for="s in ['A', 'C', 'D', 'E', 'V', 'I', 'N', 'T']" :key="s" :value="s">{{ schoolName(s) }}</option>
        </select>
        <select v-model="spellClass" data-testid="spell-class">
          <option value="">全部職業</option>
          <option v-for="c in classOptions" :key="c.key" :value="c.key">{{ c.label }}</option>
        </select>
      </template>
    </div>

    <p class="count" data-testid="count">
      <template v-if="loaded">
        目前書目下共 <strong>{{ visible.length }}</strong> 項<template v-if="filtered">，符合條件 {{ results.length }} 項</template>
      </template>
      <template v-else>載入中…</template>
      <LegacyHint v-if="loaded" v-model="revealLegacy" :hidden="split.hidden" />
    </p>

    <LanguageTable v-if="tabId === 'language' && loaded" table-id="browser:language" :rows="langRows" :defaults="langDefaults" />
    <ul v-else class="list">
      <EntryRow v-for="e in results.slice(0, limit)" :key="e.id" :entry="e" @jump="jump">
        <ClassDetail v-if="e.kind === 'class'" :cls="e" />
        <template v-if="e.kind === 'race' && subracesOf(e).length">
          <h4>亞種</h4>
          <ul class="sub">
            <EntryRow v-for="s in subracesOf(e)" :key="s.id" :entry="{ ...s, name: s.name || `${e.name}（基本）` }" />
          </ul>
        </template>
      </EntryRow>
    </ul>
    <button v-if="tabId !== 'language' && results.length > limit" type="button" class="more" @click="limit += PAGE">
      再顯示 {{ Math.min(PAGE, results.length - limit) }} 項（還有 {{ results.length - limit }} 項）
    </button>
  </section>
</template>

<style scoped>
.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  border-bottom: 1px solid var(--color-border);
}
.tabs button {
  padding: var(--space-2) var(--space-3);
  border: 0;
  border-bottom: 2px solid transparent;
  background: none;
  color: var(--color-text-muted);
  font: inherit;
  cursor: pointer;
}
.tabs button.active {
  border-bottom-color: var(--color-accent);
  color: var(--color-text);
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin: var(--space-3) 0 var(--space-2);
}
input,
select {
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
}
input {
  flex: 1 1 240px;
}
.count {
  margin: 0 0 var(--space-2);
  color: var(--color-text-muted);
}
.list,
.sub {
  margin: 0;
  padding: 0;
}
h4 {
  margin: var(--space-3) 0 var(--space-1);
}
.more {
  margin: var(--space-3) auto;
  display: block;
  padding: var(--space-2) var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface-raised);
  color: var(--color-text);
  cursor: pointer;
}
</style>
