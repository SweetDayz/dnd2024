// M4-1：顯示縮寫只改畫面，條目 id 與存檔格式仍用原始代碼（XPHB）。M4 之前匯出的存檔要能照常載入。
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildCharacter } from '@/rules/build'
import { importCharacter } from '@/rules/character'
import { deriveSheet } from '@/rules/derive'
import { hasRealData, realData } from './realData'

const json = readFileSync(resolve(__dirname, 'fixtures/save-pre-m4.json'), 'utf8')

describe('M4 之前的存檔', () => {
  it('id 仍是原始代碼', () => {
    const c = importCharacter(json)
    expect(c.raceId).toBe('race|侏儒|XPHB')
    expect(c.backgroundId).toBe('background|侍僧|XPHB')
    expect(c.levels[0]!.classId).toBe('class|法师|XPHB')
  })

  it.skipIf(!hasRealData)('可正常建角，數值與 DDB 基準相同', () => {
    const data = realData()
    const c = importCharacter(json)
    const b = buildCharacter(c, data)
    expect(b.race?.id).toBe('race|侏儒；岩侏儒血系|XPHB')
    expect(b.background?.id).toBe('background|侍僧|XPHB')
    const s = deriveSheet(c, b, data)
    expect(s.level).toBe(20)
    expect(s.profBonus).toBe(6)
    expect(s.abilities.int.score).toBe(16) // 15 標準陣列 ＋1 侍僧；ASI 未選（同 DDB）
    expect(c.inventory.length).toBeGreaterThan(0)
    // 沒有任何已選項目因為 id 對不上而遺失
    expect(b.notes.filter((n) => n.text.includes('找不到'))).toEqual([])
    expect(b.slots.flatMap((x) => x.warnings).filter((w) => w.includes('目前不可用'))).toEqual([])
  })
})
