import { describe, expect, it } from 'vitest'
import type { Entry } from '@/data/types'
import {
  arcanumTemplates,
  castModeLabel,
  parseAdditionalSpells,
  resolveKnownSemantics,
  templateActive,
  type GrantTemplate,
  type HostInfo,
} from '@/rules/spells/grants'
import { hasRealData, realData } from './realData'

const host = (h: Partial<HostInfo> & Pick<HostInfo, 'type'>): HostInfo => ({ casting: 'none', level: 20, ...h })

describe('known 的語意依宿主決定（M9.md §1.2）', () => {
  it.each([
    [{ type: 'subclass', casting: 'spellbook' }, false, { kind: 'spellbook', free: true }],
    [{ type: 'subclass', casting: 'spellbook' }, true, { kind: 'cantrip', free: true }],
    [{ type: 'subclass', casting: 'known' }, false, { kind: 'known', free: true }],
    [{ type: 'subclass', casting: 'prepared' }, true, { kind: 'cantrip', free: true }],
    [{ type: 'subclass', casting: 'prepared' }, false, { kind: 'always' }],
    [{ type: 'race', casting: 'none' }, true, { kind: 'cantrip' }],
    [{ type: 'feat', casting: 'none' }, false, { kind: 'always' }],
    [{ type: 'optionalfeature', casting: 'none' }, false, { kind: 'always' }],
  ] as const)('%o，戲法=%s → %o', (h, cantrip, want) => {
    expect(resolveKnownSemantics(h, cantrip)).toEqual(want)
  })
})

describe('parseAdditionalSpells：合成資料', () => {
  it('兩層等級鍵、s6 等級鍵、daily 的 1e／pb／屬性鍵', () => {
    const { templates } = parseAdditionalSpells(
      [
        {
          known: { '1': { _: [{ choose: 'level=0|class=法师' }] } },
          innate: { '3': { daily: { '1e': ['甲|xphb', '乙|xphb'], pb: ['丙|xphb'], int: ['丁|xphb'] } } },
          expanded: { s6: [{ all: 'level=6|class=牧师' }] },
        },
      ],
      host({ type: 'race', edition: '2024', level: 1 }),
    )
    const [cantrip, a, b, c, d, exp] = templates
    expect(cantrip).toMatchObject({ kind: 'cantrip', minLevel: 1, levelKey: '1/_', pick: { filter: 'level=0|class=法师', count: 1 } })
    expect(a!.castModes).toEqual([{ type: 'daily', n: 1, each: true }, { type: 'slotAlso' }])
    expect(b!.pick).toEqual({ ref: '乙|xphb', cantrip: false })
    expect(c!.castModes[0]).toEqual({ type: 'daily', n: 'pb' })
    expect(d!.castModes[0]).toEqual({ type: 'daily', n: 'int' })
    expect(exp).toMatchObject({ kind: 'expanded', minSpellLevel: 6, pick: { all: 'level=6|class=牧师' } })
    expect(templateActive(exp!, { level: 20, maxSpellLevel: 5 })).toBe(false)
    expect(templateActive(exp!, { level: 20, maxSpellLevel: 6 })).toBe(true)
    expect(templateActive(a!, { level: 2 })).toBe(false)
  })

  it('choose 的兩種形式：篩選字串與 {from, count}', () => {
    const { templates } = parseAdditionalSpells(
      [{ innate: { '3': [{ choose: { from: ['甲|xphb#c', '乙|xphb#c'], count: 1 } }] }, ability: 'int' }],
      host({ type: 'subclass', casting: 'none', level: 3 }),
    )
    expect(templates[0]).toMatchObject({ kind: 'cantrip', pick: { from: ['甲|xphb#c', '乙|xphb#c'], count: 1 }, ability: 'int' })
  })

  it('施放方式標籤', () => {
    expect(castModeLabel({ type: 'daily', n: 1, each: true })).toBe('免費 1/長休（各）')
    expect(castModeLabel({ type: 'rest', n: 'pb' }, { pb: 3 })).toBe('免費 3/短休')
    expect(castModeLabel({ type: 'resource', n: 2, name: '功力' })).toBe('消耗 功力 2 點')
  })
})

describe.skipIf(!hasRealData)('parseAdditionalSpells：真實 XPHB 條目', () => {
  const data = hasRealData ? realData() : undefined
  const get = (id: string): Entry => {
    const e = data!.get(id)
    if (!e) throw new Error(`找不到 ${id}`)
    return e
  }
  const parse = (id: string, h: Partial<HostInfo> & Pick<HostInfo, 'type'>) => parseAdditionalSpells(get(id).additionalSpells as never, host(h))
  const kinds = (ts: GrantTemplate[]) => ts.map((t) => t.kind)

  it('高等精靈：1 級選一道法師戲法（兩層鍵）、3／5 級天生 1/長休且也可用法術位、施法屬性三選一', () => {
    const { templates: t } = parse('race|精灵; 高等精灵血系|XPHB', { type: 'race', edition: '2024', level: 5 })
    expect(kinds(t).sort()).toEqual(['cantrip', 'innate', 'innate'])
    const cantrip = t.find((x) => x.kind === 'cantrip')!
    expect(cantrip.pick).toEqual({ filter: 'level=0|class=法师', count: 1 })
    expect(t.find((x) => x.minLevel === 3)!.castModes).toEqual([{ type: 'daily', n: 1 }, { type: 'slotAlso' }])
    expect(cantrip.ability).toEqual({ choose: ['int', 'wis', 'cha'] })
  })

  it('提夫林幽冥遺贈：兩道固定戲法（#c）、虛假生命 3 級、衰弱射線 5 級', () => {
    const { templates: t } = parse('race|提夫林；幽冥遗赠|XPHB', { type: 'race', edition: '2024', level: 3 })
    expect(t.filter((x) => x.kind === 'cantrip').map((x) => x.pick)).toEqual([
      { ref: '奇术|xphb', cantrip: true },
      { ref: '颤栗之触|xphb', cantrip: true },
    ])
    const active = t.filter((x) => templateActive(x, { level: 3 }))
    expect(active.map((x) => ('ref' in x.pick ? x.pick.ref : ''))).toContain('虚假生命|xphb')
    expect(active.map((x) => ('ref' in x.pick ? x.pick.ref : ''))).not.toContain('衰弱射线|xphb')
  })

  it('魔法學徒：牧師／德魯伊／法師三選一，各有 2 戲法與 1 道一環 1/長休', () => {
    const { options, templates: t } = parse('feat|魔法学徒|XPHB', { type: 'feat', edition: '2024', level: 1 })
    expect(options.map((o) => o.engName)).toEqual(['Cleric Spells', 'Druid Spells', 'Wizard Spells'])
    const cleric = t.filter((x) => x.option === 0)
    expect(cleric.find((x) => x.kind === 'cantrip')!.pick).toEqual({ filter: 'level=0|class=牧师', count: 2 })
    expect(cleric.find((x) => x.kind === 'innate')).toMatchObject({ pick: { filter: 'level=1|class=牧师', count: 1 }, castModes: [{ type: 'daily', n: 1 }, { type: 'slotAlso' }] })
    expect(new Set(t.map((x) => x.option))).toEqual(new Set([0, 1, 2]))
  })

  it('妖精觸碰：1e（每道各一次）、屬性 inherit、迷蹤步固定＋選一道一環惑控／預言', () => {
    const { templates: t } = parse('feat|妖精触碰|XPHB', { type: 'feat', edition: '2024', level: 4 })
    expect(t).toHaveLength(2)
    expect(t.every((x) => x.ability === 'inherit')).toBe(true)
    expect(t[0]!.castModes[0]).toEqual({ type: 'daily', n: 1, each: true })
    expect(t[1]!.pick).toEqual({ filter: 'level=1|school=E;D', count: 1 })
  })

  it('暗影武者：次級幻象是免費戲法；黑暗術消耗 功力 1 點', () => {
    const { templates: t } = parse('subclass|暗影武者|XPHB|武僧|XPHB', { type: 'subclass', casting: 'none', level: 3 })
    expect(t.map((x) => [x.kind, x.free ?? false])).toEqual([
      ['cantrip', true],
      ['innate', false],
    ])
    expect(t[1]!.castModes).toEqual([{ type: 'resource', n: 1, name: '功力' }])
    expect(t[1]!.ability).toBe('wis')
  })

  it('獸心道途：只能以儀式施放，問道自然 10 級', () => {
    const { templates: t } = parse('subclass|兽心道途|XPHB|野蛮人|XPHB', { type: 'subclass', casting: 'none', level: 10 })
    expect(t.every((x) => x.castModes.length === 1 && x.castModes[0]!.type === 'ritualOnly')).toBe(true)
    expect(t.map((x) => x.minLevel)).toEqual([3, 3, 10])
  })

  it('鏈之魔契：寻获魔宠只能以儀式施放，魅力', () => {
    const { templates: t } = parse('optionalfeature|链之魔契|XPHB', { type: 'optionalfeature', edition: '2024', level: 2 })
    expect(t).toEqual([expect.objectContaining({ kind: 'innate', ability: 'cha', castModes: [{ type: 'ritualOnly' }] })])
  })

  it('死灵师（AU）：寻获魔宠與學派法術免費加入法術書；6 級活化死尸永遠準備＋1/長休', () => {
    const h = { type: 'subclass', casting: 'spellbook', level: 6, maxSpellLevel: 3 } as const
    const { templates: t } = parse('subclass|死灵师|AU|法师|XPHB', h)
    const active = t.filter((x) => templateActive(x, h))
    const book = active.filter((x) => x.kind === 'spellbook')
    expect(book.every((x) => x.free)).toBe(true)
    expect(book.map((x) => x.pick)).toEqual([
      { ref: '寻获魔宠|xphb', cantrip: false },
      { filter: 'level=0;1;2|class=法师|school=N', count: 1 },
      { filter: 'level=0;1;2|class=法师|school=N', count: 1 },
      { filter: 'level=0;1;2;3|class=法师|school=N', count: 1 },
    ])
    expect(active.find((x) => x.kind === 'always')).toMatchObject({ minLevel: 6, castModes: [{ type: 'slot' }] })
    expect(active.find((x) => x.kind === 'innate')).toMatchObject({ castModes: [{ type: 'daily', n: 1 }] })
  })

  it('XPHB 天界宗主：免費戲法＋永遠準備（契約法術位）', () => {
    const h = { type: 'subclass', casting: 'prepared', pact: true, level: 5 } as const
    const { templates: t } = parse('subclass|天界宗主|XPHB|魔契师|XPHB', h)
    const active = t.filter((x) => templateActive(x, h))
    expect(active.filter((x) => x.kind === 'cantrip').every((x) => x.free)).toBe(true)
    expect(active.filter((x) => x.kind === 'always')).toHaveLength(6)
    expect(active.find((x) => x.kind === 'always')!.castModes).toEqual([{ type: 'pact' }])
  })

  it('XPHB 魔契師秘法奧義：11/13/15/17 級各一道 6～9 環，1/長休', () => {
    const wl = get('class|魔契师|XPHB')
    expect(arcanumTemplates(wl, 10)).toEqual([])
    const t = arcanumTemplates(wl, 15)
    expect(t.map((x) => x.pick)).toEqual([
      { filter: 'level=6|class=魔契师', count: 1 },
      { filter: 'level=7|class=魔契师', count: 1 },
      { filter: 'level=8|class=魔契师', count: 1 },
    ])
    expect(t.every((x) => x.kind === 'arcanum')).toBe(true)
  })

  it('2014 術士（已知法術制）的子職：時械之魂的法術是額外已知法術，不占已知數', () => {
    const { templates: t } = parse('subclass|时械之魂|TCE|术士|PHB', { type: 'subclass', casting: 'known', level: 1 })
    expect(t.filter((x) => templateActive(x, { level: 1 })).map((x) => [x.kind, x.free])).toEqual([
      ['known', true],
      ['known', true],
    ])
  })

  it('XPHB 吟遊詩人魔法奧秘：10 級起擴充 1～5 環，s6～s9 依可施展環位', () => {
    const h = { type: 'class', casting: 'prepared', level: 11, maxSpellLevel: 6 } as const
    const { templates: t } = parse('class|吟游诗人|XPHB', h)
    const exp = t.filter((x) => x.kind === 'expanded' && templateActive(x, h))
    expect(exp.map((x) => ('all' in x.pick ? x.pick.all : ''))).toEqual(['level=1;2;3;4;5|class=牧师;德鲁伊;法师', 'level=6|class=牧师;德鲁伊;法师'])
  })
})
