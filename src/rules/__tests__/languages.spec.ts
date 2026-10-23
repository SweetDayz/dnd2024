// M4-5：語言選擇（2024 規則：通用語＋兩種標準語言；稀有與其他語言需 DM 同意）
import { describe, expect, it } from 'vitest'
import { filterLanguages, languageDefaults, sortLanguages } from '@/data/languageTable'
import { buildCharacter } from '@/rules/build'
import { languageRowOf, languageRows, languageType } from '@/rules/data'
import { newCharacter } from '@/rules/character'
import { benchmarkLevel1 } from './benchmark'
import { hasRealData, realData } from './realData'

describe.skipIf(!hasRealData)('語言', () => {
  const data = hasRealData ? realData() : undefined!
  const slot = () => buildCharacter(benchmarkLevel1(data), data).slots.find((s) => s.key === 'base:languages')!

  it('標準語言：XPHB 標準語言表在前，也包含其他啟用書目（FRHoF）的標準語言', () => {
    const std = slot().options.filter((o) => !o.restricted)
    expect(std.every((o) => o.group === '標準')).toBe(true)
    expect(std.slice(0, 9).every((o) => o.entry?.source === 'XPHB')).toBe(true)
    expect(std.map((o) => o.value)).toContain('common sign language')
    expect(std.some((o) => o.entry?.source === 'FRHoF')).toBe(true)
    expect(std.map((o) => o.value)).not.toContain('common')
  })

  it('稀有與其他語言標示為受限，依資料的 type 分組（沒有 type 歸為「其他」）', () => {
    const s = slot()
    const groups = [...new Set(s.options.filter((o) => o.restricted).map((o) => o.group))]
    expect(groups).toEqual(expect.arrayContaining(['稀有', '其他']))
    expect(s.options.find((o) => o.value === 'abyssal')).toMatchObject({ group: '稀有', restricted: true })
    expect(s.restrictedToggle).toContain('需 DM 同意')
    // 每個選項都有條目（來源徽章）
    expect(s.options.every((o) => o.entry)).toBe(true)
  })

  it('職業特性給的語言（德魯伊語、盜賊黑話）自動學會，不佔選擇名額', () => {
    for (const [cls, lang] of [
      ['class|德鲁伊|XPHB', 'druidic'],
      ['class|游荡者|XPHB', "thieves' cant"],
    ] as const) {
      const c = newCharacter()
      c.levels = [{ classId: cls, hp: { mode: 'average' } }]
      const b = buildCharacter(c, data)
      expect(b.profs.filter((p) => p.type === 'language').map((p) => p.value)).toContain(lang)
      expect(b.profs.find((p) => p.value === lang)?.slotKey).toBeUndefined()
      expect(b.slots.find((s) => s.key === 'base:languages')!.count).toBe(2)
    }
  })

  it('M7-6 類型分組：2014 異域與 2024 稀有同一組；沒有 type 歸「其他」', () => {
    expect(languageType({ type: 'exotic' } as never)).toBe('rare')
    expect(languageType({ type: 'rare' } as never)).toBe('rare')
    expect(languageType({} as never)).toBe('other')
    const rows = languageRows(data)
    expect(new Set(rows.map((r) => r.type))).toEqual(new Set(['standard', 'rare', 'secret', 'other']))
    expect(languageRowOf(data, 'abyssal')!.type).toBe('rare')
    expect(languageRowOf(data, 'dwarvish')!.type).toBe('standard')
  })

  it('M7-6 秘密語言（德魯伊語、盜賊黑話）不能自選：XPHB 標 rare，但其他版本標 secret', () => {
    for (const k of ['druidic', "thieves' cant"]) {
      expect(languageRowOf(data, k)).toMatchObject({ type: 'secret' })
      expect(languageRowOf(data, k)!.entry.source).toBe('XPHB')
    }
    const values = slot().options.map((o) => o.value)
    expect(values).not.toContain('druidic')
    expect(values).not.toContain("thieves' cant")
  })

  it('M7-6 重複條目合併成一列：key 不變、列出所有可見來源，代表條目是 XPHB', () => {
    const rows = languageRows(data)
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length)
    const dw = languageRowOf(data, 'dwarvish')!
    expect(dw.entry.id).toBe('language|矮人语|XPHB')
    expect(dw.versions.map((v) => v.source)).toEqual(expect.arrayContaining(['XPHB', 'ERLW']))
    // XPHB 沒有 script 欄位，取其他版本的
    expect(dw.script).toBe('矮人语')
    expect(dw.speakers).toBe('矮人')
    // 存檔用的鍵與規則引擎一致
    expect(slot().options.find((o) => o.value === 'dwarvish')!.entry!.id).toBe(dw.entry.id)
  })

  it('M7-6 篩選與排序：只留「標準」就沒有稀有語言；依類型排序標準在前', () => {
    const rows = languageRows(data)
    const std = filterLanguages(rows, { type: { mode: 'or', tags: { standard: 1 } } })
    expect(std.length).toBeGreaterThan(5)
    expect(std.every((r) => r.type === 'standard')).toBe(true)
    const noSecret = filterLanguages(rows, { type: { mode: 'or', tags: { secret: -1 } } })
    expect(noSecret.some((r) => r.type === 'secret')).toBe(false)
    const sorted = sortLanguages(rows, { key: 'type', dir: 1 })
    expect(sorted[0]!.type).toBe('standard')
    expect(sorted[sorted.length - 1]!.type).toBe('other')
    expect(sortLanguages(rows, { key: 'type', dir: -1 })[0]!.type).toBe('other')
    // 來源預設＝啟用的書目；搜尋縮寫也找得到
    expect(filterLanguages(rows, languageDefaults(['ERLW'])).every((r) => r.versions.some((v) => v.source === 'ERLW'))).toBe(true)
    expect(filterLanguages(rows, {}, 'Dwarvish').map((r) => r.key)).toEqual(['dwarvish'])
  })
})
