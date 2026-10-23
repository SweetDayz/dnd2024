// M4-5：語言選擇（2024 規則：通用語＋兩種標準語言；稀有與其他語言需 DM 同意）
import { describe, expect, it } from 'vitest'
import { buildCharacter } from '@/rules/build'
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
    expect(s.options.find((o) => o.value === 'druidic')).toMatchObject({ group: '稀有', restricted: true })
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
})
