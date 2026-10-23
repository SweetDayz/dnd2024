import { describe, expect, it } from 'vitest'
import type { SourceInfo } from '@/data/types'
import { ABILITIES, type Ability } from '@/rules/abilities'
import { buildCharacter } from '@/rules/build'
import { importCharacter, type Character } from '@/rules/character'
import { deriveSheet } from '@/rules/derive'
import { detectEffects } from '@/rules/effects'
import { attackRows } from '@/rules/equipment'
import type { RulesData } from '@/rules/data'
import { classCastings, spellcastingStats, spellRows } from '@/rules/spells'
import { benchmarkLevel, benchmarkLevel1, withStartingEquipment } from '@/rules/__tests__/benchmark'
import { hasRealData, readRegistered, realData } from '@/rules/__tests__/realData'
import { buildReviewModel, reviewFileName } from '../review'
import { SECTION_TITLES, esc, renderReviewHtml } from '../reviewHtml'
import type { DataMeta } from '../sheetData'

describe('esc／reviewFileName', () => {
  it('HTML escape 五個特殊字元', () => {
    expect(esc(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;')
  })
  it('檔名：<角色名>_Lv<總等級>_審卡_<日期>.html，不合法字元換成底線', () => {
    expect(reviewFileName('A/B:C*?', 20, new Date(2026, 9, 3))).toBe('A_B_C___Lv20_審卡_2026-10-03.html')
    expect(reviewFileName('<script>', 1, new Date(2026, 0, 1))).toBe('_script__Lv1_審卡_2026-01-01.html')
    expect(reviewFileName('', 3, new Date(2026, 0, 1))).toBe('未命名_Lv3_審卡_2026-01-01.html')
  })
})

describe('匯入審卡報告 HTML', () => {
  it('沒有嵌入存檔的 HTML：明確的錯誤訊息', () => {
    expect(() => importCharacter('<!doctype html><p>hi</p>')).toThrow('沒有角色存檔')
  })
})

function report(c: Character, data: RulesData) {
  const b = buildCharacter(c, data)
  const s = deriveSheet(c, b, data)
  const mods = Object.fromEntries(ABILITIES.map((a) => [a, s.abilities[a].mod])) as Record<Ability, number>
  const spells = spellRows(b, data, mods, s.profBonus, s.level)
  const model = buildReviewModel({
    character: c,
    build: b,
    sheet: s,
    data,
    spells,
    casting: spellcastingStats(classCastings(b.classes, mods, data), mods, s.profBonus),
    attacks: attackRows(data, c, b, s, spells),
    effects: detectEffects(b, data),
    sources: readRegistered<SourceInfo[]>('sources') ?? [],
    filter: { groupLabel: '官方', enabled: ['XPHB', 'PHB', 'TCE'], showLegacy: false, tceOptional: true },
    meta: readRegistered<DataMeta>('meta'),
    appVersion: '0.0.0',
    exportedAt: new Date(2026, 9, 23, 9, 30),
  })
  return { model, html: renderReviewHtml(model), b, s }
}

describe.skipIf(!hasRealData)('審卡報告（基準角色 20 級）', () => {
  const data = realData()
  const c = withStartingEquipment(benchmarkLevel(data, 20), data)
  c.name = '<script>alert("x")</script>侏儒'
  const { model, html, s } = report(c, data)

  it('含法術 DC 17 與所有段落標題，警示區在最前面', () => {
    expect(html).toContain('法师法術 DC／攻擊</th><td>17／+9（智力）')
    expect(html).toContain('DC 17')
    const pos = SECTION_TITLES.map((t) => html.indexOf(`</span>${t}</h2>`))
    expect(pos.every((p) => p > 0)).toBe(true)
    expect([...pos].sort((a, b) => a - b)).toEqual(pos)
  })

  it('沒有殘留 {@ 標籤', () => {
    expect(html).not.toContain('{@')
  })

  it('使用者輸入都經過 escape；只有一個 script 元素（不可執行的 JSON 存檔）', () => {
    expect(html).not.toContain('<script>alert')
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;侏儒')
    expect(html.match(/<script/g)).toHaveLength(1)
    expect(html).toContain('<script type="application/json" id="dnd2024-character">')
  })

  it('不連網：沒有外部資源', () => {
    expect(html).not.toMatch(/(src|href)="(https?:)?\/\//)
    expect(html).not.toMatch(/@import|url\(/)
  })

  it('警示區：未選的 ASI 與傳奇恩惠、法術書未滿', () => {
    const pending = model.warnings.filter((w) => w.kind === '未完成的選擇').map((w) => w.text)
    expect(pending.some((t) => t.startsWith('4 級') && t.includes('屬性值提升或通用專長'))).toBe(true)
    expect(pending.some((t) => t.includes('法術書'))).toBe(true)
    expect(model.warnings.some((w) => w.kind === '手動覆寫')).toBe(false)
  })

  it('逐級表 20 列，1 級 HP 取最大值，3 級選了塑能師並附來源', () => {
    expect(model.levels).toHaveLength(20)
    expect(model.levels[0]!.hp).toBe('d6 最大值 6+2（體質）')
    expect(model.levels[1]!.hp).toBe('d6 取平均 4+2（體質）')
    const sub = model.levels[2]!.choices.find((x) => x.label.endsWith('法师子职'))!
    expect(sub.values[0]).toMatchObject({ text: expect.stringContaining('塑能师'), src: { text: 'PHB24 p.174' } })
  })

  it('摘要、書目（縮寫＋中文書名）、上游 commit', () => {
    expect(model.summary).toContainEqual(['AC', String(s.ac.value)])
    expect(model.books[0]).toMatchObject({ abbr: 'PHB24', code: 'XPHB' })
    expect(model.books[0]!.name).not.toBe('')
    expect(model.settings.find(([k]) => k === '上游資料 commit')![1]).toMatch(/^[0-9a-f]{40}$/)
  })

  it('屬性明細：標準陣列＋侍僧加值附來源', () => {
    const wis = model.abilities.rows.find((r) => r.name.startsWith('感知'))!
    expect(model.abilities.method).toBe('標準陣列')
    expect(wis).toMatchObject({ base: '13', score: 15 })
    expect(wis.bonuses[0]).toMatchObject({ text: '+2 背景：侍僧', src: { text: 'PHB24 p.178' } })
  })

  it('法術依來源分組：法師用智力、魔法學徒用感知', () => {
    const wiz = model.spells.find((g) => g.label === '法师')!
    expect(wiz).toMatchObject({ ability: '智力', dc: '17', attack: '+9' })
    const mi = model.spells.find((g) => g.label.startsWith('魔法学徒'))!
    expect(mi.ability).toBe('感知')
    expect(model.spells.flatMap((g) => g.rows).every((r) => /p\.\d+$/.test(r.src.text))).toBe(true)
  })

  it('熟練、裝備與效果都有來源', () => {
    const skills = model.profs.find((p) => p.category === '技能')!.items
    expect(skills.length).toBeGreaterThan(0)
    expect(skills.every((i) => i.src)).toBe(true)
    expect(model.equipment.picks[0]).toMatchObject({ text: expect.stringMatching(/^起始裝備（法师）：\(A\) 匕首 ×2/), src: { text: 'PHB24 p.164' } })
    expect(model.effects.some((e) => e.title.startsWith('侏儒狡黠') && e.src.text === 'PHB24 p.191')).toBe(true)
  })

  it('嵌入的存檔可以直接匯入，且與原角色相同', () => {
    const back = importCharacter(html)
    expect(back).toEqual(c)
  })
})

describe.skipIf(!hasRealData)('審卡報告：警示區', () => {
  it('手動覆寫、TCE 可選規則、重印舊版、2014 相容規則、擲骰紀錄', () => {
    const data = realData({ tceOptional: true })
    const c = benchmarkLevel1(data)
    c.raceId = 'race|定制血统|TCE'
    c.backgroundId = 'background|侍僧|PHB'
    c.overrides.ac = 15
    c.levels[0]!.hp = { mode: 'average' }
    c.rollLog.push(
      { kind: 'gold', label: '起始金幣（5d4 × 10）', dice: [1, 1, 1, 1, 1], total: 50, at: '2026-10-23T01:00:00.000Z' },
      { kind: 'gold', label: '起始金幣（5d4 × 10）', dice: [4, 4, 4, 4, 4], total: 200, at: '2026-10-23T01:01:00.000Z' },
    )
    const { model, html } = report(c, data)
    const kinds = new Set(model.warnings.map((w) => w.kind))
    expect(kinds).toEqual(new Set(['手動覆寫', '未完成的選擇', 'TCE 可選規則', '重印舊版', '2014 相容規則']))
    expect(model.warnings.find((w) => w.kind === '手動覆寫')!.text).toMatch(/^AC：自動計算 \d+，手動改為 15$/)
    expect(model.warnings.find((w) => w.kind === 'TCE 可選規則')).toMatchObject({ src: { text: 'TCE p.8' } })
    expect(model.warnings.find((w) => w.kind === '重印舊版')!.text).toContain('已有新版：侍僧')
    expect(model.summary).toContainEqual(['AC', '15（手動覆寫）'])
    expect(model.equipment.goldRolls.map((r) => r.used)).toEqual([false, true])
    expect(html).toContain('起始金額擲骰紀錄（共 2 次，重骰 1 次）')
  })

  it('沒有任何警示時顯示「無」', () => {
    const data = realData()
    const c = withStartingEquipment(benchmarkLevel1(data), data)
    const { model, html } = report(c, data)
    // 1 級基準角色：法術書也已選滿 6 道；若仍有未完成的選擇，列出來方便除錯
    expect(model.warnings.map((w) => w.text)).toEqual([])
    expect(html).toContain('<p class="ok">無</p>')
  })
})
