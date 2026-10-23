// M4-2：通用重印規則套用到真實資料
import { describe, expect, it } from 'vitest'
import { buildCharacter } from '@/rules/build'
import { classSpellList } from '@/rules/spells'
import { benchmarkLevel1 } from './benchmark'
import { hasRealData, realData } from './realData'

const KINDS = ['spell', 'race', 'background', 'feat', 'optionalfeature', 'item', 'class'] as const

describe.skipIf(!hasRealData)('重印（真實資料）', () => {
  it('official 下每一類都不會同時看到同一條目的新舊兩版', () => {
    const data = realData()
    for (const kind of KINDS) {
      const visible = data.list(kind).filter((e) => data.visible(e))
      const ids = new Set(visible.map((e) => e.id))
      const both = visible.filter((e) => e.reprintedAs?.some((id) => ids.has(id)))
      expect({ kind, both: both.map((e) => e.id) }).toEqual({ kind, both: [] })
    }
  })

  it('XGE → AU：AU 啟用時隱藏 XGE 版，關掉 AU 後 XGE 版回來', () => {
    const on = realData()
    const xge = on.list('spell').find((s) => s.source === 'XGE' && s.reprintedAs?.every((id) => id.endsWith('|AU')))!
    expect(xge).toBeTruthy()
    expect(on.visible(xge)).toBe(false)
    expect(on.supersededBy!(xge)?.source).toBe('AU')
    const off = realData({ enabled: ['XGE', 'XPHB', 'PHB'] })
    expect(off.visible(xge)).toBe(true)
  })

  it('法術選項不會同時出現新舊兩版；舊版仍可被選（selectable），由畫面隱藏', () => {
    const data = realData()
    const list = classSpellList(data, '法师', 0, 9)
    const legacy = list.filter((s) => data.supersededBy!(s))
    expect(legacy.length).toBeGreaterThan(0)
    for (const s of legacy) expect(list.some((x) => x.id === data.supersededBy!(s)!.id)).toBe(true)
  })

  it('存檔選了已被取代的條目：不自動移除，列入 legacyPicks', () => {
    const data = realData()
    const c = benchmarkLevel1(data)
    c.backgroundId = 'background|侍僧|PHB'
    const b = buildCharacter(c, data)
    expect(b.background?.id).toBe('background|侍僧|PHB')
    expect(b.legacyPicks).toContainEqual(
      expect.objectContaining({ where: 'background', entry: expect.objectContaining({ id: 'background|侍僧|PHB' }) }),
    )
    expect(b.legacyPicks.find((p) => p.where === 'background')!.newer.id).toBe('background|侍僧|XPHB')
  })
})
