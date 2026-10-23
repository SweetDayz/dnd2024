import { describe, expect, it } from 'vitest'
import type { SourceInfo } from '../../../src/data/types.ts'
import { applyMod, expandVersions, resolveCopies } from '../copy.ts'
import { buildDataset, flattenMagicVariant, type BuildReport } from '../pipeline.ts'
import { spellIndex, spellOrigins } from '../spellIndex.ts'

const src = (source: string, edition: '2014' | '2024' = '2014'): SourceInfo => ({
  source,
  name: source,
  engName: source,
  published: edition === '2024' ? '2024-09-17' : '2014-08-19',
  type: 'book',
  group: 'core',
  edition,
})
const SOURCES = [src('PHB'), src('MPMM'), src('TCE'), src('LFL'), src('XPHB', '2024')]
const key = (e: { name: string; source: string }) => `${e.name}|${e.source.toLowerCase()}`

describe('_copy / _mod', () => {
  it('繼承母條目、子條目欄位優先、預設不繼承 page 與 reprintedAs', () => {
    const [, child] = resolveCopies(
      [
        { name: '地精', source: 'MPMM', page: 17, speed: 30, size: ['S'], reprintedAs: ['x|Y'] },
        { name: '波尬', source: 'LFL', size: ['M'], _copy: { name: '地精', source: 'MPMM' } },
      ],
      key,
    )
    expect(child).toEqual({ name: '波尬', source: 'LFL', speed: 30, size: ['M'] })
  })

  it('_preserve 可保留預設不繼承的欄位', () => {
    const [, child] = resolveCopies(
      [
        { name: 'A', source: 'PHB', page: 5 },
        { name: 'B', source: 'TCE', _copy: { name: 'A', source: 'PHB', _preserve: { page: true } } },
      ],
      key,
    )
    expect(child.page).toBe(5)
  })

  it('遞迴解析「複製的複製」，並依序套用 _mod', () => {
    const out = resolveCopies(
      [
        { name: 'C', source: 'TCE', _copy: { name: 'B', source: 'PHB', _mod: { entries: { mode: 'appendArr', items: 'c' } } } },
        { name: 'A', source: 'PHB', entries: [{ name: '甲', entries: ['a'] }] },
        {
          name: 'B',
          source: 'PHB',
          _copy: {
            name: 'A',
            source: 'phb', // 來源大小寫不一致也要能找到
            _mod: { entries: { mode: 'replaceArr', replace: '甲', items: { name: '乙', entries: ['b'] } } },
          },
        },
      ],
      key,
    )
    expect(out[0].entries).toEqual([{ name: '乙', entries: ['b'] }, 'c'])
    expect(out[0]._copy).toBeUndefined()
  })

  it('支援 insertArr、appendIfNotExistsArr、replaceTxt', () => {
    expect(applyMod(['a', 'c'], { mode: 'insertArr', index: 1, items: 'b' })).toEqual(['a', 'b', 'c'])
    expect(applyMod(['a'], { mode: 'appendIfNotExistsArr', items: ['a', 'b'] })).toEqual(['a', 'b'])
    expect(
      applyMod([{ type: 'entries', name: '地精', entries: ['地精很小'] }], {
        mode: 'replaceTxt',
        replace: '地精',
        with: '阴林地精',
      }),
    ).toEqual([{ type: 'entries', name: '阴林地精', entries: ['阴林地精很小'] }])
  })

  it('_mod 的 "remove" 簡寫會刪除欄位', () => {
    const [, child] = resolveCopies(
      [
        { name: 'A', source: 'PHB', rarity: 'rare', reqAttune: true },
        { name: 'B', source: 'PHB', _copy: { name: 'A', source: 'PHB', _mod: { reqAttune: 'remove' } } },
      ],
      key,
    )
    expect(child).toEqual({ name: 'B', source: 'PHB', rarity: 'rare' })
  })

  it('_mod 支援點路徑與 setProp', () => {
    const [, child] = resolveCopies(
      [
        { name: 'A', source: 'XDMG', inherits: { rarity: 'rare', entries: ['a'] } },
        {
          name: 'B',
          source: 'AU',
          _copy: {
            name: 'A',
            source: 'XDMG',
            _mod: {
              'inherits.rarity': { mode: 'setProp', value: 'legendary' },
              'inherits.entries': { mode: 'appendArr', items: 'b' },
            },
          },
        },
      ],
      key,
    )
    expect(child.inherits).toEqual({ rarity: 'legendary', entries: ['a', 'b'] })
  })

  it('找不到母條目時丟出錯誤', () => {
    expect(() => resolveCopies([{ name: 'X', source: 'PHB', _copy: { name: 'Y', source: 'PHB' } }], key)).toThrow(
      '找不到母條目',
    )
  })
})

describe('buildDataset', () => {
  const whitelist = new Set(['PHB', 'MPMM', 'XPHB', 'TCE'])

  it('只保留白名單來源，並加上 id、engName、edition', () => {
    const ds = buildDataset(
      {
        feat: [
          { name: '警觉', ENG_name: 'Alert', source: 'XPHB', page: 200, translator: '不全书', srd52: true },
          { name: '幸运', source: 'LFL' },
        ],
      },
      { whitelist, sources: SOURCES },
    )
    expect(ds.feat).toEqual([
      { id: 'feat|警觉|XPHB', kind: 'feat', name: '警觉', engName: 'Alert', source: 'XPHB', page: 200, edition: '2024' },
    ])
  })

  it('白名單外的母條目仍可被 _copy，子條目留下、母條目濾掉', () => {
    const ds = buildDataset(
      {
        race: [
          { name: '地精', source: 'LFL', speed: 30 },
          { name: '波尬', source: 'MPMM', _copy: { name: '地精', source: 'LFL' } },
        ],
      },
      { whitelist, sources: SOURCES },
    )
    expect(ds.race!.map((r) => [r.id, r.speed])).toEqual([['race|波尬|MPMM', 30]])
  })

  it('亞種與子職要求母條目也存在', () => {
    const ds = buildDataset(
      {
        race: [{ name: '精灵', source: 'PHB' }],
        subrace: [
          { name: '高等', source: 'PHB', raceName: '精灵', raceSource: 'PHB' },
          { name: '某亞種', source: 'PHB', raceName: '外书种族', raceSource: 'LFL' },
        ],
        class: [{ name: '法师', source: 'XPHB' }],
        subclass: [
          { name: '塑能师', shortName: '塑能师', source: 'XPHB', className: '法师', classSource: 'XPHB' },
          { name: '孤儿子职', shortName: '孤儿', source: 'XPHB', className: '战士', classSource: 'XPHB' },
        ],
      },
      { whitelist, sources: SOURCES },
    )
    expect(ds.subrace!.map((e) => e.id)).toEqual(['subrace|高等|PHB|精灵|PHB'])
    expect(ds.subclass!.map((e) => e.id)).toEqual(['subclass|塑能师|XPHB|法师|XPHB'])
  })

  it('reprintedAs 轉成 id，只保留建置後存在的目標', () => {
    const report: BuildReport = { reprintUnresolved: [] }
    const ds = buildDataset(
      {
        race: [
          { name: '阿斯莫', source: 'PHB', reprintedAs: ['阿斯莫|MPMM', '阿斯莫|LFL'] },
          { name: '阿斯莫', source: 'MPMM', reprintedAs: ['阿斯莫|xphb'] },
          { name: '阿斯莫', source: 'XPHB' },
          { name: '人马', source: 'PHB', reprintedAs: ['人马|LFL'] },
        ],
        subrace: [{ name: '堕落', source: 'PHB', raceName: '阿斯莫', raceSource: 'PHB', reprintedAs: ['阿斯莫|XPHB'] }],
        optionalfeature: [{ name: '警戒', source: 'TCE', reprintedAs: [{ uid: '警觉|XPHB', tag: 'feat' }] }],
        feat: [{ name: '警觉', source: 'XPHB' }],
      },
      { whitelist, sources: SOURCES, report },
    )
    const r = Object.fromEntries(ds.race!.map((e) => [e.id, e.reprintedAs]))
    // 鏈狀重印：PHB → MPMM → XPHB，間接目標也列進來（直接目標在前）
    expect(r['race|阿斯莫|PHB']).toEqual(['race|阿斯莫|MPMM', 'race|阿斯莫|XPHB'])
    expect(r['race|阿斯莫|MPMM']).toEqual(['race|阿斯莫|XPHB'])
    expect(r['race|阿斯莫|XPHB']).toBeUndefined()
    expect(r['race|人马|PHB']).toBeUndefined() // 目標書不在白名單
    expect(ds.subrace![0]!.reprintedAs).toEqual(['race|阿斯莫|XPHB'])
    expect(ds.optionalfeature![0]!.reprintedAs).toEqual(['feat|警觉|XPHB'])
    // 找不到的目標寫進報告：LFL 不在白名單是正常的
    expect(report.reprintUnresolved.map((u) => [u.id, u.ref, u.reason])).toEqual([
      ['race|阿斯莫|PHB', '阿斯莫|LFL', 'target-not-whitelisted'],
      ['race|人马|PHB', '人马|LFL', 'target-not-whitelisted'],
    ])
  })

  it('目標書在白名單但條目不存在 → target-missing', () => {
    const report: BuildReport = { reprintUnresolved: [] }
    buildDataset(
      { item: [{ name: '法术卷轴', source: 'PHB', reprintedAs: ['法术卷轴|XPHB'] }] },
      { whitelist, sources: SOURCES, report },
    )
    expect(report.reprintUnresolved).toEqual([
      { kind: 'item', id: 'item|法术卷轴|PHB', ref: '法术卷轴|XPHB', reason: 'target-missing' },
    ])
  })

  it('子職的重印參照格式為「短名|職業|職業來源|來源」', () => {
    const ds = buildDataset(
      {
        class: [{ name: '法师', source: 'PHB' }, { name: '法师', source: 'XPHB' }],
        subclass: [
          { name: '塑能学派', shortName: '塑能', source: 'PHB', className: '法师', classSource: 'PHB', reprintedAs: ['塑能师|法师|XPHB|XPHB'] },
          { name: '塑能师', shortName: '塑能师', source: 'XPHB', className: '法师', classSource: 'XPHB' },
        ],
      },
      { whitelist, sources: SOURCES },
    )
    expect(ds.subclass![0]!.reprintedAs).toEqual(['subclass|塑能师|XPHB|法师|XPHB'])
  })

  it('標記 TCE 可選規則：可選職業特性、可選特性、定制血統、擴充法術表', () => {
    const ds = buildDataset(
      {
        class: [{ name: '法师', source: 'PHB' }],
        classFeature: [
          { name: '戏法公式', source: 'TCE', className: '法师', classSource: 'PHB', level: 3, isClassFeatureVariant: true },
          { name: '奥术回想', source: 'PHB', className: '法师', classSource: 'PHB', level: 1 },
        ],
        optionalfeature: [{ name: '盲斗', source: 'TCE', isClassFeatureVariant: true }],
        race: [
          { name: '定制血统', source: 'TCE', lineage: true },
          { name: '人类', source: 'PHB' },
        ],
        spell: [{ name: '灾厄之刃', source: 'TCE' }],
        spellLookup: {
          tce: {
            灾厄之刃: {
              class: { PHB: { 法师: true } },
              classVariant: { PHB: { 法师: { definedInSources: ['TCE'] } } },
            },
          },
        },
      },
      { whitelist, sources: SOURCES },
    )
    expect(ds.classFeature!.map((e) => [e.name, e.tceOptional])).toEqual([
      ['戏法公式', true],
      ['奥术回想', undefined],
    ])
    expect(ds.classFeature![0]!.id).toBe('classFeature|戏法公式|TCE|法师|PHB|3')
    expect(ds.classFeature![0]!.isClassFeatureVariant).toBeUndefined()
    expect(ds.optionalfeature![0]!.tceOptional).toBe(true)
    expect(ds.race!.map((e) => e.tceOptional)).toEqual([true, undefined])
    expect(ds.spell![0]!.classes).toEqual([
      { className: '法师', classSource: 'PHB' },
      { className: '法师', classSource: 'PHB', definedIn: ['TCE'], tceOptional: true },
    ])
  })

  it('物品、基礎物品、物品組合併成同一個 kind 並加上旗標', () => {
    const ds = buildDataset(
      { baseitem: [{ name: '长剑', source: 'PHB' }], item: [{ name: '+1 长剑', source: 'PHB' }], itemGroup: [{ name: '艾恩石', source: 'PHB' }] },
      { whitelist, sources: SOURCES },
    )
    expect(ds.item!.map((e) => [e.name, e.isBaseItem, e.isItemGroup])).toEqual([
      ['长剑', true, undefined],
      ['+1 长剑', undefined, undefined],
      ['艾恩石', undefined, true],
    ])
  })
})

describe('pagePatches', () => {
  it('只在缺頁碼時補上；職業特性用等級區分', () => {
    const ds = buildDataset(
      {
        optionalfeature: [
          { name: '放逐弹', ENG_name: 'Banishing Shot', source: 'TCE' },
          { name: '有页码', ENG_name: 'Has Page', source: 'TCE', page: 5 },
        ],
      },
      {
        whitelist: new Set(['TCE']),
        sources: SOURCES,
        pagePatches: { 'optionalfeature|Banishing Shot|tce|': 10, 'optionalfeature|Has Page|tce|': 99 },
      },
    )
    expect(ds.optionalfeature!.map((e) => e.page)).toEqual([10, 5])
  })
})

describe('flattenMagicVariant', () => {
  it('把 inherits 攤平成一般物品，並代入 {=欄位} 模板', () => {
    expect(
      flattenMagicVariant({
        name: '矮人板甲',
        ENG_name: 'Dwarven Plate',
        type: 'GV|XDMG',
        requires: [{ name: '板甲' }],
        inherits: {
          namePrefix: '矮人',
          source: 'XDMG',
          page: 255,
          rarity: 'very rare',
          bonusAc: '+2',
          entries: ['你在护甲等级上获得{=bonusAc}加值，{=baseName/l}很重。'],
        },
      }),
    ).toEqual({
      name: '矮人板甲',
      ENG_name: 'Dwarven Plate',
      type: 'GV|XDMG',
      requires: [{ name: '板甲' }],
      isGenericVariant: true,
      source: 'XDMG',
      page: 255,
      rarity: 'very rare',
      bonusAc: '+2',
      entries: ['你在护甲等级上获得+2加值，该物品很重。'],
    })
  })
})

describe('expandVersions', () => {
  it('一般版本：母條目＋版本欄位，再套用 _mod', () => {
    const vs = expandVersions({
      name: '侏儒',
      source: 'XPHB',
      speed: 30,
      entries: [{ name: '侏儒血系', entries: ['選一個'] }],
      _versions: [
        {
          name: '侏儒；岩侏儒血系',
          source: 'XPHB',
          additionalSpells: [{ known: { 1: ['修复术|xphb#c'] } }],
          _mod: { entries: { mode: 'replaceArr', replace: '侏儒血系', items: { name: '侏儒血系 (岩侏儒)', entries: ['x'] } } },
        },
      ],
    })
    expect(vs).toHaveLength(1)
    expect(vs[0]).toMatchObject({ name: '侏儒；岩侏儒血系', speed: 30, entries: [{ name: '侏儒血系 (岩侏儒)' }] })
    expect(vs[0]._versions).toBeUndefined()
  })

  it('模板版本：_abstract 代入每個 _implementations 的變數', () => {
    const vs = expandVersions({
      name: '龙裔',
      source: 'XPHB',
      entries: [{ name: '伤害抗性', entries: [] }],
      _versions: [
        {
          _abstract: {
            name: '龙裔 ({{color}})',
            source: 'XPHB',
            _mod: { entries: { mode: 'replaceArr', replace: '伤害抗性', items: { name: '伤害抗性', entries: ['{{damageType}}'] } } },
          },
          _implementations: [{ _variables: { color: '黑', damageType: '强酸' }, resist: ['强酸'] }],
        },
      ],
    })
    expect(vs[0]).toMatchObject({ name: '龙裔 (黑)', resist: ['强酸'], entries: [{ entries: ['强酸'] }] })
  })
})

describe('法術篩選索引（M5-1）', () => {
  it('成分、持續時間、射程、標籤整理成扁平欄位，空值不寫出', () => {
    const idx = spellIndex({
      level: 3,
      time: [{ number: 1, unit: 'action' }],
      range: { type: 'point', distance: { type: 'feet', amount: 150 } },
      components: { v: true, s: true, m: { text: '钻石', cost: 30000, consume: true } },
      duration: [{ type: 'timed', duration: { type: 'minute', amount: 10 }, concentration: true }],
      meta: { ritual: true },
      miscTags: ['SGT'],
      entriesHigherLevel: [{}],
      savingThrow: ['dexterity', '体质'],
      abilityCheck: ['智力'],
      damageInflict: ['fire'],
    })
    expect(idx).toEqual({
      time: ['action'],
      timeSort: 1,
      dur: '10minutes',
      durSort: 600,
      conc: true,
      ritual: true,
      comp: ['V', 'S', 'M', 'Mcost', 'Mconsume'],
      misc: ['SGT', 'SCL'],
      range: 'point',
      rangeSort: 1800,
      dmg: ['fire'],
      save: ['dex', 'con'],
      check: ['int'],
    })
  })

  it('射程分類與範圍形狀補標', () => {
    const r = (range: unknown) => spellIndex({ range, duration: [{ type: 'instant' }] })
    expect(r({ type: 'point', distance: { type: 'self' } }).range).toBe('self')
    expect(r({ type: 'point', distance: { type: 'touch' } }).range).toBe('touch')
    expect(r({ type: 'line', distance: { type: 'feet', amount: 100 } })).toMatchObject({ range: 'selfArea', area: ['L'] })
    expect(r({ type: 'special' }).range).toBe('special')
  })

  it('子職、種族、專長等來源只留白名單，子職存成緊湊字串', () => {
    const allowed = new Set(['phb', 'xphb', 'au'])
    const o = spellOrigins(
      {
        subclass: { XPHB: { 法师: { XPHB: { 塑能师: { name: '塑能师' } } } }, PHB: { 牧师: { PSA: { x: { name: 'x' } } } } },
        feat: { AU: { 塑能专家: true } },
        race: { ERLW: { '半身人 (医疗龙纹)': { baseName: '半身人' } } },
        reward: { MOT: { 信众: true } },
      },
      (s) => String(s).toUpperCase(),
      (s) => allowed.has(String(s).toLowerCase()),
    )
    expect(o).toEqual({ subclass: ['法师|XPHB|塑能师|XPHB'], feat: ['塑能专家|AU'] })
  })
})
