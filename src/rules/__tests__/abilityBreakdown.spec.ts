import { describe, expect, it } from 'vitest'
import { abilityBreakdown, previewBonus } from '@/rules/abilityBreakdown'
import { applyAbilityBonuses } from '@/rules/abilities'
import { buildCharacter, type AbilityGrant, type Build, type ChoiceSlot, type Origin } from '@/rules/build'
import { emptyScores } from '@/rules/character'
import { abilityScores } from '@/rules/derive'
import { ACOLYTE, benchmarkLevel, benchmarkLevel1 } from './benchmark'
import { hasRealData, realData } from './realData'

const bg: Origin = { type: 'background', name: '侍僧', level: 1 }
const grant = (ability: AbilityGrant['ability'], amount: number, max = 20, origin = bg): AbilityGrant => ({ ability, amount, origin, max })
const build = (abilityBonuses: AbilityGrant[], slots: ChoiceSlot[] = []): Pick<Build, 'abilityBonuses' | 'slots'> => ({ abilityBonuses, slots })

describe('applyAbilityBonuses', () => {
  it('上限低的先加，超過上限的不生效', () => {
    expect(applyAbilityBonuses(19, [{ amount: 2, max: 30 }, { amount: 2, max: 20 }])).toEqual({ total: 22, applied: [2, 1] })
  })
})

describe('abilityBreakdown', () => {
  it('明細文字、產生方式、來源', () => {
    const c = { abilityMethod: 'standard' as const, baseScores: { str: 8, dex: 12, con: 14, int: 15, wis: 13, cha: 10 } }
    const r = abilityBreakdown(c, build([grant('wis', 2), grant('int', 1)]))
    expect(r.abilities.wis).toMatchObject({ base: 13, computed: 15, score: 15, mod: 2, warnings: [] })
    expect(r.abilities.wis.text).toBe('13（標準陣列）＋2 背景：侍僧 = 15')
    expect(r.abilities.str.text).toBe('8（標準陣列） = 8')
    expect(r.warnings).toEqual([])
  })

  it('超過上限只生效一部分並警示；手動覆寫標示', () => {
    const c = { abilityMethod: 'roll' as const, baseScores: { ...emptyScores(), str: 19 }, overrides: { 'ability:dex': 18 } }
    const r = abilityBreakdown(c, build([grant('str', 2)]))
    expect(r.abilities.str.score).toBe(20)
    expect(r.abilities.str.bonuses[0]).toMatchObject({ amount: 2, applied: 1 })
    expect(r.abilities.str.warnings[0]).toContain('超過上限 20')
    expect(r.abilities.str.text).toBe('19（4d6）＋1（原 +2） 背景：侍僧 = 20')
    expect(r.abilities.dex).toMatchObject({ override: 18, score: 18, mod: 4 })
    expect(r.abilities.dex.warnings).toContain('已手動覆寫（自動計算為 10）')
    expect(r.abilities.con.warnings).toContain('尚未分配基礎值（暫以 10 計算）')
  })

  it('2014 相容與 ASI 的來源文字', () => {
    const asi: Origin = { type: 'feat', name: '属性值提升', level: 4, entry: { engName: 'Ability Score Improvement' } as never }
    const old = { ...bg, compat: true }
    const c = { abilityMethod: 'standard' as const, baseScores: { ...emptyScores(), int: 15 } }
    const r = abilityBreakdown(c, build([grant('int', 2, 20, asi), grant('int', 1, 20, old)]))
    expect(r.abilities.int.bonuses.map((x) => x.source)).toEqual(['屬性值提升（ASI）', '背景：侍僧（2014 相容）'])
  })

  it('點數購買超支、標準陣列重複', () => {
    const pb = abilityBreakdown({ abilityMethod: 'pointbuy', baseScores: { str: 15, dex: 15, con: 15, int: 15, wis: 8, cha: 8 } }, build([]))
    expect(pb.warnings).toContain('點數購買超支：36／27')
    const sa = abilityBreakdown({ abilityMethod: 'standard', baseScores: { str: 15, dex: 15, con: 13, int: 12, wis: 10, cha: 8 } }, build([]))
    expect(sa.warnings[0]).toContain('標準陣列')
  })

  it('尚未分配的加值', () => {
    const slot = (key: string, type: ChoiceSlot['type'], weights: number[], selected: string[]): ChoiceSlot => ({
      key, type, label: 'x', origin: bg, step: 'background', count: weights.length, weights, options: [], selected, done: false, warnings: [],
    })
    const r = abilityBreakdown(
      { abilityMethod: 'standard', baseScores: emptyScores() },
      build([], [slot('b:ability:w', 'abilityWeighted', [2, 1], ['wis', '']), slot('f:ability:c', 'ability', [1], []), slot('s:spells:ability', 'ability', [], [])]),
    )
    expect(r.pending.map((p) => [p.slotKey, p.amount])).toEqual([['b:ability:w', 1], ['f:ability:c', 1]])
  })

  it('預覽加值後的值與調整值', () => {
    expect(previewBonus({ score: 15, mod: 2 }, 1)).toEqual({ score: 16, mod: 3, delta: 1, modChanged: true })
    expect(previewBonus({ score: 20, mod: 5 }, 2)).toEqual({ score: 20, mod: 5, delta: 0, modChanged: false })
    expect(previewBonus({ score: 12, mod: 1, override: 12 }, 2)).toMatchObject({ delta: 0 })
  })
})

describe.skipIf(!hasRealData)('abilityBreakdown：基準角色', () => {
  it('1 級：與角卡數值一致，侍僧加值的來源正確', () => {
    const data = realData()
    const c = benchmarkLevel1(data)
    const b = buildCharacter(c, data)
    const r = abilityBreakdown(c, b)
    const scores = abilityScores(c, b)
    for (const a of ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const) expect(r.abilities[a].score).toBe(scores[a].score)
    expect(r.abilities.int.text).toBe('15（標準陣列）＋1 背景：侍僧 = 16')
    expect(r.abilities.wis.text).toBe('13（標準陣列）＋2 背景：侍僧 = 15')
    expect(r.abilities.int.bonuses[0]!.origin.entry?.id).toBe(ACOLYTE)
    expect(r.pending).toEqual([])
  })

  it('還沒選背景加值時列為未分配', () => {
    const data = realData()
    const c = benchmarkLevel1(data)
    delete c.choices[`${ACOLYTE}:ability:w`]
    const r = abilityBreakdown(c, buildCharacter(c, data))
    expect(r.pending).toEqual([expect.objectContaining({ slotKey: `${ACOLYTE}:ability:w`, amount: 3, step: 'abilities' })])
  })

  it('20 級：屬性值提升未選（同 DDB），沒有被誤算', () => {
    const data = realData()
    const c = benchmarkLevel(data, 20)
    const r = abilityBreakdown(c, buildCharacter(c, data))
    expect(r.abilities.int.score).toBe(16)
  })
})
