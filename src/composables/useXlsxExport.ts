/**
 * 角卡「匯出試算表」：收集規則引擎已算好的結果 → 表格資料 → ExcelJS 寫檔 → 下載。
 *
 * ExcelJS 是第一次按下按鈕時才載入，平常開角卡不會多花時間。
 */
import { ref } from 'vue'
import { exportFileName, exportTables } from '@/export/sheetData'
import { loadExcelJS } from '@/export/vendor'
import { buildWorkbook, downloadWorkbook } from '@/export/xlsx'
import { useExportInput } from './useExportInput'

export function useXlsxExport() {
  const { collect } = useExportInput()
  const busy = ref(false)
  const error = ref('')

  async function exportXlsx() {
    busy.value = true
    error.value = ''
    try {
      const [ExcelJS, input] = await Promise.all([loadExcelJS(), collect()])
      if (!input) return
      const tables = exportTables(input)
      await downloadWorkbook(buildWorkbook(ExcelJS, tables), exportFileName(input.character.name, input.sheet.level, input.exportedAt))
    } catch (e) {
      error.value = `匯出失敗：${e instanceof Error ? e.message : String(e)}`
    } finally {
      busy.value = false
    }
  }

  return { exportXlsx, busy, error }
}
