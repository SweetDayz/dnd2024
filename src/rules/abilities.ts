/**
 * 六屬性、調整值、熟練加值、三種屬性值產生方式（純函式）。
 */
import type { Rng } from './dice.ts'
import { rollDice } from './dice.ts'

export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const
export type Ability = (typeof ABILITIES)[number]

/** 屬性中文（簡體，與資料一致）與英文名。 */
export const ABILITY_NAME: Record<Ability, { zh: string; en: string; abbr: string }> = {
  str: { zh: '力量', en: 'Strength', abbr: 'STR' },
  dex: { zh: '敏捷', en: 'Dexterity', abbr: 'DEX' },
  con: { zh: '体质', en: 'Constitution', abbr: 'CON' },
  int: { zh: '智力', en: 'Intelligence', abbr: 'INT' },
  wis: { zh: '感知', en: 'Wisdom', abbr: 'WIS' },
  cha: { zh: '魅力', en: 'Charisma', abbr: 'CHA' },
}

export const isAbility = (s: unknown): s is Ability => ABILITIES.includes(s as Ability)

export const abilityMod = (score: number) => Math.floor((score - 10) / 2)

/** 熟練加值：1–4 級 +2，之後每 4 級 +1。 */
export const proficiencyBonus = (level: number) => 2 + Math.floor((Math.max(1, level) - 1) / 4)

export const formatMod = (n: number) => (n >= 0 ? `+${n}` : `${n}`)

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const

/** 點數購買：每個分數的花費（8–15），總預算 27。 */
export const POINT_BUY_COST: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 }
export const POINT_BUY_BUDGET = 27

export function pointBuySpent(scores: Partial<Record<Ability, number | null>>): number {
  return ABILITIES.reduce((sum, a) => sum + (POINT_BUY_COST[scores[a] ?? 8] ?? 0), 0)
}

/**
 * 把屬性加值依序加到基礎值上，回傳最終值與每一筆實際生效的量。
 * 每筆加值有上限（一般 20，傳奇恩惠 30）：上限低的先加，超過上限的部分不生效。
 * derive.ts（角卡數值）與 abilityBreakdown（明細）共用，確保兩邊算法一致。
 */
export function applyAbilityBonuses(base: number, bonuses: readonly { amount: number; max: number }[]) {
  const order = bonuses.map((b, i) => ({ b, i })).sort((p, q) => p.b.max - q.b.max)
  const applied = bonuses.map(() => 0)
  let total = base
  for (const { b, i } of order) {
    if (total >= b.max) continue
    const next = Math.min(b.max, total + b.amount)
    applied[i] = next - total
    total = next
  }
  return { total, applied }
}

/** 4d6 去掉最低一顆。回傳四顆骰子與總和（去最低後）。 */
export function roll4d6DropLowest(rng?: Rng): { dice: number[]; total: number } {
  const dice = rollDice(4, 6, rng)
  const sorted = [...dice].sort((a, b) => a - b)
  return { dice, total: sorted[1]! + sorted[2]! + sorted[3]! }
}

/** 檢查標準陣列的分配：每個數字恰好用一次。 */
export function isValidStandardArray(scores: Partial<Record<Ability, number | null>>): boolean {
  const used = ABILITIES.map((a) => scores[a]).filter((v): v is number => typeof v === 'number')
  return [...used].sort((a, b) => a - b).join() === [...STANDARD_ARRAY].sort((a, b) => a - b).join()
}
