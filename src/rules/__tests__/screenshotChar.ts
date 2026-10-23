/**
 * M9 截圖角色：法師 6（死灵师 AU）／奇械師 4（EFA），人類＋起源專長魔宠密友，賢者背景。
 * 施法者等級 8（法師 6 ＋ 奇械師 4÷2 進位），法術位 4/3/3/2。
 */
import type { ChoiceSlot } from '@/rules/build'
import { newCharacter, type Character } from '@/rules/character'
import type { RulesData } from '@/rules/data'
import { choose } from './benchmark'

export const ARTIFICER = 'class|奇械师|EFA'
export const NECROMANCER = 'subclass|死灵师|AU|法师|XPHB'
export const FAMILIAR_FRIEND = 'feat|魔宠密友|AU'
export const FIND_FAMILIAR = 'spell|寻获魔宠|XPHB'
const WIZ = 'class|法师|XPHB'

const byKey = (suffix: string) => (s: ChoiceSlot) => s.key.endsWith(suffix)

export function screenshotCharacter(data: RulesData): Character {
  const c = newCharacter('2026-01-01T00:00:00.000Z')
  c.name = 'M9 截圖角色'
  c.levels = [
    ...[...Array(6)].map(() => ({ classId: WIZ, hp: { mode: 'average' as const } })),
    ...[...Array(4)].map(() => ({ classId: ARTIFICER, hp: { mode: 'average' as const } })),
  ]
  c.raceId = 'race|人类|XPHB'
  c.backgroundId = 'background|贤者|XPHB'
  c.baseScores = { str: 8, dex: 14, con: 13, int: 15, wis: 12, cha: 10 }
  choose(c, data, byKey(`${WIZ}:subclass`), [NECROMANCER])
  choose(c, data, byKey(`${ARTIFICER}:subclass`), ['subclass|炼金师|EFA|奇械师|EFA'])
  choose(c, data, byKey('race|人类|XPHB:feat:0'), [FAMILIAR_FRIEND])
  choose(c, data, (s) => s.origin.type === 'feat' && s.key.endsWith(':spells:ability'), ['int'])
  return c
}
