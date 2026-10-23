// 屬性值第四種方法：使用者自填（不檢查總和，審卡報告提示 DM）。
import { describe, expect, it } from 'vitest'
import { buildReviewModel } from '@/export/review'
import { abilityBreakdown } from '@/rules/abilityBreakdown'
import { buildCharacter } from '@/rules/build'
import { exportCharacter, importCharacter } from '@/rules/character'
import type { RulesData } from '@/rules/data'
import { deriveSheet } from '@/rules/derive'
import { benchmarkLevel1 } from './benchmark'
import { hasRealData, realData } from './realData'

/** 不是任何標準組合的數字（總和 88，遠超點數購買） */
const MANUAL = { str: 18, dex: 17, con: 16, int: 9, wis: 8, cha: 20 }

describe.skipIf(!hasRealData)('自填屬性值', () => {
  const data = hasRealData ? realData() : (undefined as unknown as RulesData)
  const manual = () => {
    const c = benchmarkLevel1(data)
    c.abilityMethod = 'manual'
    c.baseScores = { ...MANUAL }
    return c
  }

  it('自填值進入計算，背景加值照常（侍僧感知 +2、智力 +1），不出現陣列或點數警示', () => {
    const c = manual()
    const b = buildCharacter(c, data)
    const s = deriveSheet(c, b, data)
    expect([s.abilities.str.score, s.abilities.wis.score, s.abilities.int.score, s.abilities.cha.score]).toEqual([18, 10, 10, 20])
    expect(s.abilities.cha.mod).toBe(5)
    const br = abilityBreakdown(c, b)
    expect(br.warnings).toEqual([])
    expect(br.abilities.wis.text.startsWith('8（自填）')).toBe(true)
  })

  it('匯出再匯入完全相同', () => {
    const c = manual()
    const json = exportCharacter(c)
    const back = importCharacter(json)
    expect(back.abilityMethod).toBe('manual')
    expect(back.baseScores).toEqual(MANUAL)
    expect(exportCharacter(back)).toBe(json)
  })

  it('審卡報告：方法顯示「自填」，警示區提示 DM', () => {
    const c = manual()
    const b = buildCharacter(c, data)
    const model = buildReviewModel({
      character: c,
      build: b,
      sheet: deriveSheet(c, b, data),
      data,
      spells: [],
      casting: [],
      attacks: [],
      effects: [],
      sources: [],
      filter: { enabled: ['XPHB'], showLegacy: false, tceOptional: false },
      appVersion: '0.0.0',
      exportedAt: new Date(2026, 9, 24),
    })
    expect(model.warnings.some((w) => w.kind === '屬性值' && w.text.includes('屬性值為自填'))).toBe(true)
    expect(JSON.stringify(model)).toContain('自填')
  })
})
