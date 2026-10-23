/**
 * 條目在目前書目設定下是否該顯示（純函式，store 與測試共用）。
 */
import { sourceOfId } from './ids.ts'
import type { Entry } from './types.ts'

export interface FilterState {
  /** 目前啟用的來源代碼 */
  enabled: ReadonlySet<string>
  /** 顯示已被 2024 重印取代的舊版 */
  showLegacy: boolean
  /** 啟用 TCE 可選規則 */
  tceOptional: boolean
}

/** 有任一重印版的來源目前已啟用 → 這筆舊版已被取代。 */
export function isSuperseded(entry: Entry, enabled: ReadonlySet<string>): boolean {
  return !!entry.reprintedAs?.some((id) => enabled.has(sourceOfId(id)))
}

export function isVisible(entry: Entry, f: FilterState): boolean {
  if (!f.enabled.has(entry.source)) return false
  if (entry.tceOptional && !f.tceOptional) return false
  if (!f.showLegacy && isSuperseded(entry, f.enabled)) return false
  return true
}
