import { describe, expect, it } from 'vitest'
import { classLevels, exportCharacter, importCharacter, ImportError, newCharacter, SCHEMA_VERSION } from '@/rules/character'

describe('角色存檔', () => {
  it('匯出再匯入完全相同', () => {
    const c = newCharacter('2026-01-01T00:00:00.000Z')
    c.name = '測試'
    c.levels = [{ classId: 'class|法师|XPHB', hp: { mode: 'average' } }]
    c.choices = { 'base:languages': ['dwarvish', 'elvish'] }
    c.baseScores.int = 15
    expect(importCharacter(exportCharacter(c))).toEqual(c)
  })
  it('補齊舊存檔缺少的欄位', () => {
    const c = importCharacter(JSON.stringify({ levels: [], choices: {}, baseScores: { str: 10 } }))
    expect(c.schemaVersion).toBe(SCHEMA_VERSION)
    expect(c.baseScores).toMatchObject({ str: 10, dex: null })
    expect(c.currency.gp).toBe(0)
  })
  it('拒絕壞檔與未來版本', () => {
    expect(() => importCharacter('{')).toThrow(ImportError)
    expect(() => importCharacter('{"a":1}')).toThrow(ImportError)
    expect(() => importCharacter(JSON.stringify({ schemaVersion: 999, levels: [], choices: {} }))).toThrow(/比本程式/)
  })
  it('各職業等級', () => {
    const lv = (classId: string) => ({ classId, hp: { mode: 'average' as const } })
    expect([...classLevels({ levels: [lv('a'), lv('a'), lv('b'), lv('a')] })]).toEqual([
      ['a', 3],
      ['b', 1],
    ])
  })
})
