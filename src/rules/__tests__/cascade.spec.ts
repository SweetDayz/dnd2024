import { describe, expect, it } from 'vitest'
import { ABILITIES, type Ability } from '@/rules/abilities'
import { buildCharacter } from '@/rules/build'
import { deriveSheet } from '@/rules/derive'
import { attackRows } from '@/rules/equipment'
import { classCastings, spellcastingStats, spellRows } from '@/rules/spells'
import type { Character } from '@/rules/character'
import { benchmarkLevel, benchmarkLevel1, choose, WIZARD, withStartingEquipment } from './benchmark'
import { hasRealData, realData } from './realData'

describe.skipIf(!hasRealData)('手動覆寫會連動所有相關數值', () => {
  const data = realData()
  const derive = (c: Character) => {
    const b = buildCharacter(c, data)
    const s = deriveSheet(c, b, data)
    const mods = Object.fromEntries(ABILITIES.map((a) => [a, s.abilities[a].mod])) as Record<Ability, number>
    const spells = spellRows(b, data, mods, s.profBonus, s.level)
    return { b, s, spells, attacks: attackRows(data, c, b, s, spells), casting: spellcastingStats(classCastings(b.classes, mods, data), mods, s.profBonus) }
  }
  const base = () => withStartingEquipment(benchmarkLevel(data, 20), data)

  it('覆寫智力 20：調整值、豁免、技能、被動調查、法術 DC 與攻擊、冷凍射線都跟著變', () => {
    const c = base()
    c.overrides = { 'ability:int': 20 }
    const { s, spells, attacks, casting } = derive(c)
    expect(s.abilities.int).toMatchObject({ computed: 16, score: 20, mod: 5 })
    expect(s.overridden['ability:int']).toEqual({ computed: 16, value: 20 })
    expect(s.saves.int.mod).toBe(11)
    expect(s.skills.find((x) => x.key === 'arcana')?.mod).toBe(11)
    expect(s.passive.investigation).toBe(21)
    expect(casting[0]).toMatchObject({ dc: 19, attack: 11 })
    expect(spells.find((r) => r.spell.name === '雷鸣波')?.hitDc).toBe('体质 19')
    expect(attacks.find((a) => a.name === '冷冻射线')?.hitDc).toBe('+11')
  })
  it('覆寫體質：HP 連動；覆寫敏捷：先攻、AC、匕首連動；覆寫力量：負重連動', () => {
    const c = base()
    c.overrides = { 'ability:con': 10, 'ability:dex': 16, 'ability:str': 10 }
    const { s, attacks } = derive(c)
    expect(s.hp.max).toBe(6 + 19 * 4)
    expect(s.initiative).toBe(3)
    expect(s.ac.value).toBe(13)
    expect(attacks.find((a) => a.name === '匕首')?.hitDc).toBe('+9')
    expect(s.encumbrance.capacity).toBe(150)
  })
  it('覆寫熟練加值：豁免、技能、法術 DC、武器都用新值', () => {
    const c = base()
    c.overrides = { profBonus: 2 }
    const { s, casting, attacks } = derive(c)
    expect(s.saves.int.mod).toBe(5)
    expect(casting[0]!.dc).toBe(13)
    expect(attacks.find((a) => a.name === '匕首')?.hitDc).toBe('+3')
  })
  it('覆寫察覺技能 → 被動感知跟著變；結果層覆寫（AC、先攻）只改自己', () => {
    const c = base()
    c.overrides = { 'skill:perception': 10, ac: 18, initiative: 5 }
    const { s } = derive(c)
    expect(s.passive.perception).toBe(20)
    expect(s.ac.value).toBe(18)
    expect(s.initiative).toBe(5)
    expect(s.abilities.dex.mod).toBe(1)
  })
  it('專長先決條件依最終屬性判斷（含覆寫）', () => {
    const c = benchmarkLevel(data, 4)
    const grappler = data.list('feat').find((f) => f.engName === 'Grappler' && f.source === 'XPHB')!
    const opt = (cc: Character) => buildCharacter(cc, data).slots.find((x) => x.key === `${WIZARD}:4:asi`)!.options.find((o) => o.value === grappler.id)!
    expect(opt(c).disabled).toMatch(/不符先決條件/)
    c.overrides = { 'ability:dex': 13 }
    expect(opt(c).disabled).toBeUndefined()
  })
  it('重甲力量不足：速度自動 −10', () => {
    const c = base()
    c.inventory.push({ uid: 'p', itemId: 'item|板甲|XPHB', qty: 1, equipped: true, container: 'equipment' })
    expect(derive(c).s.speeds.find((x) => x.mode === 'walk')?.value).toBe(20)
  })
})

describe.skipIf(!hasRealData)('子職施法者的法術清單從資料讀取', () => {
  const data = realData()
  it('奧法騎士用法師清單、AU 秘術武者用術士清單', () => {
    const lists = data
      .list('subclass')
      .filter((s) => s.casterProgression && s.classSource !== 'PHB')
      .map((sc) => [sc.name, sc.source, classCastings([{ entry: data.get(`class|${sc.className}|${sc.classSource}`)!, level: 3, subclass: sc, primary: true }], { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 }, data)[0]?.listName])
    expect(lists).toEqual(
      expect.arrayContaining([
        ['奥法骑士', 'XPHB', '法师'],
        ['诡术师', 'XPHB', '法师'],
        ['秘术武者', 'AU', '术士'],
      ]),
    )
  })
  it('所有官方子職都可選（每個 XPHB 職業的子職都包含 AU 的）', () => {
    const au = data.list('subclass').filter((s) => s.source === 'AU' && s.classSource === 'XPHB')
    expect(au.length).toBeGreaterThan(0)
    expect(au.every((s) => data.visible(s))).toBe(true)
  })
})

describe.skipIf(!hasRealData)('2014 種族的語言照給並標示 2014 版', () => {
  it('PHB 矮人：矮人語標示 2014', () => {
    const data = realData({ showLegacy: true })
    const c = benchmarkLevel1(data)
    c.raceId = 'race|矮人|PHB'
    const b = buildCharacter(c, data)
    const dwarvish = deriveSheet(c, b, data).profs.language.find((l) => l.value === 'dwarvish')
    expect(dwarvish?.sources.some((o) => o.name.includes('2014 版'))).toBe(true)
    void choose
  })
})
