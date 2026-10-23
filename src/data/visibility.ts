/**
 * 條目在目前書目設定下是否該顯示（純函式，store 與測試共用）。
 *
 * 重印規則（通用，不限 2014→2024）：條目 E 預設隱藏，當且僅當 E 的重印目標中至少一個
 *   1. 來源在目前啟用的書目中，且
 *   2. 確實存在於打包的資料中。
 * 第 2 點在建置期處理：`reprintedAs` 只保留建置後實際存在的條目 id（含鏈狀重印的間接目標），
 * 所以執行期只要檢查第 1 點。目標書沒啟用時舊版照常顯示（DM 沒開新書，舊版就是唯一版本）。
 */
import { sourceOfId } from './ids.ts'
import type { Entry } from './types.ts'

export interface FilterState {
  /** 目前啟用的來源代碼 */
  enabled: ReadonlySet<string>
  /** 顯示已被重印取代的版本（全域開關） */
  showLegacy: boolean
  /** 啟用 TCE 可選規則 */
  tceOptional: boolean
}

/** 取代這筆條目的重印版 id（第一個來源已啟用的）；沒被取代回傳 undefined。 */
export function supersededBy(entry: Entry, enabled: ReadonlySet<string>): string | undefined {
  return entry.reprintedAs?.find((id) => enabled.has(sourceOfId(id)))
}

/** 有任一重印版的來源目前已啟用 → 這筆舊版已被取代。 */
export function isSuperseded(entry: Entry, enabled: ReadonlySet<string>): boolean {
  return supersededBy(entry, enabled) !== undefined
}

/** 不看重印規則的可見性：書目已啟用、TCE 可選規則開關。選單用它列出「可以暫時顯示」的舊版。 */
export function isSelectable(entry: Entry, f: Pick<FilterState, 'enabled' | 'tceOptional'>): boolean {
  if (!f.enabled.has(entry.source)) return false
  if (entry.tceOptional && !f.tceOptional) return false
  return true
}

export function isVisible(entry: Entry, f: FilterState): boolean {
  if (!isSelectable(entry, f)) return false
  if (!f.showLegacy && isSuperseded(entry, f.enabled)) return false
  return true
}

/**
 * 一個選單的重印切分：可見的條目、被隱藏的重印舊版數量。
 * `reveal` 為真時（該選單暫時顯示舊版）舊版也列入 shown，但 hidden 仍回報數量讓 UI 顯示提示。
 */
export function splitLegacy<T extends Entry>(entries: readonly T[], f: FilterState, reveal = false) {
  const shown: T[] = []
  let hidden = 0
  for (const e of entries) {
    if (!isSelectable(e, f)) continue
    if (!f.showLegacy && isSuperseded(e, f.enabled)) {
      hidden++
      if (!reveal) continue
    }
    shown.push(e)
  }
  return { shown, hidden }
}
