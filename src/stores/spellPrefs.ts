/**
 * spellPrefs store：法術選擇畫面的 UI 偏好（M5-6）。
 *
 * 每個選擇欄位（以欄位 key 區分，例如 `class|法师|XPHB:spellbook`）各自記住篩選、排序、
 * 「顯示不符合的法術（反灰）」與篩選面板是否展開。這是「畫面偏好」，不是角色資料，
 * 所以存在 localStorage、不進角色存檔，也不會跟著匯出。
 *
 * 沒動過篩選的欄位不存篩選狀態，畫面用預設值（defaultFilterState）——這樣切換書目時，
 * 預設的「來源＝啟用的書目」會自動跟著變。
 */
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { DEFAULT_SORT, type SpellFilterState, type SpellSort } from '@/data/spellFilter'

export const SPELL_PREFS_KEY = 'dnd2024.spellPrefs'

export interface SlotPrefs {
  /** 沒有＝使用預設篩選 */
  filter?: SpellFilterState
  sort: SpellSort
  showBlocked: boolean
  panelOpen: boolean
}

function load(): Record<string, SlotPrefs> {
  try {
    const raw = localStorage.getItem(SPELL_PREFS_KEY)
    return raw ? (JSON.parse(raw) as Record<string, SlotPrefs>) : {}
  } catch {
    return {}
  }
}

const fresh = (): SlotPrefs => ({ sort: { ...DEFAULT_SORT }, showBlocked: false, panelOpen: false })

export const useSpellPrefsStore = defineStore('spellPrefs', () => {
  const bySlot = ref<Record<string, SlotPrefs>>(load())

  /** 某欄位的偏好（沒存過就回傳預設值；不會在讀取時寫入，所以可以放心在 computed 裡用）。 */
  function get(slotKey: string): SlotPrefs {
    return bySlot.value[slotKey] ?? fresh()
  }

  /** 改某欄位的部分偏好（例如 { sort }、{ filter }、{ panelOpen }）。 */
  function update(slotKey: string, patch: Partial<SlotPrefs>) {
    bySlot.value[slotKey] = { ...get(slotKey), ...patch }
  }

  /** 重設為預設（篩選、排序、反灰開關）；面板展開狀態保留。 */
  function reset(slotKey: string) {
    bySlot.value[slotKey] = { ...fresh(), panelOpen: get(slotKey).panelOpen }
  }

  watch(
    bySlot,
    (v) => {
      try {
        localStorage.setItem(SPELL_PREFS_KEY, JSON.stringify(v))
      } catch {
        // 存不了就算了：只是畫面偏好
      }
    },
    { deep: true },
  )

  return { bySlot, get, update, reset }
})
