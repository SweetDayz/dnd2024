/**
 * 來源白名單與書目群組。
 *
 * 這個檔案同時被建置腳本（scripts/build-data.ts，用 Node 執行）與網頁 app 使用，
 * 所以不能 import 任何 Vue 或瀏覽器專用的東西。
 *
 * - 建置時：只有出現在某個群組裡的 source 代碼會被打包（= 白名單）。
 * - 執行時：使用者套用群組，決定哪些書目「啟用」。
 *
 * 書目代碼與中英文名的完整對照見 docs/data-notes.md 的「來源對照表」。
 */

export interface SourceGroup {
  id: string
  label: string
  description: string
  sources: readonly string[]
}

/**
 * 「官方」群組：WotC 出版、內含玩家選項的規則書與設定書（上游分類 core／supplement／setting），加上 EEPC。
 * 使用者決定（2026-10-23）：冒險模組一律不收；EEPC 收。
 */
const OFFICIAL: readonly string[] = [
  // 核心規則書
  'PHB',
  'DMG',
  'MM',
  'XPHB',
  'XDMG',
  'XMM',
  // 擴充規則書（supplement）
  'VGM',
  'XGE',
  'MTF',
  'AI',
  'TCE',
  'FTD',
  'MPMM',
  'BGG',
  'BMT',
  'AU',
  'EEPC', // 元素邪惡玩家手冊：上游書目表沒有，資訊見 scripts/lib/sources.ts
  // 設定書（setting）
  'SCAG',
  'GGR',
  'ERLW',
  'EGW',
  'MOT',
  'VRGR',
  'SCC',
  'AAG',
  'BAM',
  'MPP',
  'SatO',
  'FRAiF',
  'FRHoF',
  'EFA',
  'RHW',
]

export const SOURCE_GROUPS: Record<string, SourceGroup> = {
  official: {
    id: 'official',
    label: '官方',
    description: 'WotC 出版、內含玩家選項的規則書與設定書（不含冒險模組）',
    sources: OFFICIAL,
  },
}

export const DEFAULT_GROUP_ID = 'official'

/** 建置期白名單：所有群組的聯集。 */
export const SOURCE_WHITELIST: ReadonlySet<string> = new Set(
  Object.values(SOURCE_GROUPS).flatMap((g) => g.sources),
)

/** 2024 版規則的來源（其餘視為 2014 版），用來在條目缺少 `edition` 欄位時判斷版本。 */
export const EDITION_2024_CUTOFF = '2024-09-17'
