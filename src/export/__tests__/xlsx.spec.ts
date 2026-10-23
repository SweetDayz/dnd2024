import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { entriesToText } from '@/data/text'
import type { SourceInfo } from '@/data/types'
import { ABILITIES, type Ability } from '@/rules/abilities'
import { buildCharacter } from '@/rules/build'
import { deriveSheet } from '@/rules/derive'
import { detectEffects } from '@/rules/effects'
import { attackRows } from '@/rules/equipment'
import { classCastings, spellcastingStats, spellRows } from '@/rules/spells'
import { benchmarkLevel, withStartingEquipment } from '@/rules/__tests__/benchmark'
import { hasRealData, readRegistered, realData } from '@/rules/__tests__/realData'
import { exportFileName, exportTables, type DataMeta } from '../sheetData'
import { buildWorkbook } from '../xlsx'

describe('exportFileName', () => {
  it('替換不合法字元、補日期與等級', () => {
    expect(exportFileName('A/B:C*?', 20, new Date(2026, 9, 3))).toBe('A_B_C___Lv20_2026-10-03.xlsx')
    expect(exportFileName('  ', 1, new Date(2026, 0, 1))).toBe('未命名_Lv1_2026-01-01.xlsx')
  })
})

describe('entriesToText', () => {
  it('段落、清單、表格、標籤都轉成純文字', () => {
    const text = entriesToText([
      '造成 {@damage 1d6} 点{@b 火焰}伤害',
      { type: 'entries', name: '小标题', entries: ['内文'] },
      { type: 'list', items: ['甲', { type: 'item', name: '乙', entry: '{@spell 火球术|XPHB}' }] },
      { type: 'table', colLabels: ['d6', '结果'], rows: [['1', '{@condition 目盲|XPHB}']] },
    ])
    expect(text).toBe('造成 1d6 点火焰伤害\n小标题：内文\n・甲\n・乙：火球术\nd6｜结果\n1｜目盲')
  })
})

describe.skipIf(!hasRealData)('xlsx 匯出（基準角色 20 級，寫出再讀回）', async () => {
  const data = realData()
  const c = withStartingEquipment(benchmarkLevel(data, 20), data)
  const b = buildCharacter(c, data)
  const s = deriveSheet(c, b, data)
  const mods = Object.fromEntries(ABILITIES.map((a) => [a, s.abilities[a].mod])) as Record<Ability, number>
  const spells = spellRows(b, data, mods, s.profBonus, s.level)
  const tables = exportTables({
    character: c,
    build: b,
    sheet: s,
    data,
    spells,
    casting: spellcastingStats(classCastings(b.classes, mods, data), mods, s.profBonus),
    attacks: attackRows(data, c, b, s, spells),
    effects: detectEffects(b, data),
    sources: readRegistered<SourceInfo[]>('sources') ?? [],
    filter: { groupLabel: '官方', enabled: ['XPHB', 'TCE'], showLegacy: false, tceOptional: false },
    meta: readRegistered<DataMeta>('meta'),
    appVersion: '0.0.0',
    exportedAt: new Date(2026, 9, 23),
  })
  const buf = await buildWorkbook(ExcelJS, tables).xlsx.writeBuffer()
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf as ArrayBuffer)
  const sheet = (name: string) => wb.getWorksheet(name)!
  const values = (name: string) => {
    const out: string[][] = []
    sheet(name).eachRow((r) => out.push((r.values as unknown[]).slice(1).map((v) => String(v ?? ''))))
    return out
  }

  it('八張工作表，順序固定', () => {
    expect(wb.worksheets.map((w) => w.name)).toEqual(['摘要', '動作', '法術', '物品', '特性與特質', '效果', '背景', '關於'])
  })

  it('標題列粗體、凍結；摘要與關於以外最右欄是空白「備註」', () => {
    for (const ws of wb.worksheets) {
      expect(ws.getRow(1).getCell(1).font?.bold).toBe(true)
      expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 })
      const header = values(ws.name)[0]!
      const plain = ws.name === '摘要' || ws.name === '關於'
      expect({ sheet: ws.name, note: header[header.length - 1] === '備註', source: header.includes('來源') }).toEqual({
        sheet: ws.name,
        note: !plain,
        source: !plain,
      })
    }
  })

  it('列數與資料一致', () => {
    for (const t of tables) expect(sheet(t.name).rowCount).toBe(t.rows.length + 1)
    expect(tables.find((t) => t.name === '法術')!.rows.length).toBe(spells.length)
  })

  it('關鍵數值：法術 DC 17、AC、HP、等級', () => {
    const rows = values('摘要')
    const find = (item: string) => rows.find((r) => r[1]!.startsWith(item))
    expect(find('法师法術豁免 DC')?.[2]).toBe('17')
    expect(find('總等級')?.[2]).toBe('20')
    expect(find('護甲等級 AC')?.[2]).toBe(String(s.ac.value))
    expect(find('HP 上限')?.[2]).toBe(String(s.hp.max))
    expect(values('法術').some((r) => r[1] === '魔法飞弹')).toBe(true)
  })

  it('關於：上游 commit 與書目', () => {
    const rows = values('關於')
    expect(rows.find((r) => r[0] === '上游資料 commit')?.[1]).toMatch(/^[0-9a-f]{40}$/)
    expect(rows.filter((r) => r[0] === '啟用書目').map((r) => r[1]!.split('｜')[0])).toEqual(['XPHB', 'TCE'])
  })

  it('所有儲存格都沒有殘留 {@ 標籤', () => {
    const bad: string[] = []
    for (const ws of wb.worksheets) {
      ws.eachRow((r) =>
        r.eachCell((cell) => {
          if (String(cell.value ?? '').includes('{@')) bad.push(`${ws.name}!${cell.address}`)
        }),
      )
    }
    expect(bad).toEqual([])
  })
})
