import { describe, expect, it } from 'vitest'
import { buildCharacter } from '@/rules/build'
import { exportCharacter, importCharacter } from '@/rules/character'
import { deriveSheet } from '@/rules/derive'
import { benchmarkLevel, withStartingEquipment } from './benchmark'
import { hasRealData, realData } from './realData'

describe.skipIf(!hasRealData)('M2 完成標準：匯出再匯入結果完全相同', () => {
  it('12 級基準角色（含裝備、覆寫、筆記）', () => {
    const data = realData()
    const c = withStartingEquipment(benchmarkLevel(data, 12), data)
    c.overrides = { ac: 13 }
    c.notes = '測試筆記'
    c.details = { alignment: '中立善良' }
    const back = importCharacter(exportCharacter(c))
    expect(back).toEqual(c)
    const s1 = deriveSheet(c, buildCharacter(c, data), data)
    const s2 = deriveSheet(back, buildCharacter(back, data), data)
    expect(JSON.stringify(s2)).toBe(JSON.stringify(s1))
  })
})
