/**
 * 目前角色的 build（擁有什麼）與 sheet（數值）。
 *
 * 兩者都是 computed：角色的任何選擇、書目設定或資料改變，Vue 會自動重算，
 * 元件只要讀 build.value / sheet.value 就好。
 */
import { computed } from 'vue'
import { buildCharacter } from '@/rules/build'
import { ABILITIES, type Ability } from '@/rules/abilities'
import { deriveSheet } from '@/rules/derive'
import { classCastings, spellcastingStats, spellRows } from '@/rules/spells'
import { useCharacterStore } from '@/stores/character'
import { useRulesData } from './useRulesData'

export function useCharacterBuild() {
  const { data, ready } = useRulesData()
  const store = useCharacterStore()
  const build = computed(() => (ready.value && store.current ? buildCharacter(store.current, data.value) : undefined))
  const sheet = computed(() =>
    build.value && store.current ? deriveSheet(store.current, build.value, data.value) : undefined,
  )
  const mods = computed(
    () => Object.fromEntries(ABILITIES.map((a) => [a, sheet.value?.abilities[a].mod ?? 0])) as Record<Ability, number>,
  )
  /** 法術列（含命中／DC、傷害、次數） */
  const spells = computed(() =>
    build.value && sheet.value ? spellRows(build.value, data.value, mods.value, sheet.value.profBonus, sheet.value.level) : [],
  )
  /** 各施法職業的法術 DC、攻擊加值 */
  const casting = computed(() =>
    build.value && sheet.value ? spellcastingStats(classCastings(build.value.classes, mods.value), mods.value, sheet.value.profBonus) : [],
  )
  return { data, ready, store, build, sheet, spells, casting }
}
