import { describe, expect, it } from 'vitest'
import {
  abilityMod,
  isValidStandardArray,
  pointBuySpent,
  proficiencyBonus,
  roll4d6DropLowest,
} from '@/rules/abilities'
import { fixedRng, parseDice, rollExpr } from '@/rules/dice'

describe('屬性與熟練加值', () => {
  it('調整值 = floor((分數-10)/2)', () => {
    expect([1, 8, 9, 10, 11, 15, 16, 20, 30].map(abilityMod)).toEqual([-5, -1, -1, 0, 0, 2, 3, 5, 10])
  })
  it('熟練加值依等級', () => {
    expect([1, 4, 5, 8, 9, 12, 13, 16, 17, 20].map(proficiencyBonus)).toEqual([2, 2, 3, 3, 4, 4, 5, 5, 6, 6])
  })
  it('點數購買花費', () => {
    expect(pointBuySpent({ str: 15, dex: 15, con: 15, int: 8, wis: 8, cha: 8 })).toBe(27)
    expect(pointBuySpent({ str: 14, dex: 13 })).toBe(12)
  })
  it('標準陣列每個數字用一次', () => {
    expect(isValidStandardArray({ str: 8, dex: 12, con: 14, int: 15, wis: 13, cha: 10 })).toBe(true)
    expect(isValidStandardArray({ str: 15, dex: 15, con: 14, int: 13, wis: 12, cha: 10 })).toBe(false)
  })
})

describe('擲骰', () => {
  it('4d6 去最低', () => {
    const r = roll4d6DropLowest(fixedRng(6, [1, 6, 3, 5]))
    expect(r.dice).toEqual([1, 6, 3, 5])
    expect(r.total).toBe(14)
  })
  it('解析並擲起始金幣「5d4 × 10」', () => {
    const e = parseDice('5d4 × 10')!
    expect(e).toEqual({ count: 5, faces: 4, bonus: 0, multiplier: 10 })
    expect(rollExpr(e, fixedRng(4, [1, 2, 3, 4, 4])).total).toBe(140)
    expect(parseDice('2d8+1')).toEqual({ count: 2, faces: 8, bonus: 1, multiplier: 1 })
    expect(parseDice('abc')).toBeUndefined()
  })
})
