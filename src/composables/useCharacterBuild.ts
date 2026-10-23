/**
 * 目前角色的 build（擁有什麼）與 sheet（數值）。
 *
 * 兩者都是 computed：角色的任何選擇、書目設定或資料改變，Vue 會自動重算，
 * 元件只要讀 build.value / sheet.value 就好。
 */
import { computed } from 'vue'
import { buildCharacter } from '@/rules/build'
import { deriveSheet } from '@/rules/derive'
import { useCharacterStore } from '@/stores/character'
import { useRulesData } from './useRulesData'

export function useCharacterBuild() {
  const { data, ready } = useRulesData()
  const store = useCharacterStore()
  const build = computed(() => (ready.value && store.current ? buildCharacter(store.current, data.value) : undefined))
  const sheet = computed(() =>
    build.value && store.current ? deriveSheet(store.current, build.value, data.value) : undefined,
  )
  return { data, ready, store, build, sheet }
}
