import { describe, expect, it } from 'vitest'
import { buildCharacter } from '@/rules/build'
import { deriveSheet } from '@/rules/derive'
import { canMulticlass, multiclassRequirement, spellSlots } from '@/rules/multiclass'
import { benchmarkLevel, choose, WIZARD } from './benchmark'
import { hasRealData, realData } from './realData'

describe.skipIf(!hasRealData)('升級（真實資料）', () => {
  const data = realData()

  it('12 級：熟練 +4、HP 74、子職特性、屬性值提升未選', () => {
    const c = benchmarkLevel(data, 12)
    const b = buildCharacter(c, data)
    const s = deriveSheet(c, b, data)
    expect(s.profBonus).toBe(4)
    expect(s.hp.max).toBe(8 + 11 * (4 + 2))
    expect(b.classes[0]).toMatchObject({ level: 12 })
    expect(b.classes[0]!.subclass?.engName).toBe('Evoker')
    const names = b.features.map((f) => f.entry.name)
    expect(names).toEqual(expect.arrayContaining(['学者', '记忆法术', '法术塑形', '强效塑能']))
    expect(names).not.toContain('超限导能')
    const asi = b.slots.filter((x) => x.key.endsWith(':asi'))
    expect(asi.map((x) => x.origin.level)).toEqual([4, 8, 12])
    expect(asi.every((x) => x.selected.length === 0 && !x.done)).toBe(true)
    // 學者：從原文推斷出 1 項專精
    expect(b.slots.find((x) => x.key.includes('学者') && x.type === 'expertise')?.count).toBe(1)
    // 法術位：6 環 1 個
    expect(s.spellcasting.slots).toEqual([4, 3, 3, 3, 2, 1, 0, 0, 0])
  })

  it('20 級：熟練 +6、傳奇恩惠欄位、9 環法術位、選擇欄位 key 不重複', () => {
    const c = benchmarkLevel(data, 20)
    const b = buildCharacter(c, data)
    const s = deriveSheet(c, b, data)
    expect(s.profBonus).toBe(6)
    expect(s.hp.max).toBe(8 + 19 * 6)
    expect(s.saves.int.mod).toBe(9)
    expect(b.slots.some((x) => x.type === 'feat' && x.origin.level === 19 && x.label.includes('传奇恩惠'))).toBe(true)
    expect(s.spellcasting.slots).toEqual([4, 3, 3, 3, 3, 2, 2, 1, 1])
    const keys = b.slots.map((x) => x.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('選了屬性值提升專長，+2 會加上去，且上限 20', () => {
    const c = benchmarkLevel(data, 4)
    choose(c, data, (x) => x.key === `${WIZARD}:4:asi`, ['feat|属性值提升|XPHB'])
    choose(c, data, (x) => x.key.endsWith('属性值提升|XPHB:ability:alt'), ['0'])
    const b = choose(c, data, (x) => x.key.endsWith('属性值提升|XPHB:ability:c'), ['int'])
    expect(deriveSheet(c, b, data).abilities.int.score).toBe(18)
  })

  it('HP 擲骰：該級改用擲骰結果', () => {
    const c = benchmarkLevel(data, 2)
    c.levels[1]!.hp = { mode: 'roll', roll: 1 }
    expect(deriveSheet(c, buildCharacter(c, data), data).hp.max).toBe(8 + 3)
  })

  it('兼職：條件檢查、兼職熟練、施法者等級合併', () => {
    const fighter = data.get('class|战士|XPHB')!
    const wizard = data.get(WIZARD)!
    expect(multiclassRequirement(fighter)).toEqual([{ all: { str: 13 } }, { all: { dex: 13 } }])
    const scores = { str: 8, dex: 12, con: 14, int: 16, wis: 15, cha: 10 }
    expect(canMulticlass(fighter, [wizard], scores).ok).toBe(false)
    expect(canMulticlass(fighter, [wizard], { ...scores, dex: 13 }).ok).toBe(true)

    const c = benchmarkLevel(data, 5)
    c.levels.push({ classId: 'class|圣武士|XPHB', hp: { mode: 'average' } }, { classId: 'class|圣武士|XPHB', hp: { mode: 'average' } })
    const b = buildCharacter(c, data)
    // 兼職聖武士：只得到護甲與武器訓練，沒有豁免
    const pal = b.profs.filter((p) => p.origin.name.includes('兼职') || p.origin.name.includes('兼職'))
    expect(pal.map((p) => `${p.type}:${p.value}`)).toEqual(expect.arrayContaining(['armor:light', 'weapon:martial']))
    expect(pal.some((p) => p.type === 'save')).toBe(false)
    // 法師 5 + 聖武士 2（無條件進位 1）= 施法者等級 6
    const ss = spellSlots(b.classes)
    expect(ss).toMatchObject({ casterLevel: 6, multiclass: true })
    expect(ss.slots).toEqual([4, 3, 3, 0, 0, 0, 0, 0, 0])
  })

  it('魔契師的契約魔法另外計算', () => {
    const c = benchmarkLevel(data, 3)
    c.levels.push({ classId: 'class|魔契师|XPHB', hp: { mode: 'average' } }, { classId: 'class|魔契师|XPHB', hp: { mode: 'average' } })
    const ss = spellSlots(buildCharacter(c, data).classes)
    expect(ss.casterLevel).toBe(3)
    expect(ss.multiclass).toBe(false)
    expect(ss.pact).toMatchObject({ count: 2, level: 1 })
  })
})
