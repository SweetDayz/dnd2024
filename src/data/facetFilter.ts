/**
 * 通用三態篩選與排序（M7-6 從 M5 的 spellFilter.ts 抽出）。純函式，不依賴 Vue。
 * 法術、語言、物品的表格都用這一套；各自只要定義「群組」與「每列在各群組的標籤值（facets）」。
 *
 * 每個「群組」（來源、類型…）有一組「標籤」，每個標籤是三態：
 *   包含（1，藍）、排除（-1，紅）、不篩選（沒有記錄）。
 * 群組內：
 *   - 有任何「包含」時，OR 模式要符合其中一個、AND 模式要全部符合；
 *   - 任何「排除」的標籤只要符合一個就淘汰（兩種模式都一樣）。
 * 群組之間一律是 AND。
 */

export type TagState = 1 | -1
export interface GroupState {
  /** 標籤 → 包含（1）／排除（-1）；不在表內＝不篩選 */
  tags: Record<string, TagState>
  mode: 'and' | 'or'
}
/** 各群組的狀態；沒有的群組＝不篩選 */
export type FilterState<G extends string = string> = Partial<Record<G, GroupState>>
/** 一列在各群組的標籤值。只有一個 '*' 代表「全部都符合」（例如法術沒寫生物類型＝不限） */
export type Facets<G extends string = string> = Record<G, readonly string[]>

export function matchGroup(values: readonly string[], g: GroupState | undefined): boolean {
  if (!g) return true
  const any = values.length === 1 && values[0] === '*'
  const has = (t: string) => any || values.includes(t)
  const include: string[] = []
  for (const [t, s] of Object.entries(g.tags)) {
    if (s === -1 && has(t)) return false
    if (s === 1) include.push(t)
  }
  if (!include.length) return true
  return g.mode === 'and' ? include.every(has) : include.some(has)
}

export function matchAll<G extends string>(f: Facets<G>, state: FilterState<G>, groups: readonly G[]): boolean {
  for (const id of groups) {
    const g = state[id]
    if (g && !matchGroup(f[id] ?? [], g)) return false
  }
  return true
}

/** 列表中實際出現的標籤：有 fixed 時照 fixed 順序（其餘接在後面），否則依顯示名稱排序。 */
export function collectTags<T>(
  rows: readonly T[],
  valuesOf: (row: T) => readonly string[],
  label: (v: string) => string = (v) => v,
  fixed?: readonly string[],
): string[] {
  const set = new Set<string>()
  for (const r of rows) for (const v of valuesOf(r)) if (v !== '*') set.add(v)
  if (fixed) {
    const known = fixed.filter((v) => set.has(v))
    return [...known, ...[...set].filter((v) => !fixed.includes(v)).sort()]
  }
  return [...set].sort((a, b) => label(a).localeCompare(label(b), 'zh'))
}

/** 三態循環：不篩選 → 包含 → 排除 → 不篩選（上游的點擊順序）。回傳新的群組狀態。 */
export function cycleTag(g: GroupState | undefined, tag: string): GroupState {
  const tags = { ...g?.tags }
  const cur = tags[tag]
  if (cur === undefined) tags[tag] = 1
  else if (cur === 1) tags[tag] = -1
  else delete tags[tag]
  return { mode: g?.mode ?? 'or', tags }
}

/** 全選：所有可用標籤設為包含。 */
export const selectAll = (g: GroupState | undefined, tags: readonly string[]): GroupState => ({
  mode: g?.mode ?? 'or',
  tags: Object.fromEntries(tags.map((t) => [t, 1 as const])),
})

/** 清除：整個群組不篩選（保留 AND／OR）。 */
export const clearGroup = (g: GroupState | undefined): GroupState => ({ mode: g?.mode ?? 'or', tags: {} })

export const toggleMode = (g: GroupState | undefined): GroupState => ({
  tags: { ...g?.tags },
  mode: g?.mode === 'and' ? 'or' : 'and',
})

/** 群組目前有幾個標籤在作用（面板收合時顯示用）。 */
export const activeCount = (g: GroupState | undefined) => (g ? Object.keys(g.tags).length : 0)

/** 來源群組的預設值：啟用的書目全部「包含」。 */
export const sourceDefault = (enabled: readonly string[]): GroupState => ({
  mode: 'or',
  tags: Object.fromEntries(enabled.map((s) => [s, 1 as const])),
})

// ---------------------------------------------------------------------------
// 排序
// ---------------------------------------------------------------------------

export interface SortState<K extends string = string> {
  key: K
  dir: 1 | -1
}

/** 排序值：數字依大小、字串依中文排序；undefined（例如沒有價值的物品）一律排最後，不受方向影響。 */
export type SortValue = number | string | undefined

export function compareValues(a: SortValue, b: SortValue, dir: 1 | -1 = 1): number {
  if (a === undefined || b === undefined) return a === b ? 0 : a === undefined ? 1 : -1
  const c = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'zh')
  return c * dir
}

/** 依某一欄排序（不改動輸入陣列）；同值時用 tiebreak。 */
export function sortRows<T, K extends string>(
  rows: readonly T[],
  sort: SortState<K>,
  values: Record<K, (row: T) => SortValue>,
  tiebreak: (a: T, b: T) => number = () => 0,
): T[] {
  const val = values[sort.key]
  return [...rows].sort((a, b) => compareValues(val(a), val(b), sort.dir) || tiebreak(a, b))
}

/** 點欄位標題：同一欄就反向，換欄就從升冪開始。 */
export const nextSort = <K extends string>(cur: SortState<K>, key: K): SortState<K> => ({
  key,
  dir: cur.key === key ? (cur.dir === 1 ? -1 : 1) : 1,
})
