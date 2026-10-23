/**
 * 匯出（試算表、審卡報告）共用的輸入：規則引擎已算好的結果＋書目設定＋上游資料版本。
 *
 * 上游版本資訊（data/meta.js）第一次匯出時才載入，平常開角卡不會多花時間。
 */
import { loadData } from '@/data/loader'
import { SOURCE_GROUPS } from '@/data/sourceGroups'
import { detectEffects } from '@/rules/effects'
import type { DataMeta, ExportInput } from '@/export/sheetData'
import { useCatalogStore } from '@/stores/catalog'
import { useSourceFilterStore } from '@/stores/sourceFilter'
import { useCharacterBuild } from './useCharacterBuild'

export function useExportInput() {
  const { data, store, build, sheet, spells, casting, attacks } = useCharacterBuild()
  const catalog = useCatalogStore()
  const filter = useSourceFilterStore()

  /** 目前角色的匯出輸入；角色還沒算好就回傳 undefined */
  async function collect(now = new Date()): Promise<ExportInput | undefined> {
    const c = store.current
    if (!c || !build.value || !sheet.value) return undefined
    const meta = await loadData<DataMeta>('meta').catch(() => undefined)
    return {
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
    }
  }

  return { collect }
}
