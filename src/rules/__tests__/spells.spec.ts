import { describe, expect, it } from 'vitest'
import { ABILITIES, type Ability } from '@/rules/abilities'
import { buildCharacter } from '@/rules/build'
import { deriveSheet } from '@/rules/derive'
import {
  addDice,
  classCastings,
  evalPreparedFormula,
  holderLabel,
  otherHolders,
  spellHolders,
  spellRows,
  spellScopePool,
  spellScopeReason,
} from '@/rules/spells'
import { benchmarkLevel, benchmarkLevel1, WIZARD } from './benchmark'
import { hasRealData, realData } from './realData'

describe('法術小工具', () => {
  it('2014 準備法術公式', () => {
    const mods = { str: 0, dex: 0, con: 0, int: 3, wis: 2, cha: 1 }
    expect(evalPreparedFormula('<$level$> + <$int_mod$>', 5, mods)).toBe(8)
    expect(evalPreparedFormula('<$level$> / 2 + <$cha_mod$>', 5, mods)).toBe(3)
    expect(evalPreparedFormula('<$level$> / 2 + <$cha_mod$>', 1, { ...mods, cha: -1 })).toBe(1)
  })
  it('升環加骰', () => {
    expect(addDice('2d8', '1d8', 3)).toBe('5d8')
    expect(addDice('1d4+1', '1d4', 0)).toBe('1d4+1')
    expect(addDice('3d6', '1d6', 1)).toBe('4d6')
  })
})

function rowsAt(level: number) {
  const data = realData()
  const c = level === 1 ? benchmarkLevel1(data) : benchmarkLevel(data, level)
  const b = buildCharacter(c, data)
  const s = deriveSheet(c, b, data)
  const mods = Object.fromEntries(ABILITIES.map((a) => [a, s.abilities[a].mod])) as Record<Ability, number>
  const rows = spellRows(b, data, mods, s.profBonus, s.level)
  const find = (name: string, src?: string) => rows.find((r) => r.spell.name === name && (!src || r.sourceLabel.includes(src)))
  return { b, s, rows, find, mods }
}

describe.skipIf(!hasRealData)('基準角色的法術（真實資料，對照 DDB 20 級）', () => {
  const { b, s, find, mods } = rowsAt(20)

  it('法師：戲法 5、準備 25、法術書 6+19×2', () => {
    const [cc] = classCastings(b.classes, mods)
    expect(cc).toMatchObject({ cantrips: 5, prepared: 25, spellbook: 44, maxSpellLevel: 9, ability: 'int' })
    expect(s.profBonus).toBe(6)
  })
  it('雷鳴波：體質 DC 17、2d8，升環 +1d8', () => {
    expect(find('雷鸣波')).toMatchObject({ hitDc: '体质 17', damage: '2d8', upcastStep: '1d8', time: '1 动作', components: 'V/S' })
  })
  it('冷凍射線：+9、4d8（戲法依角色等級升階）', () => {
    expect(find('冷冻射线')).toMatchObject({ hitDc: '+9', damage: '4d8', range: '60 呎' })
  })
  it('光導箭（魔法學徒，感知）：+8、4d6、1/長休', () => {
    expect(find('光导箭')).toMatchObject({ hitDc: '+8', damage: '4d6', usesText: '1/长休', ability: 'wis', alwaysPrepared: true })
  })
  it('睡眠術：感知 DC 17、專注、材料', () => {
    expect(find('睡眠术')).toMatchObject({ hitDc: '感知 17', concentration: true, components: 'V/S/M' })
  })
  it('塑能學者的燃燒之手在法術書，可以準備；偵測魔法只在書裡、可儀式施展', () => {
    expect(find('燃烧之手')).toMatchObject({ hitDc: '敏捷 17', damage: '3d6', bookOnly: true })
    expect(find('侦测魔法')).toMatchObject({ ritual: true, bookOnly: true })
    expect(find('魔法飞弹', '法师')).toMatchObject({ damage: '1d4+1', bookOnly: false })
  })
  it('侏儒血系戲法用智力', () => {
    expect(find('魔法伎俩', '侏儒')).toMatchObject({ ability: 'int' })
  })
})

describe.skipIf(!hasRealData)('12 級', () => {
  it('雷鳴波 DC 15、冷凍射線 +7 3d8', () => {
    const { find } = rowsAt(12)
    expect(find('雷鸣波')?.hitDc).toBe('体质 15')
    expect(find('冷冻射线')).toMatchObject({ hitDc: '+7', damage: '3d8' })
  })
  it('1 級：法術書與準備都選完', () => {
    const { b } = rowsAt(1)
    const slots = b.slots.filter((x) => x.key.startsWith(WIZARD) && x.type === 'spell')
    expect(slots.every((x) => x.done)).toBe(true)
  })
})

describe.skipIf(!hasRealData)('法術選擇欄位（M5）', () => {
  const data = realData()
  const sp = (n: string) => data.get(`spell|${n}|XPHB`)!

  it('1 級基準角色的分頁：法師戲法、法術書、準備法術、魔法學徒戲法與一環', () => {
    const b = buildCharacter(benchmarkLevel1(data), data)
    const tabs = b.slots.filter((s) => s.spell).map((s) => [s.spell!.tab, s.spell!.role, s.count])
    expect(tabs).toEqual(
      expect.arrayContaining([
        ['法师戲法', 'cantrips', 3],
        ['法術書', 'spellbook', 6],
        ['準備法術', 'prepared', 4],
        ['魔法学徒；牧师・戲法', 'feature', 2],
        ['魔法学徒；牧师・法術', 'feature', 1],
      ]),
    )
  })

  it('不符合欄位的原因：環階太高、不在清單、戲法分開、不在法術書', () => {
    const b = buildCharacter(benchmarkLevel1(data), data)
    const scope = (suffix: string) => b.slots.find((s) => s.key.endsWith(suffix))!.spell!
    const book = scope(`${WIZARD}:spellbook`)
    expect(spellScopeReason(data, sp('火球术'), book)).toBe('環階太高（目前最高 1 環）')
    expect(spellScopeReason(data, sp('治疗祷言'), book)).toBe('不在法师法術清單上')
    expect(spellScopeReason(data, sp('光亮术'), book)).toBe('戲法在另一個欄位選')
    expect(spellScopeReason(data, sp('魔法飞弹'), book)).toBeUndefined()
    expect(spellScopeReason(data, sp('燃烧之手'), scope(`${WIZARD}:prepared`))).toMatch(/不在法術書中/)
    expect(spellScopeReason(data, sp('光导箭'), scope(`${WIZARD}:cantrips`))).toBe('這個欄位只能選戲法')
    // 反灰候選池只含同類（一環以上），且選項都沒有不符原因
    const pool = spellScopePool(data, book)
    expect(pool.every((s) => Number(s.level) > 0)).toBe(true)
    const opts = b.slots.find((s) => s.key.endsWith(`${WIZARD}:spellbook`))!.options
    expect(opts.every((o) => spellScopeReason(data, o.entry!, book) === undefined)).toBe(true)
  })

  it('重複偵測：法術書↔準備法術不算重複；子職免費給的法術再抄進法術書算跨來源重複', () => {
    const c = benchmarkLevel(data, 12)
    const b = buildCharacter(c, data)
    const holders = spellHolders(b)
    const slot = (suffix: string) => b.slots.find((s) => s.key.endsWith(suffix))!
    // 法術書裡、也已準備的法師護甲：在兩個分頁都不算重複
    expect(otherHolders(holders, slot(`${WIZARD}:spellbook`), 'spell|法师护甲|XPHB')).toEqual([])
    expect(otherHolders(holders, slot(`${WIZARD}:prepared`), 'spell|法师护甲|XPHB')).toEqual([])
    // 魔法學徒的光導箭：在法術書分頁算「已由 專長 取得」
    const by = otherHolders(holders, slot(`${WIZARD}:spellbook`), 'spell|光导箭|XPHB').map(holderLabel)
    expect(by).toEqual([expect.stringMatching(/^專長：魔法学徒/)])
  })

  it('12 級塑能師：完整選滿法術書與準備法術，欄位標示完成', () => {
    const c = benchmarkLevel(data, 12)
    let b = buildCharacter(c, data)
    const book = b.slots.find((s) => s.key === `${WIZARD}:spellbook`)!
    const picks = [...book.selected, ...book.options.map((o) => o.value).filter((v) => !book.selected.includes(v))].slice(0, book.count)
    c.choices[book.key] = picks
    b = buildCharacter(c, data)
    expect(b.slots.find((s) => s.key === book.key)!.done).toBe(true)
    const prep = b.slots.find((s) => s.key === `${WIZARD}:prepared`)!
    expect(prep.spell!.fromIds!.length).toBeGreaterThanOrEqual(book.count)
    c.choices[prep.key] = prep.options.slice(0, prep.count).map((o) => o.value)
    b = buildCharacter(c, data)
    expect(b.slots.find((s) => s.key === prep.key)!.done).toBe(true)
    // 已選滿：再加一個會被截掉（選滿停用的規則面）
    c.choices[prep.key] = prep.options.slice(0, prep.count + 1).map((o) => o.value)
    expect(buildCharacter(c, data).slots.find((s) => s.key === prep.key)!.selected).toHaveLength(prep.count)
  })
})
