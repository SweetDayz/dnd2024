/**
 * 基準角色：岩地侏儒、侍僧背景、塑能師法師（docs/ref/ddb-screens.md）。
 * 依序做選擇：每做一個選擇就重新 build，因為選擇會產生新的選擇欄位。
 */
import { buildCharacter, type Build, type ChoiceSlot } from '@/rules/build'
import { newCharacter, type Character } from '@/rules/character'
import type { RulesData } from '@/rules/data'
import { startingInventory } from '@/rules/equipment'

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
  // 法師法術（同 DDB）：戲法光亮術、法師之手、冷凍射線；法術書 6 道，準備 4 道
  choose(c, data, byKey(`${WIZARD}:cantrips`), ['spell|光亮术|XPHB', 'spell|法师之手|XPHB', 'spell|冷冻射线|XPHB'])
  choose(c, data, byKey(`${WIZARD}:spellbook`), SPELLBOOK)
  choose(c, data, byKey(`${WIZARD}:prepared`), PREPARED)
  return c
}

export const SPELLBOOK = ['侦测魔法', '法师护甲', '魔法飞弹', '睡眠术', '雷鸣波', '护盾术'].map((n) => `spell|${n}|XPHB`)
export const PREPARED = ['法师护甲', '魔法飞弹', '睡眠术', '雷鸣波'].map((n) => `spell|${n}|XPHB`)

export const EVOKER = 'subclass|塑能师|XPHB|法师|XPHB'

/** 基準角色升到 n 級（全部升法師、HP 取平均、選塑能師；屬性值提升與傳奇恩惠維持未選，同 DDB）。 */
export function benchmarkLevel(data: RulesData, n: number): Character {
  const c = benchmarkLevel1(data)
  while (c.levels.length < n) c.levels.push({ classId: WIZARD, hp: { mode: 'average' } })
  if (n >= 3) {
    choose(c, data, byKey(`${WIZARD}:subclass`), [EVOKER])
    // 塑能學者：燃燒之手、魔法飛彈（同 DDB）
    choose(c, data, byKey(`${EVOKER}:spells:0`), ['spell|燃烧之手|XPHB'])
    choose(c, data, byKey(`${EVOKER}:spells:1`), ['spell|魔法飞弹|XPHB'])
  }
  return c
}

/** 套用起始裝備：法師 A、侍僧 A（同 DDB）。 */
export function withStartingEquipment(c: Character, data: RulesData): Character {
  const { items, currency } = startingInventory(data, [
    { entry: data.get(WIZARD)!, picks: { 0: 'A' } },
    { entry: data.get(ACOLYTE)!, picks: { 0: 'A' } },
  ])
  c.inventory = items
  c.currency = currency
  c.choices[`${WIZARD}:equip:0`] = ['A']
  c.choices[`${ACOLYTE}:equip:0`] = ['A']
  return c
}
