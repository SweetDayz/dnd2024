import { describe, expect, it } from 'vitest'
import { buildCharacter } from '@/rules/build'
import { newCharacter } from '@/rules/character'
import { deriveSheet } from '@/rules/derive'
import { spellSlots } from '@/rules/multiclass'
import { spellRows } from '@/rules/spells'
import { buildSpellPools, spellbookRules, spellbookState, togglePoolSpell } from '@/rules/spells/pools'
import { bookCounts, cycleSpellbookState, normalizeSpellbook, prepare, unprepare, type SpellbookRules, type SpellbookState } from '@/rules/spells/spellbook'
import { ABILITIES, type Ability } from '@/rules/abilities'
import { benchmarkLevel, choose, EVOKER, WIZARD } from './benchmark'
import { hasRealData, realData } from './realData'
import { ARTIFICER, FAMILIAR_FRIEND, FIND_FAMILIAR, NECROMANCER, screenshotCharacter } from './screenshotChar'

// ---------------------------------------------------------------------------
// 法術書狀態機：表格驅動
// ---------------------------------------------------------------------------

const LEVELS: Record<string, number> = { a: 1, b: 1, c: 2, d: 3, high: 4, free: 1, fam: 1, cantrip: 0 }
const rules = (over: Partial<SpellbookRules> = {}): SpellbookRules => ({
  bookCap: 3,
  prepCap: 2,
  maxLevel: 3,
  free: new Map([['free', '死灵师']]),
  always: new Map([['fam', '魔宠密友']]),
  levelOf: (id) => LEVELS[id] ?? 1,
  ...over,
})
const st = (book: string[], prepared: string[] = []): SpellbookState => ({ book, prepared })

describe('cycleSpellbookState（M9.md §2.3 切換表）', () => {
  it.each([
    ['未擁有 → 法術書', st([]), 'a', st(['a']), undefined],
    ['法術書 → 已準備', st(['a']), 'a', st(['a'], ['a']), undefined],
    ['已準備 → 未擁有（移出並取消準備）', st(['a'], ['a']), 'a', st([]), undefined],
    ['書滿：狀態不變', st(['a', 'b', 'c']), 'd', st(['a', 'b', 'c']), '法術書已滿 3/3'],
    ['備滿：維持在法術書', st(['a', 'b', 'c'], ['a', 'b']), 'c', st(['a', 'b', 'c'], ['a', 'b']), '準備已滿 2/2'],
    ['環位太高：不能抄', st([]), 'high', st([]), '環位太高（目前最高 3 環）'],
    ['戲法不進法術書', st([]), 'cantrip', st([]), '戲法不抄進法術書'],
    ['免費抄寫：一開始就在書裡，點一下設為準備', st([]), 'free', st([], ['free']), undefined],
    ['免費抄寫：已準備再點只取消準備，不能移出', st([], ['free']), 'free', st([], []), undefined],
    ['免費抄寫不占書的名額', st(['a', 'b', 'c']), 'free', st(['a', 'b', 'c'], ['free']), undefined],
    ['永遠準備：仍可抄進書', st([]), 'fam', st(['fam']), undefined],
    ['永遠準備：準備階段鎖住，再點直接移出', st(['fam']), 'fam', st([]), undefined],
  ] as const)('%s', (_name, before, id, after, reason) => {
    const r = cycleSpellbookState(before, id, rules())
    expect(r.state).toEqual(after)
    expect(r.blockedReason).toBe(reason)
  })

  it('免費抄寫＋永遠準備：準備鎖住、也移不出', () => {
    const r = cycleSpellbookState(st([]), 'fam', rules({ free: new Map([['fam', '死灵师']]) }))
    expect(r.blockedReason).toBe('已由 魔宠密友 永遠準備')
  })

  it('計數：書不含免費抄寫，備不含永遠準備', () => {
    expect(bookCounts(st(['a', 'free'], ['a', 'free', 'fam']), rules())).toEqual({ book: 1, prepared: 2 })
  })

  it('只取消準備／從書準備', () => {
    expect(unprepare(st(['a'], ['a']), 'a')).toEqual(st(['a'], []))
    expect(prepare(st(['a']), 'a', rules()).state).toEqual(st(['a'], ['a']))
    expect(prepare(st([]), 'a', rules()).blockedReason).toBe('不在法術書中')
    expect(prepare(st(['fam']), 'fam', rules()).blockedReason).toBe('已由 魔宠密友 永遠準備')
  })

  it('載入時：已準備但不在書裡的自動補進書；補不下的改為未選擇', () => {
    const { state, notes } = normalizeSpellbook(st(['a', 'b'], ['a', 'c', 'd', 'free']), rules())
    expect(state).toEqual(st(['a', 'b', 'c'], ['a', 'c', 'free']))
    expect(notes).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// 真實資料：驗收角色
// ---------------------------------------------------------------------------

describe.skipIf(!hasRealData)('M9-2 驗收：截圖角色（奇械師 4／法師 6 死灵师）', () => {
  const data = hasRealData ? realData() : undefined!
  const c = hasRealData ? screenshotCharacter(data) : undefined!
  const b = hasRealData ? buildCharacter(c, data) : undefined!

  it('施法者等級 8，法術位 4/3/3/2', () => {
    const s = spellSlots(b.classes)
    expect(s.casterLevel).toBe(8)
    expect(s.slots.slice(0, 5)).toEqual([4, 3, 3, 2, 0])
  })

  it('導覽：法師、奇械師、其他來源三組；法師是 戲法 → 法術書與準備 → 死灵师（免費抄寫）', () => {
    const groups = buildSpellPools(b)
    expect(groups.map((g) => g.label)).toEqual(['法师', '奇械师'])
    const wiz = groups[0]!.pools
    expect(wiz.map((p) => p.label)).toEqual(['戲法', '法術書與準備', '死灵师（免費抄寫）'])
    const nec = wiz[2]!
    expect([nec.filled, nec.count]).toEqual([0, 3])
    expect(nec.slot.spell.slots!.map((s) => s.label)).toEqual(['≤2 環', '≤2 環', '≤3 環'])
    expect(nec.restriction).toBe('≤2 環 ×2、≤3 環，限死灵系')
    expect(nec.rule).toContain('免費加入法術書，不占法術書名額')
    const book = wiz[1]!
    expect([book.book!.bookCap, book.book!.prepCap, book.book!.maxLevel]).toEqual([16, 10, 3])
    expect(groups[1]!.pools.map((p) => p.label)).toEqual(['戲法', '準備法術'])
    expect(groups[1]!.pools[1]!.rule).toContain('長休後可全部重選')
  })

  it('寻获魔宠：死灵师免費加入法術書，且因魔宠密友永遠準備而鎖住準備階段；右側只占一列、兩個來源', () => {
    const info = buildSpellPools(b)[0]!.pools[1]!.book!
    expect(new Map(info.free).get(FIND_FAMILIAR)).toBe('死灵师')
    expect(new Map(info.always).get(FIND_FAMILIAR)).toContain('魔宠密友')
    const r = cycleSpellbookState(spellbookState(info, b.slots), FIND_FAMILIAR, spellbookRules(info, data))
    expect(r.blockedReason).toContain('魔宠密友 永遠準備')
    const s = deriveSheet(c, b, data)
    const mods = Object.fromEntries(ABILITIES.map((a) => [a, s.abilities[a].mod])) as Record<Ability, number>
    const rows = spellRows(b, data, mods, s.profBonus, s.level).filter((r) => r.spell.id === FIND_FAMILIAR)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.grants.map((g) => [g.kind, g.origin.entry?.id])).toEqual([
      ['always', FAMILIAR_FRIEND],
      ['spellbook', NECROMANCER],
    ])
  })

  it('死灵师池子：1 環法術放進 ≤2 環的格子，3 環法術只能放 ≤3 環的格子', () => {
    const nec = buildSpellPools(b)[0]!.pools[2]!
    const l3 = data.get('spell|活化死尸|XPHB')!
    const l1 = data.get('spell|致病射线|XPHB')!
    let r = togglePoolSpell(data, nec.slot, l3)
    expect(r.selected).toEqual(['', '', l3.id])
    r = togglePoolSpell(data, { ...nec.slot, selected: r.selected }, l1)
    expect(r.selected).toEqual([l1.id, '', l3.id])
    const l3b = data.get('spell|吸血鬼之触|XPHB')!
    expect(togglePoolSpell(data, { ...nec.slot, selected: r.selected }, l3b).blockedReason).toBe('符合條件的格子都已選了')
    // 不在死灵系
    expect(togglePoolSpell(data, nec.slot, data.get('spell|魔法飞弹|XPHB')!).blockedReason).toBe('不符合任何一格的條件')
  })

  it('已由其他來源取得的法術在占名額的池子裡反灰：法師準備欄位的寻获魔宠', () => {
    const prep = b.slots.find((s) => s.key === 'class|法师|XPHB:prepared')!
    expect(prep.options.find((o) => o.value === FIND_FAMILIAR)?.disabled).toBe('已由 魔宠密友 永遠準備')
    expect(b.spells.find((g) => g.origin.entry?.id === ARTIFICER)).toMatchObject({ spellId: 'spell|修复术|XPHB', kind: 'cantrip' })
  })

  it('法師點兩下：未擁有 → 書 → 備 → 未擁有，計數正確', () => {
    const info = buildSpellPools(b)[0]!.pools[1]!.book!
    const R = spellbookRules(info, data)
    let state = spellbookState(info, b.slots)
    const id = 'spell|魔法飞弹|XPHB'
    state = cycleSpellbookState(state, id, R).state
    expect(bookCounts(state, R)).toEqual({ book: 1, prepared: 0 })
    state = cycleSpellbookState(state, id, R).state
    expect(bookCounts(state, R)).toEqual({ book: 1, prepared: 1 })
    state = cycleSpellbookState(state, id, R).state
    expect(bookCounts(state, R)).toEqual({ book: 0, prepared: 0 })
  })
})

describe.skipIf(!hasRealData)('M9-2 驗收：基準角色與兼職', () => {
  const data = hasRealData ? realData() : undefined!

  it('塑能師法師 20 級：法術 DC 17；學者特性的免費抄寫 3 級 2 道、之後每兩級 1 道，共 9 格', () => {
    const c = benchmarkLevel(data, 20)
    const b = buildCharacter(c, data)
    const s = deriveSheet(c, b, data)
    const mods = Object.fromEntries(ABILITIES.map((a) => [a, s.abilities[a].mod])) as Record<Ability, number>
    const tw = spellRows(b, data, mods, s.profBonus, s.level).find((r) => r.spell.id === 'spell|雷鸣波|XPHB')!
    expect(tw.dc).toBe(17)
    expect(tw.hitDc).toBe('体质豁免 DC 17')
    const evo = b.slots.find((x) => x.key === `${EVOKER}:spells:spellbook`)!
    expect(evo.count).toBe(9)
    expect(evo.selected.filter(Boolean)).toEqual(['spell|燃烧之手|XPHB', 'spell|魔法飞弹|XPHB'])
  })

  it('塑能師 12 級：免費抄寫 6 格', () => {
    const b = buildCharacter(benchmarkLevel(data, 12), data)
    expect(b.slots.find((x) => x.key === `${EVOKER}:spells:spellbook`)!.count).toBe(6)
  })

  it('XPHB 聖武士 5／法師 1：施法者等級 3＋1＝4', () => {
    const c = newCharacter('2026-01-01T00:00:00.000Z')
    c.levels = [
      ...[...Array(5)].map(() => ({ classId: 'class|圣武士|XPHB', hp: { mode: 'average' as const } })),
      { classId: WIZARD, hp: { mode: 'average' as const } },
    ]
    c.baseScores = { str: 15, dex: 10, con: 14, int: 13, wis: 8, cha: 13 }
    const b = buildCharacter(c, data)
    const s = spellSlots(b.classes)
    expect(s.casterLevel).toBe(4)
    expect(s.slots.slice(0, 3)).toEqual([4, 3, 0])
  })

  it('魔契師 XPHB 15 級：秘法奧義一個池子 6／7／8 環各一格', () => {
    const c = newCharacter('2026-01-01T00:00:00.000Z')
    c.levels = [...Array(15)].map(() => ({ classId: 'class|魔契师|XPHB', hp: { mode: 'average' as const } }))
    c.baseScores = { str: 8, dex: 14, con: 13, int: 10, wis: 12, cha: 15 }
    const b = buildCharacter(c, data)
    const arc = b.slots.find((s) => s.key === 'class|魔契师|XPHB:arcanum')!
    expect(arc.spell!.slots!.map((s) => s.label)).toEqual(['6 環', '7 環', '8 環'])
    const sp6 = arc.options.find((o) => Number(o.entry?.level) === 6)!.value
    choose(c, data, (s) => s.key === arc.key, ['', '', ''])
    c.choices[arc.key] = [sp6, '', '']
    const b2 = buildCharacter(c, data)
    expect(b2.spells.find((g) => g.kind === 'arcanum')).toMatchObject({ spellId: sp6, castModes: [{ type: 'daily', n: 1 }] })
    // 放錯格（6 環放到 7 環格）視為未選
    c.choices[arc.key] = ['', sp6, '']
    expect(buildCharacter(c, data).slots.find((s) => s.key === arc.key)!.selected).toEqual(['', '', ''])
  })
})
