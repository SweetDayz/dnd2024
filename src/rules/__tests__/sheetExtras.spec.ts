import { describe, expect, it } from 'vitest'
import { fixedRng } from '@/rules/dice'
import { inchesToText, rollHeightWeight, traitTables, withOverride } from '@/rules/sheetExtras'
import { hasRealData, realData } from './realData'

describe('角卡輔助', () => {
  it('手動覆寫', () => {
    expect(withOverride({ ac: 15 }, 'ac', 11)).toEqual({ value: 15, computed: 11, overridden: true })
    expect(withOverride({}, 'ac', 11)).toEqual({ value: 11, computed: 11, overridden: false })
  })
  it('身高體重：基礎＋身高骰；體重＝基礎＋身高骰×體重骰', () => {
    const r = rollHeightWeight({ baseHeight: 56, heightMod: '2d10', baseWeight: 110, weightMod: '2d4' }, fixedRng(10, [3, 4, 2, 2]))
    expect(r.height).toBe(63)
    expect(r.weight).toBe(110 + 7 * 2)
    expect(inchesToText(63)).toBe('5 呎 3 吋')
  })
})

describe.skipIf(!hasRealData)('個性懶人表（真實資料）', () => {
  it('2014 侍僧有四張表，2024 侍僧沒有', () => {
    const data = realData()
    expect(traitTables(data.get('background|侍僧|PHB')).map((t) => [t.field, t.faces, t.rows.length])).toEqual([
      ['personality', 8, 8],
      ['ideals', 6, 6],
      ['bonds', 6, 6],
      ['flaws', 6, 6],
    ])
    expect(traitTables(data.get('background|侍僧|XPHB'))).toEqual([])
  })
})
