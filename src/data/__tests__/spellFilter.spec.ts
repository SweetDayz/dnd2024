import { describe, expect, it } from 'vitest'
import {
  availableTags,
  clearGroup,
  cycleTag,
  defaultFilterState,
  filterSpells,
  makeFacetCache,
  matchGroup,
  selectAll,
  sortSpells,
  spellFacets,
  tagLabel,
  toggleMode,
  type FacetContext,
} from '@/data/spellFilter'
import type { Entry } from '@/data/types'
import { classSpellList } from '@/rules/spells'
import { hasRealData, realData } from '@/rules/__tests__/realData'

const sp = (name: string, level: number, extra: Partial<Entry> = {}): Entry => ({
  id: `spell|${name}|XPHB`,
  kind: 'spell',
  name,
  engName: name.toUpperCase(),
  source: 'XPHB',
  edition: '2024',
  level,
  school: 'V',
  idx: { timeSort: 1, dur: 'instant', durSort: 0, range: 'point', rangeSort: 1200, comp: ['V', 'S'] },
  ...extra,
})

const ctx: FacetContext = { tceOptional: false, sourceEnabled: (s) => s !== 'TCE', superseded: (e) => !!e.reprintedAs }

const FIREBALL = sp('火球术', 3, {
  engName: 'Fireball',
  idx: { time: ['action'], timeSort: 1, dur: 'instant', durSort: 0, range: 'point', rangeSort: 1800, comp: ['V', 'S', 'M'], dmg: ['fire'], save: ['dex'], area: ['S'] },
  classes: [
    { className: '法师', classSource: 'XPHB' },
    { className: '术士', classSource: 'XPHB' },
  ],
})
const SHIELD = sp('护盾术', 1, {
  engName: 'Shield',
  idx: { time: ['reaction'], timeSort: 3, dur: 'round', durSort: 6, range: 'point', rangeSort: 0, comp: ['V', 'S', 'M'], misc: ['MAC'] },
  classes: [{ className: '法师', classSource: 'XPHB' }],
})
const DETECT = sp('侦测魔法', 1, {
  engName: 'Detect Magic',
  idx: { time: ['action'], timeSort: 1, dur: '10minutes', durSort: 600, range: 'point', rangeSort: 0, conc: true, ritual: true, comp: ['V', 'S'] },
  classes: [
    { className: '法师', classSource: 'XPHB' },
    { className: '牧师', classSource: 'XPHB', definedIn: ['TCE'], tceOptional: true },
  ],
})
const OLD = sp('火球术', 3, { engName: 'Fireball', id: 'spell|火球术|PHB', source: 'PHB', edition: '2014', reprintedAs: ['spell|火球术|XPHB'] })
const ALL = [FIREBALL, SHIELD, DETECT, OLD]
const facets = makeFacetCache(ctx)

describe('三態篩選與 AND／OR', () => {
  it('包含：OR 符合其一、AND 全部符合', () => {
    expect(matchGroup(['V', 'S'], { mode: 'or', tags: { V: 1, M: 1 } })).toBe(true)
    expect(matchGroup(['V', 'S'], { mode: 'and', tags: { V: 1, M: 1 } })).toBe(false)
    expect(matchGroup(['V', 'S', 'M'], { mode: 'and', tags: { V: 1, M: 1 } })).toBe(true)
  })

  it('排除：只要符合一個就淘汰，兩種模式都一樣', () => {
    expect(matchGroup(['V', 'S'], { mode: 'or', tags: { S: -1 } })).toBe(false)
    expect(matchGroup(['V', 'S'], { mode: 'and', tags: { V: 1, S: -1 } })).toBe(false)
    expect(matchGroup(['V'], { mode: 'and', tags: { V: 1, S: -1 } })).toBe(true)
  })

  it('不限類型（*）：任何包含都符合、任何排除都淘汰', () => {
    expect(matchGroup(['*'], { mode: 'or', tags: { 龙: 1 } })).toBe(true)
    expect(matchGroup(['*'], { mode: 'or', tags: { 龙: -1 } })).toBe(false)
  })

  it('點擊循環：不篩選 → 包含 → 排除 → 不篩選；全選、清除、切換模式', () => {
    let g = cycleTag(undefined, 'V')
    expect(g.tags).toEqual({ V: 1 })
    g = cycleTag(g, 'V')
    expect(g.tags).toEqual({ V: -1 })
    g = cycleTag(g, 'V')
    expect(g.tags).toEqual({})
    expect(selectAll(g, ['V', 'S']).tags).toEqual({ V: 1, S: 1 })
    expect(toggleMode(g).mode).toBe('and')
    expect(clearGroup(toggleMode(selectAll(g, ['V'])))).toEqual({ mode: 'and', tags: {} })
  })

  it('群組之間是 AND', () => {
    const r = filterSpells(ALL, { level: { mode: 'or', tags: { '1': 1 } }, misc: { mode: 'or', tags: { ritual: 1 } } }, facets)
    expect(r.map((s) => s.name)).toEqual(['侦测魔法'])
  })
})

describe('facets', () => {
  it('成分與雜項含專注、儀式、成分、重印', () => {
    expect(spellFacets(DETECT, ctx).misc).toEqual(['conc', 'ritual', 'V', 'S'])
    expect(spellFacets(OLD, ctx).misc).toContain('reprinted')
  })

  it('職業：TCE 擴充表只在開關開啟時列入', () => {
    expect(spellFacets(DETECT, ctx).class).toEqual(['法师|XPHB'])
    const on = { ...ctx, tceOptional: true, sourceEnabled: () => true }
    expect(spellFacets(DETECT, on).class).toEqual(['法师|XPHB', '牧师|XPHB'])
  })

  it('沒寫生物類型＝不限', () => {
    expect(spellFacets(FIREBALL, ctx).creature).toEqual(['*'])
  })
})

describe('預設篩選', () => {
  it('來源＝啟用的書目；重印＝排除；其餘不篩選', () => {
    const st = defaultFilterState({ enabledSources: ['XPHB', 'PHB'], showLegacy: false })
    expect(st).toEqual({ source: { mode: 'or', tags: { XPHB: 1, PHB: 1 } }, misc: { mode: 'or', tags: { reprinted: -1 } } })
    expect(filterSpells(ALL, st, facets).map((s) => s.id)).not.toContain('spell|火球术|PHB')
  })

  it('全域顯示舊版時不排除重印', () => {
    const st = defaultFilterState({ enabledSources: ['XPHB', 'PHB'], showLegacy: true })
    expect(st.misc).toBeUndefined()
    expect(filterSpells(ALL, st, facets)).toHaveLength(4)
  })

  it('只啟用 XPHB 時，PHB 法術被來源篩掉', () => {
    const st = defaultFilterState({ enabledSources: ['XPHB'], showLegacy: true })
    expect(filterSpells(ALL, st, facets).map((s) => s.source)).toEqual(['XPHB', 'XPHB', 'XPHB'])
  })
})

describe('文字搜尋', () => {
  it('比對中文名與英文名，不保留不符合的項目', () => {
    expect(filterSpells(ALL, {}, facets, 'fire').map((s) => s.id)).toEqual(['spell|火球术|XPHB', 'spell|火球术|PHB'])
    expect(filterSpells(ALL, {}, facets, '护盾').map((s) => s.name)).toEqual(['护盾术'])
  })
})

describe('可用標籤與顯示名稱', () => {
  it('固定群組照上游順序，只列候選範圍內出現的', () => {
    expect(availableTags('level', ALL, facets)).toEqual(['1', '3'])
    expect(availableTags('misc', ALL, facets)).toEqual(['conc', 'ritual', 'V', 'S', 'M', 'reprinted', 'MAC'])
  })

  it('標籤名稱', () => {
    expect(tagLabel('source', 'XPHB')).toBe('PHB24')
    expect(tagLabel('level', '0')).toBe('戲法')
    expect(tagLabel('class', '法师|XPHB')).toBe('法师（PHB24）')
    expect(tagLabel('subclass', '法师|XPHB|塑能师|XPHB')).toBe('法师（PHB24）：塑能师')
    expect(tagLabel('save', 'dex')).toBe('敏捷')
    expect(tagLabel('school', 'V')).toBe('塑能 (Evocation)')
  })
})

describe('排序', () => {
  it('預設依環階、再依名稱', () => {
    expect(sortSpells([FIREBALL, SHIELD, DETECT]).map((s) => s.engName)).toEqual(['Detect Magic', 'Shield', 'Fireball'])
  })
  it('依施法時間、射程，反向', () => {
    expect(sortSpells([FIREBALL, SHIELD, DETECT], { key: 'time', dir: 1 }).map((s) => s.engName)).toEqual(['Detect Magic', 'Fireball', 'Shield'])
    expect(sortSpells([FIREBALL, SHIELD, DETECT], { key: 'range', dir: -1 }).map((s) => s.engName)).toEqual(['Fireball', 'Detect Magic', 'Shield'])
  })
})

describe.skipIf(!hasRealData)('真實資料', () => {
  const data = realData()
  const rctx: FacetContext = { tceOptional: false, sourceEnabled: data.sourceEnabled, superseded: (e) => !!data.supersededBy!(e) }

  it('選擇欄位的限制優先：法術書候選＝法師清單 1–1 環，篩選 3 環只會得到空集合', () => {
    const book = classSpellList(data, '法师', 1, 1)
    expect(book.length).toBeGreaterThan(10)
    const f = makeFacetCache(rctx)
    expect(filterSpells(book, { level: { mode: 'or', tags: { '3': 1 } } }, f)).toEqual([])
    const ritual = filterSpells(book, { misc: { mode: 'or', tags: { ritual: 1 } } }, f)
    expect(ritual.length).toBeGreaterThan(0)
    expect(ritual.every((s) => book.includes(s))).toBe(true)
  })

  it('效能：全部法術套用多個篩選＋排序在 50ms 以內', () => {
    const all = data.list('spell')
    const f = makeFacetCache(rctx)
    all.forEach(f) // 第一次建立 facets 快取（畫面上在書目改變時做一次）
    const st = {
      ...defaultFilterState({ enabledSources: [...new Set(all.map((s) => s.source))], showLegacy: false }),
      level: { mode: 'or' as const, tags: { '1': 1 as const, '2': 1 as const, '3': 1 as const } },
      school: { mode: 'or' as const, tags: { N: -1 as const } },
      misc: { mode: 'and' as const, tags: { V: 1 as const, reprinted: -1 as const } },
      damage: { mode: 'or' as const, tags: { fire: 1 as const, cold: 1 as const, force: 1 as const } },
    }
    const t0 = performance.now()
    for (let i = 0; i < 5; i++) sortSpells(filterSpells(all, st, f, 'a'), { key: 'range', dir: -1 })
    const ms = (performance.now() - t0) / 5
    expect(ms).toBeLessThan(50)
  })
})
