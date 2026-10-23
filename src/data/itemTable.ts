/**
 * 物品表格（M7-7）：資料瀏覽器的「物品」分頁與物品欄的「新增物品」共用。純函式。
 * 參考 5e.kiwee.top 的物品頁：一般物品與魔法物品分成兩個表（判斷沿用 M7-3 的 isMundaneItem）；
 * 篩選有來源、類型、稀有度、物品屬性、武器精通、同調、分類，以及價值與重量範圍。
 *
 * 類型名稱來自資料的 itemType、屬性名稱來自 itemProperty、精通名稱來自 itemMastery，不寫死清單。
 */
import type { RulesData } from '../rules/data.ts'
import { collectTags, matchAll, sortRows, sourceDefault, type FilterState, type SortState } from './facetFilter.ts'
import { isMundaneItem } from './items.ts'
import { entryMatches, sourceAbbr } from './sourceDisplay.ts'
import type { Entry } from './types.ts'

export type Attune = 'required' | 'conditional' | 'none'
export type ItemCategory = 'base' | 'generic' | 'specific' | 'other'

export interface ItemRow {
  entry: Entry
  magic: boolean
  /** 類型代碼（type 的前段，例如 M、INS）；沒有 type 的奇物為 'W'，其他為 'OTH' */
  type: string
  /** 價值（銅幣）；資料沒有就是 undefined */
  value?: number
  /** 重量（磅） */
  weight?: number
  rarity: string
  attune: Attune
  /** 同調條件原文（例如「由法师」） */
  attuneText?: string
  /** 物品屬性代碼（2H、V…，去掉來源） */
  properties: string[]
  /** 武器精通（名稱，例如「失衡」） */
  mastery: string[]
  category: ItemCategory
}

/** 少數物品的 rarity 是簡體中文（翻譯時被改掉），換回英文代碼才能和其他物品同組 */
const RARITY_ZH: Record<string, string> = { 珍稀: 'rare', 极珍稀: 'very rare', 传说: 'legendary', 非普通: 'uncommon', 普通: 'common' }

const head = (ref: unknown) => String(ref ?? '').split('|')[0]!
const refOf = (v: unknown) => (typeof v === 'string' ? v : String((v as { uid?: string } | null)?.uid ?? ''))

export function itemRow(it: Entry): ItemRow {
  const t = head(it.type)
  const req = it.reqAttune
  return {
    entry: it,
    magic: !isMundaneItem(it),
    type: t || (it.wondrous ? 'W' : 'OTH'),
    value: typeof it.value === 'number' ? it.value : undefined,
    weight: typeof it.weight === 'number' ? it.weight : undefined,
    rarity: RARITY_ZH[String(it.rarity)] ?? String(it.rarity ?? 'none'),
    attune: req === true ? 'required' : typeof req === 'string' && req ? 'conditional' : 'none',
    ...(typeof req === 'string' && req ? { attuneText: req } : {}),
    properties: ((it.property as unknown[] | undefined) ?? []).map((p) => head(refOf(p))).filter(Boolean),
    mastery: ((it.mastery as unknown[] | undefined) ?? []).map((m) => head(refOf(m))).filter(Boolean),
    category: it.isBaseItem ? 'base' : it.isGenericVariant ? 'generic' : it._isSpecificVariant ? 'specific' : 'other',
  }
}

// ---------------------------------------------------------------------------
// 名稱（類型、屬性從資料讀）
// ---------------------------------------------------------------------------

export interface ItemLabels {
  type(code: string): string
  property(code: string): string
}

/** 同一代碼有多本書時取 2024 版（沒有被重印取代的那筆）。不同代碼同名時（弹药 A／AF）附上代碼區分。 */
function byCode(list: readonly Entry[], name: (e: Entry) => string): Map<string, string> {
  const m = new Map<string, string>()
  for (const e of list) {
    const code = String(e.abbreviation ?? '')
    if (code && (!m.has(code) || !e.reprintedAs)) m.set(code, name(e))
  }
  const count = new Map<string, number>()
  for (const n of m.values()) count.set(n, (count.get(n) ?? 0) + 1)
  for (const [code, n] of m) if (count.get(n)! > 1) m.set(code, `${n}（${code}）`)
  return m
}

export function itemLabels(data: Pick<RulesData, 'list'>): ItemLabels {
  const types = byCode(data.list('itemType'), (e) => e.name)
  const props = byCode(data.list('itemProperty'), (e) => String((e.entries as { name?: string }[] | undefined)?.[0]?.name ?? e.engName ?? e.name))
  return {
    type: (c) => types.get(c) ?? (c === 'W' ? '奇物' : c),
    property: (c) => props.get(c) ?? c,
  }
}

export const RARITY_ORDER = ['none', 'common', 'uncommon', 'rare', 'very rare', 'legendary', 'artifact', 'varies', 'unknown', 'unknown (magic)']
export const RARITY_LABEL: Record<string, string> = {
  none: '無（一般物品）',
  common: '普通',
  uncommon: '非普通',
  rare: '珍稀',
  'very rare': '非常珍稀',
  legendary: '傳說',
  artifact: '神器',
  varies: '不定',
  unknown: '未知',
  'unknown (magic)': '未知（魔法）',
}
export const ATTUNE_LABEL: Record<Attune, string> = { required: '需要同調', conditional: '需特定條件才能同調', none: '不需要同調' }
export const CATEGORY_LABEL: Record<ItemCategory, string> = { base: '基礎', generic: '通用變體', specific: '特定變體', other: '其他' }

// ---------------------------------------------------------------------------
// 篩選
// ---------------------------------------------------------------------------

export const ITEM_GROUP_IDS = ['source', 'type', 'rarity', 'property', 'mastery', 'attune', 'category'] as const
export type ItemGroupId = (typeof ITEM_GROUP_IDS)[number]
export const ITEM_GROUPS: { id: ItemGroupId; label: string }[] = [
  { id: 'source', label: '來源' },
  { id: 'type', label: '類型' },
  { id: 'rarity', label: '稀有度' },
  { id: 'property', label: '物品屬性' },
  { id: 'mastery', label: '武器精通' },
  { id: 'attune', label: '同調' },
  { id: 'category', label: '分類' },
]
export type ItemFilterState = FilterState<ItemGroupId>

/** 範圍篩選：[下限, 上限]，null＝不限。價值以 GP 為單位輸入。 */
export interface ItemRanges {
  value?: [number | null, number | null]
  weight?: [number | null, number | null]
}

export function itemFacets(r: ItemRow): Record<ItemGroupId, string[]> {
  return {
    source: [r.entry.source],
    type: [r.type],
    rarity: [r.rarity],
    property: r.properties,
    mastery: r.mastery,
    attune: [r.attune],
    category: [r.category],
  }
}

export function itemTagLabel(labels: ItemLabels, g: ItemGroupId, v: string): string {
  switch (g) {
    case 'source':
      return sourceAbbr(v)
    case 'type':
      return labels.type(v)
    case 'rarity':
      return RARITY_LABEL[v] ?? v
    case 'property':
      return labels.property(v)
    case 'attune':
      return ATTUNE_LABEL[v as Attune] ?? v
    case 'category':
      return CATEGORY_LABEL[v as ItemCategory] ?? v
    default:
      return v
  }
}

/** 列表中實際出現的標籤（稀有度、同調、分類照固定順序；其餘依名稱）。分類只會出現資料裡真的有的。 */
export function itemTags(rows: readonly ItemRow[], labels: ItemLabels): Record<ItemGroupId, string[]> {
  const out = {} as Record<ItemGroupId, string[]>
  const fixed: Partial<Record<ItemGroupId, readonly string[]>> = {
    rarity: RARITY_ORDER,
    attune: Object.keys(ATTUNE_LABEL),
    category: Object.keys(CATEGORY_LABEL),
  }
  for (const g of ITEM_GROUP_IDS) out[g] = collectTags(rows, (r) => itemFacets(r)[g], (v) => itemTagLabel(labels, g, v), fixed[g])
  return out
}

export const itemDefaults = (enabled?: readonly string[]): ItemFilterState => (enabled ? { source: sourceDefault(enabled) } : {})

const inRange = (v: number | undefined, r: [number | null, number | null] | undefined, scale = 1) => {
  if (!r || (r[0] === null && r[1] === null)) return true
  if (v === undefined) return false
  return (r[0] === null || v >= r[0] * scale) && (r[1] === null || v <= r[1] * scale)
}

export function filterItems(rows: readonly ItemRow[], state: ItemFilterState, query = '', ranges: ItemRanges = {}): ItemRow[] {
  const q = query.trim()
  return rows.filter(
    (r) =>
      (!q || entryMatches(r.entry, q)) &&
      matchAll(itemFacets(r), state, ITEM_GROUP_IDS) &&
      inRange(r.value, ranges.value, 100) &&
      inRange(r.weight, ranges.weight),
  )
}

// ---------------------------------------------------------------------------
// 排序：價值與重量依數值（沒有值的排最後）
// ---------------------------------------------------------------------------

export type ItemSortKey = 'name' | 'engName' | 'type' | 'value' | 'weight' | 'attune' | 'rarity' | 'source'
export const ITEM_DEFAULT_SORT: SortState<ItemSortKey> = { key: 'name', dir: 1 }

export function sortItems(rows: readonly ItemRow[], sort: SortState<ItemSortKey>, labels: ItemLabels): ItemRow[] {
  return sortRows(
    rows,
    sort,
    {
      name: (r) => r.entry.name,
      engName: (r) => (r.entry.engName ?? '').toLowerCase(),
      type: (r) => labels.type(r.type),
      value: (r) => r.value,
      weight: (r) => r.weight,
      attune: (r) => Object.keys(ATTUNE_LABEL).indexOf(r.attune),
      rarity: (r) => RARITY_ORDER.indexOf(r.rarity),
      source: (r) => sourceAbbr(r.entry.source),
    },
    (a, b) => (a.entry.engName ?? '').localeCompare(b.entry.engName ?? ''),
  )
}
