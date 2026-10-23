// M7-4 第二驗收角色：法師 3／牧師 2（起始職業法師、標準陣列），以及契約魔法（魔契師 2／術士 3）。
import { describe, expect, it } from 'vitest'
import { ABILITIES, type Ability } from '@/rules/abilities'
import { buildCharacter } from '@/rules/build'
import { newCharacter, type Character } from '@/rules/character'
import type { RulesData } from '@/rules/data'
import { deriveSheet } from '@/rules/derive'
import { canMulticlass, spellSlots } from '@/rules/multiclass'
import { classCastings, spellcastingStats } from '@/rules/spells'
import { hasRealData, realData } from './realData'

const WIZARD = 'class|法师|XPHB'
const CLERIC = 'class|牧师|XPHB'
const WARLOCK = 'class|魔契师|XPHB'
const SORCERER = 'class|术士|XPHB'

/** 標準陣列：力 8、敏 12、體 14、智 15、感 13、魅 10（智力、感知都 ≥ 13） */
export const MC_SCORES = { str: 8, dex: 12, con: 14, int: 15, wis: 13, cha: 10 }

export function wizard3cleric2(): Character {
  const c = newCharacter('2026-01-01T00:00:00.000Z')
  c.name = '兼職法師牧師'
  c.abilityMethod = 'standard'
  c.baseScores = { ...MC_SCORES }
  c.levels = [WIZARD, WIZARD, WIZARD, CLERIC, CLERIC].map((classId) => ({ classId, hp: { mode: 'average' as const } }))
  return c
}

describe.skipIf(!hasRealData)('兼職（M7-4）', () => {
  const data = hasRealData ? realData() : (undefined as unknown as RulesData)

  it('法師 3／牧師 2：等級、熟練加值、施法者等級與法術位、HP', () => {
    const c = wizard3cleric2()
    const b = buildCharacter(c, data)
    const s = deriveSheet(c, b, data)
    expect(b.classes.map((x) => [x.entry.id, x.level])).toEqual([
      [WIZARD, 3],
      [CLERIC, 2],
    ])
    expect(s.level).toBe(5)
    expect(s.profBonus).toBe(3)
    expect(s.spellcasting).toMatchObject({ casterLevel: 5, multiclass: true })
    expect(s.spellcasting.slots.slice(0, 3)).toEqual([4, 3, 2])
    // 6（法師 1 級滿值）＋ 4×2（法師 2、3 級平均）＋ 5×2（牧師平均）＋ 5×體質 +2
    expect(s.hp.max).toBe(6 + 4 * 2 + 5 * 2 + 5 * 2)
  })

  it('兼職牧師的熟練依 multiclassing 欄位，不給豁免', () => {
    const b = buildCharacter(wizard3cleric2(), data)
    const gained = (data.get(CLERIC)!.multiclassing as { proficienciesGained?: { armor?: string[] } }).proficienciesGained
    expect(gained?.armor?.length).toBeGreaterThan(0)
    const mc = b.profs.filter((p) => p.origin.name.includes('兼職'))
    expect(mc.filter((p) => p.type === 'armor').map((p) => p.value).sort()).toEqual([...gained!.armor!].map((a) => a.toLowerCase()).sort())
    expect(mc.some((p) => p.type === 'save')).toBe(false)
    // 豁免只有起始職業法師的智力、感知
    expect(b.profs.filter((p) => p.type === 'save').map((p) => p.value).sort()).toEqual(['int', 'wis'])
  })

  it('戲法與準備法術數各自依職業表；DC 與攻擊分別用智力、感知', () => {
    const c = wizard3cleric2()
    const b = buildCharacter(c, data)
    const s = deriveSheet(c, b, data)
    const mods = Object.fromEntries(ABILITIES.map((a) => [a, s.abilities[a].mod])) as Record<Ability, number>
    const casts = classCastings(b.classes, mods, data)
    const wiz = casts.find((x) => x.from.id === WIZARD)!
    const clr = casts.find((x) => x.from.id === CLERIC)!
    // XPHB 職業表：法師 3 級 戲法 3、準備 6；牧師 2 級 戲法 3、準備 5
    expect([wiz.cantrips, wiz.prepared]).toEqual([3, 6])
    expect([clr.cantrips, clr.prepared]).toEqual([3, 5])
    expect(wiz.maxSpellLevel).toBe(2)
    expect(clr.maxSpellLevel).toBe(1)
    const stats = spellcastingStats(casts, mods, s.profBonus)
    expect(stats.find((x) => x.casting === wiz)).toMatchObject({ ability: 'int', dc: 8 + 3 + 2, attack: 3 + 2 })
    expect(stats.find((x) => x.casting === clr)).toMatchObject({ ability: 'wis', dc: 8 + 3 + 1, attack: 3 + 1 })
  })

  it('前置條件：感知 12 時不能兼職牧師，並說明原因', () => {
    const wizard = data.get(WIZARD)!
    const cleric = data.get(CLERIC)!
    expect(canMulticlass(cleric, [wizard], MC_SCORES).ok).toBe(true)
    const r = canMulticlass(cleric, [wizard], { ...MC_SCORES, wis: 12 })
    expect(r.ok).toBe(false)
    expect(r.reasons.join()).toContain('感知 13+（目前 12 ✗）')
  })

  it('契約魔法：魔契師 2／術士 3 → 契約 1 環 ×2，一般法術位 4/2，分開計算', () => {
    const c = newCharacter('2026-01-01T00:00:00.000Z')
    c.baseScores = { str: 8, dex: 12, con: 14, int: 10, wis: 13, cha: 15 }
    c.levels = [WARLOCK, WARLOCK, SORCERER, SORCERER, SORCERER].map((classId) => ({ classId, hp: { mode: 'average' as const } }))
    const ss = spellSlots(buildCharacter(c, data).classes)
    expect(ss.pact).toMatchObject({ count: 2, level: 1 })
    expect(ss.casterLevel).toBe(3)
    expect(ss.slots.slice(0, 3)).toEqual([4, 2, 0])
  })
})
