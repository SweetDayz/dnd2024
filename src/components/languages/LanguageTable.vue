<script setup lang="ts">
// 語言表格（M7-6）：資料瀏覽器的「語言」分頁和建角精靈的語言選擇共用。
// 搜尋＋三態篩選面板（類型、來源）＋可排序表格；同一種語言在多本書出現時合併成一列，列出所有來源徽章。
// 篩選、排序、面板展開存在 tablePrefs store（localStorage，以 tableId 區分）。
// 有 select 時第一欄是勾選框（建角用），勾選的變化由父元件處理（emit toggle）。
import { computed, ref } from 'vue'
import { nextSort } from '@/data/facetFilter'
import {
  LANGUAGE_DEFAULT_SORT,
  LANGUAGE_GROUPS,
  filterLanguages,
  languageTagLabel,
  languageTags,
  sortLanguages,
  type LanguageFilterState,
  type LanguageSortKey,
} from '@/data/languageTable'
import { LANGUAGE_TYPE_LABEL, type LanguageRow } from '@/rules/data'
import { useTablePrefsStore } from '@/stores/tablePrefs'
import EntryBlock from '../entries/EntryBlock.vue'
import FacetFilterPanel from '../filter/FacetFilterPanel.vue'
import SourceBadge from '../SourceBadge.vue'
import SortableTable from '../table/SortableTable.vue'
import type { Column } from '../table/types'

const props = defineProps<{
  rows: readonly LanguageRow[]
  tableId: string
  defaults: LanguageFilterState
  select?: 'checkbox' | 'radio'
  selected?: (r: LanguageRow) => boolean
  disabled?: (r: LanguageRow) => string | undefined
  /** 名稱旁的附註（例如「稀有語言」） */
  note?: (r: LanguageRow) => string | undefined
}>()
const emit = defineEmits<{ toggle: [row: LanguageRow] }>()

const prefs = useTablePrefsStore()
const p = computed(() => prefs.get(props.tableId))
const state = computed(() => (p.value.filter as LanguageFilterState | undefined) ?? props.defaults)
const sort = computed(() => (p.value.sort as { key: LanguageSortKey; dir: 1 | -1 } | undefined) ?? LANGUAGE_DEFAULT_SORT)
const query = ref('')

const tags = computed(() => languageTags(props.rows))
const shown = computed(() => sortLanguages(filterLanguages(props.rows, state.value, query.value), sort.value))
const openKey = ref<string>()
const openRow = computed(() => props.rows.find((r) => r.key === openKey.value))

const COLS: Column<LanguageRow, LanguageSortKey>[] = [
  { key: 'name', label: '名稱' },
  { key: 'engName', label: '英文名', text: (r) => r.entry.engName },
  { key: 'type', label: '類型', cls: 'nowrap', text: (r) => LANGUAGE_TYPE_LABEL[r.type] },
  { key: 'script', label: '文字', text: (r) => r.script || '—' },
  { key: 'speakers', label: '典型使用者', text: (r) => r.speakers || '—' },
  { key: 'source', label: '來源' },
]
</script>

<template>
  <div class="lang-table" data-testid="language-table">
    <div class="toolbar">
      <input v-model="query" type="search" placeholder="搜尋中文或英文名，或來源…" data-testid="lang-search" />
      <button type="button" :class="{ on: p.panelOpen }" data-testid="lang-filter-toggle" @click="prefs.update(tableId, { panelOpen: !p.panelOpen })">
        篩選{{ p.filter ? '（已調整）' : '' }}
      </button>
      <button v-if="p.filter || p.sort" type="button" @click="prefs.reset(tableId)">重設</button>
      <span class="muted" data-testid="lang-count">{{ shown.length }} 種</span>
      <slot name="toolbar" />
    </div>
    <FacetFilterPanel
      v-if="p.panelOpen"
      :groups="LANGUAGE_GROUPS"
      :state="state"
      :tags="tags"
      :label="languageTagLabel"
      :defaults="defaults"
      @update="(st) => prefs.update(tableId, { filter: st })"
    />
    <div class="wrap">
      <SortableTable
        :columns="COLS"
        :rows="shown"
        :row-key="(r) => r.key"
        :sort="sort"
        :select="select"
        :name="tableId"
        :selected="selected"
        :disabled="disabled"
        :row-class="(r) => ({ sel: !!selected?.(r), open: openKey === r.key, blocked: !!disabled?.(r) && !selected?.(r) })"
        row-attr="data-lang"
        @sort="(k) => prefs.update(tableId, { sort: nextSort(sort, k) })"
        @toggle="(r) => emit('toggle', r)"
        @open="(r) => (openKey = openKey === r.key ? undefined : r.key)"
      >
        <template #cell-name="{ row: r }">
          <strong>{{ r.entry.name }}</strong>
          <small v-if="note?.(r)" class="note" data-testid="lang-note">{{ note(r) }}</small>
        </template>
        <template #cell-type="{ row: r }"><span :data-type="r.type">{{ LANGUAGE_TYPE_LABEL[r.type] }}</span></template>
        <template #cell-source="{ row: r }">
          <span class="badges"><SourceBadge v-for="v in r.versions" :key="v.id" :source="v.source" :page="v.page" /></span>
        </template>
      </SortableTable>
      <p v-if="!shown.length" class="muted">沒有符合條件的語言。</p>
    </div>
    <section v-if="openRow" class="detail" data-testid="lang-detail">
      <h4>{{ openRow.entry.name }} <small class="muted">{{ openRow.entry.engName }}</small></h4>
      <div v-for="v in openRow.versions" :key="v.id" class="ver">
        <SourceBadge :source="v.source" :page="v.page" />
        <small class="muted">{{ v.type ? `類型：${v.type}` : '' }}{{ v.script ? `・文字：${v.script}` : '' }}</small>
        <EntryBlock v-if="v.entries" :entry="v.entries" />
      </div>
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
input {
  flex: 1 1 220px;
}
button {
  cursor: pointer;
}
button.on {
  border-color: var(--color-accent);
  color: var(--color-accent);
}
.wrap {
  max-height: 520px;
  overflow-y: auto;
  margin-top: var(--space-2);
}
.badges {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 2px;
}
.note {
  margin-left: var(--space-1);
  color: var(--color-dice);
}
.detail {
  margin-top: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
}
.ver {
  margin-bottom: var(--space-2);
}
.muted {
  color: var(--color-text-muted);
}
</style>
