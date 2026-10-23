// M8-1：不可重複的專長（2024 規則；可重複的看資料的 repeatable 欄位）。
import { describe, expect, it } from 'vitest'
import { buildReviewModel } from '@/export/review'
import { buildCharacter, type ChoiceSlot } from '@/rules/build'
import { exportCharacter, importCharacter, newCharacter, type Character } from '@/rules/character'
import type { RulesData } from '@/rules/data'
import { deriveSheet } from '@/rules/derive'
import { hasRealData, realData } from './realData'

const FIGHTER = 'class|战士|XPHB'
const ACOLYTE = 'background|侍僧|XPHB'
const FEY = 'feat|妖精触碰|XPHB'
const MI = 'feat|魔法学徒|XPHB'
const asiKey = (lv: number) => `${FIGHTER}:${lv}:asi`

function fighter(levels = 6): Character {
  const c = newCharacter('2026-01-01T00:00:00.000Z')
  c.levels = Array.from({ length: levels }, () => ({ classId: FIGHTER, hp: { mode: 'average' as const } }))
  c.backgroundId = ACOLYTE
  c.raceId = 'race|人类|XPHB'
  c.baseScores = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 }
  return c
}

describe.skipIf(!hasRealData)('不可重複的專長（M8-1）', () => {
  const data = hasRealData ? realData() : (undefined as unknown as RulesData)
  const slot = (c: Character, key: string) => buildCharacter(c, data).slots.find((s) => s.key === key) as ChoiceSlot
  const opt = (c: Character, key: string, id: string) => slot(c, key).options.find((o) => o.value === id)!

  it('資料：可重複的專長標了 repeatable', () => {
    expect(data.get(MI)!.repeatable).toBe(true)
    expect(data.get('feat|属性值提升|XPHB')!.repeatable).toBe(true)
    expect(data.get(FEY)!.repeatable).toBeUndefined()
  })

  it('4 級選了妖精觸碰後，6 級的妖精觸碰不可選並附原因', () => {
    const c = fighter()
    expect(opt(c, asiKey(6), FEY).disabled).toBeUndefined()
    c.choices[asiKey(4)] = [FEY]
    const o = opt(c, asiKey(6), FEY)
    expect(o.disabled).toBe('已在战士 4 级選過，此專長不可重複')
    // 自己的欄位不受影響
    expect(opt(c, asiKey(4), FEY).disabled).toBeUndefined()
  })

  it('背景給的魔法學徒（可重複）在 4 級仍可再選，並標示「可重複」', () => {
    const c = fighter()
    const b = buildCharacter(c, data)
    expect(b.feats.some((f) => data.get(f.key.split('>').pop()!)?.versionOf === MI)).toBe(true)
    const o = opt(c, asiKey(4), MI)
    expect(o.disabled).toBeUndefined()
    expect(o.note).toContain('可重複')
    // 屬性值提升欄位依 XPHB 原文「或其他你满足条件的专长」，起源專長也在選項裡；戰鬥風格專長要有戰鬥風格特性
    expect(slot(c, asiKey(4)).options.some((x) => x.entry?.category === 'O')).toBe(true)
    expect(opt(c, asiKey(4), 'feat|箭术|XPHB').disabled).toBeUndefined()
    const w = fighter(4)
    w.levels = w.levels.map(() => ({ classId: 'class|法师|XPHB', hp: { mode: 'average' as const } }))
    expect(opt(w, 'class|法师|XPHB:4:asi', 'feat|箭术|XPHB').disabled).toContain('不符先決條件：特性：战斗风格')
  })

  it('改掉較早的選擇產生衝突：較晚的欄位標衝突、不清除選擇，審卡報告有警示', () => {
    const c = fighter(8)
    c.choices[asiKey(6)] = [FEY]
    c.choices[asiKey(4)] = [FEY] // 後來把 4 級也改成妖精觸碰
    const b = buildCharacter(c, data)
    const s4 = b.slots.find((s) => s.key === asiKey(4))!
    const s6 = b.slots.find((s) => s.key === asiKey(6))!
    expect(s4.selected).toEqual([FEY])
    expect(s4.conflicts).toBeUndefined()
    expect(s6.selected).toEqual([FEY])
    expect(s6.conflicts).toEqual(['衝突：「妖精触碰」已在战士 4 级取得，此專長不可重複'])
    expect(s6.warnings).toContain(s6.conflicts![0])
    expect(c.choices[asiKey(6)]).toEqual([FEY])

    const model = buildReviewModel({
      character: c,
      build: b,
      sheet: deriveSheet(c, b, data),
      data,
      spells: [],
      casting: [],
      attacks: [],
      effects: [],
      sources: [],
      filter: { enabled: ['XPHB'], showLegacy: false, tceOptional: false },
      appVersion: '0.0.0',
      exportedAt: new Date(2026, 9, 23),
    })
    const w = model.warnings.filter((x) => x.kind === '重複專長')
    expect(w).toHaveLength(1)
    expect(w[0]!.text).toContain('6 級')
  })

  it('舊存檔已有重複的不可重複專長：匯入後照樣標衝突，選擇與存檔版本不變', () => {
    const old = fighter(8)
    old.choices[asiKey(4)] = [FEY]
    old.choices[asiKey(6)] = [FEY]
    const json = exportCharacter(old)
    const c = importCharacter(json)
    expect(c.schemaVersion).toBe(old.schemaVersion)
    const b = buildCharacter(c, data)
    expect(b.slots.find((s) => s.key === asiKey(6))!.conflicts?.length).toBe(1)
    expect(b.slots.find((s) => s.key === asiKey(4))!.conflicts).toBeUndefined()
    expect(c.choices[asiKey(6)]).toEqual([FEY])
    expect(exportCharacter(c)).toBe(json)
  })
})
