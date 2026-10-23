/**
 * tablePrefs store：語言、物品等通用表格的 UI 偏好（M7-6）。存法比照 M5 的 spellPrefs：
 * 每個表格（以 id 區分，例如 `browser:language`、`builder:base:languages`）各自記住篩選、排序、面板是否展開，
 * 存在 localStorage，不進角色存檔。
 *
 * 沒動過篩選的表格不存篩選狀態，畫面用預設值——切換書目時，預設的「來源＝啟用的書目」會自動跟著變。
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { FilterState, SortState } from '@/data/facetFilter'
import { loadPrefs, persistPrefs } from './prefsStorage'

export const TABLE_PREFS_KEY = 'dnd2024.tablePrefs'

export interface TablePrefs {
  /** 沒有＝使用預設篩選 */
  filter?: FilterState
  /** 沒有＝使用表格的預設排序 */
  sort?: SortState
  panelOpen: boolean
  /** 範圍篩選（物品的價值、重量）：群組 id → [下限, 上限]，null＝不限 */
  ranges?: Record<string, [number | null, number | null]>
}

export const useTablePrefsStore = defineStore('tablePrefs', () => {
  const byTable = ref<Record<string, TablePrefs>>(loadPrefs<TablePrefs>(TABLE_PREFS_KEY))

  /** 某表格的偏好（沒存過就回傳預設值；讀取時不寫入，可以放心在 computed 裡用）。 */
  function get(id: string): TablePrefs {
    return byTable.value[id] ?? { panelOpen: false }
  }

  function update(id: string, patch: Partial<TablePrefs>) {
    byTable.value[id] = { ...get(id), ...patch }
  }

  /** 重設篩選與排序；面板展開狀態保留。 */
  function reset(id: string) {
    byTable.value[id] = { panelOpen: get(id).panelOpen }
  }

  persistPrefs(TABLE_PREFS_KEY, byTable)

  return { byTable, get, update, reset }
})
