/**
 * 語言表格（M7-6）：資料瀏覽器的「語言」分頁與建角精靈的語言選擇共用。純函式。
 * 參考 5e.kiwee.top 的語言頁：欄位名稱、英文名、類型、文字、典型使用者、來源，可依類型與來源篩選。
 */
import { LANGUAGE_TYPE_LABEL, LANGUAGE_TYPES, type LanguageRow } from '../rules/data.ts'
import { collectTags, matchAll, sortRows, sourceDefault, type FilterState, type SortState } from './facetFilter.ts'
import { entryMatches, sourceAbbr } from './sourceDisplay.ts'

export const LANGUAGE_GROUP_IDS = ['type', 'source'] as const
export type LanguageGroupId = (typeof LANGUAGE_GROUP_IDS)[number]
export const LANGUAGE_GROUPS: { id: LanguageGroupId; label: string }[] = [
  { id: 'type', label: '類型' },
  { id: 'source', label: '來源' },
]
export type LanguageFilterState = FilterState<LanguageGroupId>

export function languageFacets(r: LanguageRow): Record<LanguageGroupId, string[]> {
  return { type: [r.type], source: r.versions.map((v) => v.source) }
}

export const languageTagLabel = (g: LanguageGroupId, v: string) =>
  g === 'type' ? (LANGUAGE_TYPE_LABEL[v as keyof typeof LANGUAGE_TYPE_LABEL] ?? v) : sourceAbbr(v)

export function languageTags(rows: readonly LanguageRow[]): Record<LanguageGroupId, string[]> {
  return {
    type: collectTags(rows, (r) => [r.type], undefined, LANGUAGE_TYPES),
    source: collectTags(rows, (r) => languageFacets(r).source, sourceAbbr),
  }
}

/** 預設篩選：來源＝啟用的書目（瀏覽器用）；建角的選擇欄位已限定範圍，不另外預設。 */
export const languageDefaults = (enabled?: readonly string[]): LanguageFilterState =>
  enabled ? { source: sourceDefault(enabled) } : {}

/** 文字搜尋：任一版本的中文名、英文名、來源（代碼或縮寫）。 */
export const languageMatches = (r: LanguageRow, q: string) => r.versions.some((v) => entryMatches(v, q))

export function filterLanguages(rows: readonly LanguageRow[], state: LanguageFilterState, query = ''): LanguageRow[] {
  const q = query.trim()
  return rows.filter((r) => (!q || languageMatches(r, q)) && matchAll(languageFacets(r), state, LANGUAGE_GROUP_IDS))
}

export type LanguageSortKey = 'name' | 'engName' | 'type' | 'script' | 'speakers' | 'source'
export const LANGUAGE_DEFAULT_SORT: SortState<LanguageSortKey> = { key: 'type', dir: 1 }

const LANGUAGE_SORT = {
  name: (r: LanguageRow) => r.entry.name,
  engName: (r: LanguageRow) => (r.entry.engName ?? '').toLowerCase(),
  type: (r: LanguageRow) => LANGUAGE_TYPES.indexOf(r.type),
  script: (r: LanguageRow) => r.script || undefined,
  speakers: (r: LanguageRow) => r.speakers || undefined,
  source: (r: LanguageRow) => sourceAbbr(r.entry.source),
}

/** 排序；同值時 2024 核心（XPHB）在前，再依英文名。 */
export const sortLanguages = (rows: readonly LanguageRow[], sort: SortState<LanguageSortKey> = LANGUAGE_DEFAULT_SORT) =>
  sortRows(rows, sort, LANGUAGE_SORT, (a, b) =>
    Number(a.entry.source !== 'XPHB') - Number(b.entry.source !== 'XPHB') || (a.entry.engName ?? '').localeCompare(b.entry.engName ?? ''),
  )
