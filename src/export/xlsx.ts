/**
 * 表格資料 → .xlsx（M3-2）。
 *
 * ExcelJS 由呼叫端傳進來（依賴注入）：瀏覽器裡是 vendor.ts 載入的 window.ExcelJS，
 * Vitest 裡是 import 'exceljs'。這樣同一份程式在兩邊都能跑，也不會被打包進 index.html。
 */
import type { Workbook } from 'exceljs'
import type { ExcelJSLib } from './vendor'
import { downloadBlob } from './download'
import type { SheetTable } from './sheetData'

/** 標題列樣式：粗體、深灰底（Google 試算表開啟後仍保留） */
const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } } as const

export function buildWorkbook(ExcelJS: ExcelJSLib, tables: SheetTable[]): Workbook {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'D&D 2024 中文角色建立器'
  wb.created = new Date()
  for (const t of tables) {
    // 凍結第一列（ySplit: 1），捲動時標題列一直看得到
    const ws = wb.addWorksheet(t.name, { views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }] })
    ws.columns = t.columns.map((c) => ({ header: c.header, width: c.width }))
    for (const r of t.rows) ws.addRow(r)

    const header = ws.getRow(1)
    header.font = { bold: true }
    header.fill = HEADER_FILL
    header.alignment = { vertical: 'middle' }
    t.columns.forEach((c, i) => {
      if (!c.wrap) return
      // 長文字欄位：整欄自動換行、靠上對齊（多行時比較好讀）
      ws.getColumn(i + 1).alignment = { wrapText: true, vertical: 'top' }
    })
    header.alignment = { vertical: 'middle', wrapText: false }
  }
  return wb
}

/** 產生 xlsx 並觸發下載 */
export async function downloadWorkbook(wb: Workbook, fileName: string): Promise<void> {
  const buf = await wb.xlsx.writeBuffer()
  downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileName)
}
