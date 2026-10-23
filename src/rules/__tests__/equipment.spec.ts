import { describe, expect, it } from 'vitest'
import { buildCharacter } from '@/rules/build'
import { deriveSheet } from '@/rules/derive'
import { attackRows, goldAlternative, startingSets } from '@/rules/equipment'
import { spellRows } from '@/rules/spells'
import { ABILITIES, type Ability } from '@/rules/abilities'
import { benchmarkLevel, withStartingEquipment, WIZARD } from './benchmark'
import { hasRealData, realData } from './realData'

describe.skipIf(!hasRealData)('裝備與攻擊（真實資料，對照 DDB 20 級）', () => {
  const data = realData()
  const c = withStartingEquipment(benchmarkLevel(data, 20), data)
  const b = buildCharacter(c, data)
  const s = deriveSheet(c, b, data)
  const mods = Object.fromEntries(ABILITIES.map((a) => [a, s.abilities[a].mod])) as Record<Ability, number>
  const attacks = attackRows(data, c, b, s, spellRows(b, data, mods, s.profBonus, s.level))
  const atk = (name: string) => attacks.find((a) => a.name === name)

  it('起始裝備組：法師 A／B', () => {
    const sets = startingSets(data, data.get(WIZARD)!)
    expect(sets[0]!.options.map((o) => o.value)).toEqual(['A', 'B'])
    expect(sets[0]!.options[1]!.label).toContain('55 GP')
  })
  it('套用後：重量 49 磅、金幣 13、AC 11（無甲 10＋敏捷 1）', () => {
    expect(s.encumbrance.carried).toBe(49)
    expect(c.currency.gp).toBe(13)
    expect(s.encumbrance.capacity).toBe(8 * 15)
    expect(s.ac.value).toBe(11)
    expect(b.slots.filter((x) => x.type === 'equipment').every((x) => x.done)).toBe(true)
  })
  it('匕首 +7 1d4+1（靈巧用敏捷）、長棍 +5 1d6-1／1d8-1、徒手 +5', () => {
    expect(atk('匕首')).toMatchObject({ hitDc: '+7', proficient: true })
    expect(atk('匕首')!.damage).toMatch(/^1d4\+1 穿刺/)
    expect(atk('匕首')!.notes.join()).toContain('灵巧')
    expect(atk('匕首')!.mastery?.engName).toBe('Nick')
    expect(atk('长棍')).toMatchObject({ hitDc: '+5' })
    expect(atk('长棍')!.damage).toContain('1d6-1')
    expect(atk('长棍')!.damage).toContain('1d8-1')
    expect(atk('徒手打击')).toMatchObject({ hitDc: '+5', damage: '0 钝击' })
  })
  it('攻擊型法術：冷凍射線 +9、光導箭 +8', () => {
    expect(atk('冷冻射线')).toMatchObject({ hitDc: '+9', damage: '4d8' })
    expect(atk('光导箭')).toMatchObject({ hitDc: '+8', damage: '4d6' })
  })
  it('穿上鏈甲：AC 16，未受訓練警告', () => {
    const c2 = structuredClone(c)
    c2.inventory.push({ uid: 'x', itemId: 'item|链甲|XPHB', qty: 1, equipped: true, container: 'equipment' })
    const s2 = deriveSheet(c2, b, data)
    expect(s2.ac.value).toBe(16)
    expect(s2.ac.warnings.join()).toMatch(/護甲訓練/)
  })
  it('2014 職業的改拿金幣算式', () => {
    expect(goldAlternative(data.get('class|法师|PHB')!)).toBe('4d4 × 10')
  })
})
