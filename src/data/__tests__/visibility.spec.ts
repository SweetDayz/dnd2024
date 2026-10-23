import { describe, expect, it } from 'vitest'
import type { Entry } from '../types'
import { isSelectable, isSuperseded, isVisible, splitLegacy, supersededBy, type FilterState } from '../visibility'

const entry = (source: string, extra: Partial<Entry> = {}): Entry => ({
  id: `race|X|${source}`,
  kind: 'race',
  name: 'X',
  source,
  edition: '2014',
  ...extra,
})
const state = (enabled: string[], o: Partial<FilterState> = {}): FilterState => ({
  enabled: new Set(enabled),
  showLegacy: false,
  tceOptional: false,
  ...o,
})

describe('visibility', () => {
  const legacy = entry('PHB', { reprintedAs: ['race|X|MPMM', 'race|X|XPHB'] })

  it('關閉的書，條目不顯示', () => {
    expect(isVisible(entry('PHB'), state(['XPHB']))).toBe(false)
    expect(isVisible(entry('PHB'), state(['PHB']))).toBe(true)
  })

  it('重印版的書啟用時，舊版預設隱藏；開關打開才顯示', () => {
    expect(isSuperseded(legacy, new Set(['PHB', 'XPHB']))).toBe(true)
    expect(isVisible(legacy, state(['PHB', 'XPHB']))).toBe(false)
    expect(isVisible(legacy, state(['PHB', 'XPHB'], { showLegacy: true }))).toBe(true)
  })

  it('重印版的書都沒啟用時，舊版照常顯示', () => {
    expect(isVisible(legacy, state(['PHB']))).toBe(true)
  })

  it('多個重印目標：任一個的書啟用就隱藏，supersededBy 回傳第一個啟用的', () => {
    expect(supersededBy(legacy, new Set(['PHB', 'XPHB']))).toBe('race|X|XPHB')
    expect(supersededBy(legacy, new Set(['PHB', 'MPMM', 'XPHB']))).toBe('race|X|MPMM')
    expect(isVisible(legacy, state(['PHB', 'MPMM']))).toBe(false)
  })

  it('目標條目不存在：建置期已從 reprintedAs 拿掉（見 pipeline 測試），條目照常顯示', () => {
    // 例如 法术卷轴|DMG → 法术卷轴|XPHB，XPHB 沒有這個物品 → reprintedAs 為空
    expect(isVisible(entry('DMG', { kind: 'item' }), state(['DMG', 'XPHB']))).toBe(true)
  })

  it('非 2014 的重印（XGE → AU）', () => {
    const sp = entry('XGE', { kind: 'spell', id: 'spell|负能量洪流|XGE', reprintedAs: ['spell|负能量洪流|AU'] })
    expect(isVisible(sp, state(['XGE', 'AU']))).toBe(false)
    expect(isVisible(sp, state(['XGE']))).toBe(true)
  })

  it('TCE 可選規則預設隱藏', () => {
    const tce = entry('TCE', { tceOptional: true })
    expect(isVisible(tce, state(['TCE']))).toBe(false)
    expect(isVisible(tce, state(['TCE'], { tceOptional: true }))).toBe(true)
  })

  it('isSelectable 不看重印規則', () => {
    expect(isSelectable(legacy, state(['PHB', 'XPHB']))).toBe(true)
    expect(isSelectable(legacy, state(['XPHB']))).toBe(false)
  })

  it('splitLegacy：回報隱藏數量，reveal 時暫時顯示（不改全域設定）', () => {
    const list = [legacy, entry('XPHB'), entry('TCE', { tceOptional: true })]
    const f = state(['PHB', 'XPHB', 'TCE'])
    expect(splitLegacy(list, f)).toEqual({ shown: [list[1]], hidden: 1 })
    expect(splitLegacy(list, f, true)).toEqual({ shown: [list[0], list[1]], hidden: 1 })
    expect(splitLegacy(list, { ...f, showLegacy: true })).toEqual({ shown: [list[0], list[1]], hidden: 0 })
  })
})
