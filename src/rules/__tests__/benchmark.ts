/**
 * 基準角色：岩地侏儒、侍僧背景、塑能師法師（docs/ref/ddb-screens.md）。
 * 依序做選擇：每做一個選擇就重新 build，因為選擇會產生新的選擇欄位。
 */
import { buildCharacter, type Build, type ChoiceSlot } from '@/rules/build'
import { newCharacter, type Character } from '@/rules/character'
import type { RulesData } from '@/rules/data'

export function choose(c: Character, data: RulesData, match: (s: ChoiceSlot) => boolean, values: string[]): Build {
  const b = buildCharacter(c, data)
  const slot = b.slots.find(match)
  if (!slot) throw new Error(`找不到選擇欄位；現有：\n${b.slots.map((s) => `${s.key}｜${s.label}`).join('\n')}`)
  for (const v of values) {
    if (v && !slot.options.some((o) => o.value === v)) throw new Error(`欄位 ${slot.key} 沒有選項 ${v}`)
  }
  c.choices[slot.key] = values
  return buildCharacter(c, data)
}

const byKey = (suffix: string) => (s: ChoiceSlot) => s.key.endsWith(suffix)

export const WIZARD = 'class|法师|XPHB'
export const GNOME = 'race|侏儒|XPHB'
export const ROCK_GNOME = 'race|侏儒；岩侏儒血系|XPHB'
export const ACOLYTE = 'background|侍僧|XPHB'

/** 1 級基準角色（標準陣列：力 8、敏 12、體 14、智 15、感 13、魅 10；侍僧感知 +2、智力 +1）。 */
export function benchmarkLevel1(data: RulesData): Character {
  const c = newCharacter('2026-01-01T00:00:00.000Z')
  c.name = '基準侏儒法師'
  c.levels = [{ classId: WIZARD, hp: { mode: 'average' } }]
  c.raceId = GNOME
  c.backgroundId = ACOLYTE
  c.abilityMethod = 'standard'
  c.baseScores = { str: 8, dex: 12, con: 14, int: 15, wis: 13, cha: 10 }
  choose(c, data, byKey(`${WIZARD}:skill:0`), ['arcana', 'investigation'])
  choose(c, data, byKey(`${ACOLYTE}:ability:alt`), ['0'])
  choose(c, data, byKey(`${ACOLYTE}:ability:w`), ['wis', 'int'])
  choose(c, data, byKey(`${GNOME}:version`), [ROCK_GNOME])
  choose(c, data, byKey(`${GNOME}:spells:ability`), ['int'])
  choose(c, data, byKey('base:languages'), ['dwarvish', 'gnomish'])
  const mi = (s: ChoiceSlot) => s.origin.type === 'feat' && s.origin.name.startsWith('魔法学徒')
  choose(c, data, (s) => mi(s) && s.key.endsWith(':spells:ability'), ['wis'])
  choose(c, data, (s) => mi(s) && s.type === 'spell' && s.count === 2, ['spell|神导术|XPHB', 'spell|修复术|XPHB'])
  choose(c, data, (s) => mi(s) && s.type === 'spell' && s.count === 1, ['spell|光导箭|XPHB'])
  return c
}
