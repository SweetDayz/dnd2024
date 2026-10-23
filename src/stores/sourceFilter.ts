/**
 * sourceFilter store：目前啟用哪些書、以及兩個開關（顯示舊版、TCE 可選規則）。
 * 狀態存在 localStorage，重新開啟頁面時還原。
 */
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { DEFAULT_GROUP_ID, SOURCE_GROUPS } from '@/data/sourceGroups'
import type { Entry } from '@/data/types'
import { isSuperseded, isVisible, type FilterState } from '@/data/visibility'

export const STORAGE_KEY = 'dnd2024.sourceFilter'

interface Persisted {
  groupId: string | null
  enabled: string[]
  showLegacy: boolean
  tceOptional: boolean
}

function load(): Persisted | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Persisted) : null
  } catch {
    // file:// 下某些瀏覽器不給用 localStorage；壞掉就當成沒存過
    return null
  }
}

export const useSourceFilterStore = defineStore('sourceFilter', () => {
  const saved = load()
  const defaultGroup = SOURCE_GROUPS[DEFAULT_GROUP_ID]!

  /** 目前套用的群組；使用者單本勾選後變成 null（自訂） */
  const groupId = ref<string | null>(saved ? saved.groupId : DEFAULT_GROUP_ID)
  const enabled = ref<string[]>(saved?.enabled ?? [...defaultGroup.sources])
  const showLegacy = ref(saved?.showLegacy ?? false)
  const tceOptional = ref(saved?.tceOptional ?? false)

  const enabledSet = computed(() => new Set(enabled.value))
  const state = computed<FilterState>(() => ({
    enabled: enabledSet.value,
    showLegacy: showLegacy.value,
    tceOptional: tceOptional.value,
  }))

  function applyGroup(id: string) {
    const g = SOURCE_GROUPS[id]
    if (!g) return
    groupId.value = id
    enabled.value = [...g.sources]
  }

  function toggleSource(source: string, on = !enabledSet.value.has(source)) {
    enabled.value = on ? [...new Set([...enabled.value, source])] : enabled.value.filter((s) => s !== source)
    // 跟某個群組完全一樣就視為該群組，否則是自訂
    groupId.value =
      Object.values(SOURCE_GROUPS).find(
        (g) => g.sources.length === enabled.value.length && g.sources.every((s) => enabledSet.value.has(s)),
      )?.id ?? null
  }

  const visible = (e: Entry) => isVisible(e, state.value)
  const superseded = (e: Entry) => isSuperseded(e, enabledSet.value)

  watch([groupId, enabled, showLegacy, tceOptional], () => {
    try {
      const data: Persisted = {
        groupId: groupId.value,
        enabled: enabled.value,
        showLegacy: showLegacy.value,
        tceOptional: tceOptional.value,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
      // 存不了就算了（匯出匯入是之後的保險）
    }
  })

  return { groupId, enabled, enabledSet, showLegacy, tceOptional, state, applyGroup, toggleSource, visible, superseded }
})
