/**
 * 角卡「匯出試算表」：收集規則引擎已算好的結果 → 表格資料 → ExcelJS 寫檔 → 下載。
 *
 * ExcelJS 與上游版本資訊（data/meta.js）都是第一次按下按鈕時才載入，平常開角卡不會多花時間。
 */
import { ref } from 'vue'
import { loadData } from '@/data/loader'
import { SOURCE_GROUPS } from '@/data/sourceGroups'
import { detectEffects } from '@/rules/effects'
import { exportFileName, exportTables, type DataMeta } from '@/export/sheetData'
import { loadExcelJS } from '@/export/vendor'
import { buildWorkbook, downloadWorkbook } from '@/export/xlsx'
import { useCatalogStore } from '@/stores/catalog'
import { useSourceFilterStore } from '@/stores/sourceFilter'
import { useCharacterBuild } from './useCharacterBuild'

export function useXlsxExport() {
  const { data, store, build, sheet, spells, casting, attacks } = useCharacterBuild()
  const catalog = useCatalogStore()
  const filter = useSourceFilterStore()
  const busy = ref(false)
  const error = ref('')

  async function exportXlsx() {
    const c = store.current
    if (!c || !build.value || !sheet.value) return
    busy.value = true
    error.value = ''
    try {
      const [ExcelJS, meta] = await Promise.all([loadExcelJS(), loadData<DataMeta>('meta').catch(() => undefined)])
      const now = new Date()
      const tables = exportTables({
        character: c,
        build: build.value,
        sheet: sheet.value,
        data: data.value,
        spells: spells.value,
        casting: casting.value,
        attacks: attacks.value,
        effects: detectEffects(build.value, data.value),
        sources: catalog.sources,
        filter: {
          groupLabel: filter.groupId ? SOURCE_GROUPS[filter.groupId]?.label : undefined,
          enabled: filter.enabled,
          showLegacy: filter.showLegacy,
          tceOptional: filter.tceOptional,
        },
        meta,
        appVersion: `${__APP_VERSION__}（建置 ${__BUILD_TIME__}）`,
        exportedAt: now,
      })
      await downloadWorkbook(buildWorkbook(ExcelJS, tables), exportFileName(c.name, sheet.value.level, now))
    } catch (e) {
      error.value = `匯出失敗：${e instanceof Error ? e.message : String(e)}`
    } finally {
      busy.value = false
    }
  }

  return { exportXlsx, busy, error }
}
