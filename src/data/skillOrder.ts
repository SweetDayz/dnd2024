/**
 * 角卡技能區的排列方式（UI 偏好，不是規則對照表）。純函式，不可 import Vue。
 *
 *   roll20   依英文名字母排序（Acrobatics → Survival），預設值
 *   fvtt     Foundry VTT 繁中版的順序（依中文筆畫）
 *   ability  比照官方 2024 角卡，技能列在所屬屬性底下
 */
import { ABILITIES, type Ability } from '../rules/abilities.ts'

export type SkillSortMode = 'roll20' | 'fvtt' | 'ability'

export const SKILL_SORT_LABEL: Record<SkillSortMode, string> = {
  roll20: 'Roll20（英文字母）',
  fvtt: 'FVTT（中文筆畫）',
  ability: '依屬性分組',
}

/**
 * FVTT 繁中版的技能順序（技能鍵）。
 * 前 13 項取自使用者提供的截圖：巧手、自然、求生、宗教、表演、威嚇、洞悉、特技、欺瞞、奧秘、運動、馴獸、察覺。
 * 後 5 項依首字筆畫推算（說 14、調 15、歷 16、隱 17、醫 18），待使用者確認（docs/data-notes.md 待決事項）。
 */
export const FVTT_SKILL_ORDER: readonly string[] = [
  'sleight of hand',
  'nature',
  'survival',
  'religion',
  'performance',
  'intimidation',
  'insight',
  'acrobatics',
  'deception',
  'arcana',
  'athletics',
  'animal handling',
  'perception',
  'persuasion',
  'investigation',
  'history',
  'stealth',
  'medicine',
]

interface SkillLike {
  key: string
  engName: string
  ability: Ability
}

/** 依模式排序；ability 模式回傳依屬性分組（組內依英文名）。 */
export function sortSkills<T extends SkillLike>(skills: readonly T[], mode: SkillSortMode): { ability?: Ability; skills: T[] }[] {
  const byEng = [...skills].sort((a, b) => a.engName.localeCompare(b.engName))
  if (mode === 'roll20') return [{ skills: byEng }]
  if (mode === 'fvtt') {
    const rank = (k: string) => {
      const i = FVTT_SKILL_ORDER.indexOf(k)
      return i < 0 ? FVTT_SKILL_ORDER.length : i
    }
    return [{ skills: [...byEng].sort((a, b) => rank(a.key) - rank(b.key)) }]
  }
  return ABILITIES.map((ability) => ({ ability, skills: byEng.filter((s) => s.ability === ability) })).filter(
    (g) => g.skills.length,
  )
}
