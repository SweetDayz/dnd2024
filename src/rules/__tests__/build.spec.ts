import { describe, expect, it } from 'vitest'
import { buildCharacter, pendingSlots } from '@/rules/build'
import { deriveSheet } from '@/rules/derive'
import { ACOLYTE, benchmarkLevel1, WIZARD } from './benchmark'
import { hasRealData, realData } from './realData'

describe.skipIf(!hasRealData)('基準角色 1 級（真實資料）', () => {
  const data = realData()
  const c = benchmarkLevel1(data)
  const b = buildCharacter(c, data)
  const s = deriveSheet(c, b, data)

  it('所有選擇都已完成、沒有警告', () => {
    const pending = pendingSlots(b).filter((x) => x.step !== 'equipment')
    expect(pending.map((x) => `${x.key}｜${x.label}｜${x.warnings.join()}`)).toEqual([])
  })

  it('屬性：背景 +2 感知 +1 智力', () => {
    expect(Object.fromEntries(Object.values(s.abilities).map((a) => [a.ability, a.score]))).toEqual({
      str: 8,
      dex: 12,
      con: 14,
      int: 16,
      wis: 15,
      cha: 10,
    })
  })

  it('熟練加值、豁免、技能', () => {
    expect(s.profBonus).toBe(2)
    expect(s.saves.int).toMatchObject({ proficient: true, mod: 5 })
    expect(s.saves.wis).toMatchObject({ proficient: true, mod: 4 })
    expect(s.saves.dex).toMatchObject({ proficient: false, mod: 1 })
    const sk = Object.fromEntries(s.skills.map((x) => [x.key, x.mod]))
    expect(sk).toMatchObject({ arcana: 5, investigation: 5, insight: 4, religion: 5, perception: 2, stealth: 1 })
  })

  it('先攻、被動感知、HP、速度、黑暗視覺、體型', () => {
    expect(s.initiative).toBe(1)
    expect(s.passive.perception).toBe(12)
    expect(s.hp.max).toBe(8)
    expect(s.speeds.find((x) => x.mode === 'walk')?.value).toBe(30)
    expect(s.senses.find((x) => x.type === 'darkvision')?.range).toBe(60)
    expect(b.size?.value).toBe('S')
  })

  it('語言與工具', () => {
    expect(s.profs.language.map((l) => l.value).sort()).toEqual(['common', 'dwarvish', 'gnomish'])
    expect(s.profs.tool.map((l) => l.value)).toEqual(["calligrapher's supplies"])
  })

  it('起源專長魔法學徒（牧師）與種族法術', () => {
    expect(b.feats.map((f) => f.entry.id)).toEqual(['feat|魔法学徒；牧师|XPHB'])
    const spells = b.spells.map((g) => `${g.spellId}:${g.ability}:${g.kind}`)
    expect(spells).toEqual(
      expect.arrayContaining([
        'spell|修复术|XPHB:int:cantrip',
        'spell|魔法伎俩|XPHB:int:cantrip',
        'spell|神导术|XPHB:wis:cantrip',
        'spell|修复术|XPHB:wis:cantrip',
        'spell|光导箭|XPHB:wis:innate',
      ]),
    )
  })

  it('特性：職業、種族特質、背景、專長都有，且附來源', () => {
    const names = b.features.map((f) => `${f.category}:${f.entry.name}`)
    expect(names).toEqual(expect.arrayContaining(['class:施法', 'race:侏儒狡黠', `background:侍僧`, 'feat:魔法学徒；牧师']))
    for (const f of b.features) expect(f.entry.source).toBeTruthy()
  })

  it('背景重複的技能會提示改選', () => {
    const c2 = structuredClone(c)
    c2.choices[`${WIZARD}:skill:0`] = ['arcana', 'insight']
    const b2 = buildCharacter(c2, data)
    const slot = b2.slots.find((x) => x.key === `${WIZARD}:skill:0`)!
    expect(slot.warnings.join()).toMatch(/洞悉.*已由 侍僧 提供/)
    expect(b2.slots.find((x) => x.key === `${ACOLYTE}:skill:0`)).toBeUndefined()
  })
})
