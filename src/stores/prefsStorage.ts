/**
 * UI 偏好（篩選、排序、面板展開）的 localStorage 讀寫（M7-6 從 spellPrefs 抽出，tablePrefs 也用）。
 * 偏好不是角色資料：不進存檔、不會匯出；存不了（私密視窗、file:// 限制）就算了。
 */
import { watch, type Ref } from 'vue'

export function loadPrefs<T>(key: string): Record<string, T> {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as Record<string, T>) : {}
  } catch {
    return {}
  }
}

/** 內容有變就寫回 localStorage（deep watch）。 */
export function persistPrefs<T>(key: string, state: Ref<Record<string, T>>) {
  watch(
    state,
    (v) => {
      try {
        localStorage.setItem(key, JSON.stringify(v))
      } catch {
        // 存不了就算了：只是畫面偏好
      }
    },
    { deep: true },
  )
}
