/**
 * 來源代碼的「顯示」縮寫。純函式，建置腳本與 app 共用，不可 import Vue。
 *
 * 內部（條目 id、存檔、localStorage 的篩選狀態）一律用原始代碼，例如 `XPHB`；
 * 只有畫面上顯示時才換成玩家看得懂的縮寫，例如 `PHB24`。
 * 年份依實際出版年，與 5etools 自己的 `PHB'24`、`DMG'24`、`MM'25` 一致。
 */
import type { SourceInfo } from './types.ts'

export const SOURCE_DISPLAY: Readonly<Record<string, string>> = {
  XPHB: 'PHB24',
  XDMG: 'DMG24',
  XMM: 'MM25',
  PHB: 'PHB14',
  DMG: 'DMG14',
  MM: 'MM14',
}

/** 顯示用縮寫；不在對照表的代碼照原樣。 */
export function sourceAbbr(code: string): string {
  return SOURCE_DISPLAY[code.toUpperCase()] ?? code
}

/** 徽章文字，例如 `PHB24 p.165`；沒有頁碼時 `p.?`（讓使用者知道不是漏顯示）。 */
export function formatSource(code: string, page?: number | string): string {
  return `${sourceAbbr(code)} p.${page ?? '?'}`
}

/** 徽章 tooltip：中文書名、英文書名、原始代碼、出版日期。 */
export function sourceTooltip(code: string, info: SourceInfo | undefined, page?: number | string): string {
  const lines = info
    ? [`${info.name}`, info.engName, `代碼 ${info.source}・出版 ${info.published}`]
    : [`代碼 ${code}`]
  if (page === undefined) lines.push('上游資料沒有頁碼')
  return lines.join('\n')
}

/**
 * 搜尋字串是否指向這個來源：輸入原始代碼（`XPHB`）或顯示縮寫（`PHB24`）都算，不分大小寫。
 * 只做完整比對，避免搜尋「mm」時把所有 MM 系列的條目都撈出來。
 */
export function sourceMatches(code: string, query: string): boolean {
  const q = query.trim().toLowerCase()
  return !!q && (code.toLowerCase() === q || sourceAbbr(code).toLowerCase() === q)
}

/** 條目搜尋（中文名、英文名、別名、來源代碼或縮寫），不分大小寫。 */
export function entryMatches(
  e: { name: string; engName?: string; source?: string; alias?: unknown },
  query: string,
): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return (
    e.name.toLowerCase().includes(q) ||
    !!e.engName?.toLowerCase().includes(q) ||
    (Array.isArray(e.alias) && e.alias.some((a) => String(a).toLowerCase().includes(q))) ||
    (!!e.source && sourceMatches(e.source, q))
  )
}
