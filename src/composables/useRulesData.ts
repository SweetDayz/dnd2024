/**
 * 把 catalog（資料）＋ sourceFilter（書目設定）包成規則引擎要的 RulesData。
 *
 * 規則引擎（src/rules）是純 TS，不認識 Pinia；這個 composable 是兩者之間的轉接頭。
 * 回傳 computed：書目設定改變或有新資料檔載入時，會產生新的 RulesData，
 * 依賴它的 build／角卡數值就會自動重算。
 */
import { computed } from 'vue'
import type { DataFileName } from '@/data/types'
import { isSelectable, supersededBy } from '@/data/visibility'
import type { RulesData } from '@/rules/data'
import { useCatalogStore } from '@/stores/catalog'
import { useSourceFilterStore } from '@/stores/sourceFilter'

/** 建角需要的全部資料檔 */
export const BUILDER_FILES: DataFileName[] = [
  'classes',
  'backgrounds',
  'races',
  'feats',
  'optionalfeatures',
  'spells',
  'items',
  'rules',
]

export function useRulesData() {
  const catalog = useCatalogStore()
  const filter = useSourceFilterStore()

  for (const f of BUILDER_FILES) void catalog.ensure(f)

  const ready = computed(() => BUILDER_FILES.every((f) => catalog.isLoaded(f)))

  const data = computed<RulesData>(() => {
    // 讀這兩個值，讓 computed 在「資料載入」與「書目改變」時重算
    void catalog.version
    const state = filter.state
    return {
      get: (id) => catalog.get(id),
      list: (kind) => catalog.list(kind),
      visible: (e) => filter.visible(e),
      selectable: (e) => isSelectable(e, state),
      supersededBy: (e) => {
        const id = supersededBy(e, state.enabled)
        return id ? catalog.get(id) : undefined
      },
      tceOptional: state.tceOptional,
      sourceEnabled: (s) => state.enabled.has(s),
    }
  })

  return { data, ready }
}
