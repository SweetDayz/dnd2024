/**
 * character store：角色清單、目前編輯中的角色，以及存檔（localStorage）與 JSON 匯出匯入。
 *
 * 角色物件只存「選擇」（見 src/rules/character.ts），數值由規則引擎即時算，
 * 所以這裡只負責保存與修改選擇，不做任何計算。
 */
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import {
  exportCharacter,
  importCharacter,
  migrate,
  newCharacter,
  newId,
  type Character,
  type RollRecord,
} from '@/rules/character'

export const CHARACTERS_KEY = 'dnd2024.characters'
export const CURRENT_KEY = 'dnd2024.currentCharacter'

function loadAll(): Character[] {
  try {
    const raw = localStorage.getItem(CHARACTERS_KEY)
    const list = raw ? (JSON.parse(raw) as Record<string, unknown>[]) : []
    return Array.isArray(list) ? list.map(migrate) : []
  } catch {
    // file:// 下某些瀏覽器不給用 localStorage；這時只能靠匯出匯入保存
    return []
  }
}

export const useCharacterStore = defineStore('character', () => {
  const characters = ref<Character[]>(loadAll())
  const currentId = ref<string | null>(readCurrent())
  const storageOk = ref(true)

  function readCurrent(): string | null {
    try {
      return localStorage.getItem(CURRENT_KEY)
    } catch {
      return null
    }
  }

  const current = computed<Character | undefined>(() => characters.value.find((c) => c.id === currentId.value))

  function touch(c: Character) {
    c.updatedAt = new Date().toISOString()
  }

  function create(): Character {
    const c = newCharacter()
    characters.value.push(c)
    currentId.value = c.id
    return characters.value[characters.value.length - 1]!
  }

  function select(id: string) {
    currentId.value = id
  }

  function remove(id: string) {
    characters.value = characters.value.filter((c) => c.id !== id)
    if (currentId.value === id) currentId.value = characters.value[0]?.id ?? null
  }

  /** 修改目前角色。所有修改都經過這裡，方便統一更新時間。 */
  function update(fn: (c: Character) => void) {
    const c = current.value
    if (!c) return
    fn(c)
    touch(c)
  }

  function setChoice(key: string, values: string[]) {
    update((c) => {
      if (values.length) c.choices[key] = values
      else delete c.choices[key]
    })
  }

  function logRoll(r: Omit<RollRecord, 'at'>) {
    update((c) => c.rollLog.push({ ...r, at: new Date().toISOString() }))
  }

  function exportCurrent(): string | undefined {
    return current.value ? exportCharacter(current.value) : undefined
  }

  /**
   * 匯入 JSON。同 id 的角色已存在時：replace=true 就覆蓋（結果與匯出時完全相同），否則另存一份新 id。
   * 格式錯誤會丟 ImportError。
   */
  function importJson(json: string, replace: boolean): Character {
    const c = importCharacter(json)
    const i = characters.value.findIndex((x) => x.id === c.id)
    if (i >= 0 && replace) characters.value.splice(i, 1, c)
    else {
      if (i >= 0) c.id = newId()
      characters.value.push(c)
    }
    currentId.value = c.id
    return c
  }

  const hasId = (id: string) => characters.value.some((c) => c.id === id)

  watch(
    characters,
    (list) => {
      try {
        localStorage.setItem(CHARACTERS_KEY, JSON.stringify(list))
        storageOk.value = true
      } catch {
        storageOk.value = false
      }
    },
    { deep: true },
  )
  watch(currentId, (id) => {
    try {
      if (id) localStorage.setItem(CURRENT_KEY, id)
      else localStorage.removeItem(CURRENT_KEY)
    } catch {
      // 同上
    }
  })

  return {
    characters,
    currentId,
    current,
    storageOk,
    create,
    select,
    remove,
    update,
    setChoice,
    logRoll,
    exportCurrent,
    importJson,
    hasId,
  }
})
