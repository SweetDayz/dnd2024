import { describe, expect, it } from 'vitest'
import type { Entry } from '../types'
import { isSuperseded, isVisible, type FilterState } from '../visibility'

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

  it('TCE 可選規則預設隱藏', () => {
    const tce = entry('TCE', { tceOptional: true })
    expect(isVisible(tce, state(['TCE']))).toBe(false)
    expect(isVisible(tce, state(['TCE'], { tceOptional: true }))).toBe(true)
  })
})
