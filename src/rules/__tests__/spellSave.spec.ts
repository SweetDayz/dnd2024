// M9-3：法術的存檔格式（法師改存 spellbooks、池子位置有意義）、v1 遷移、匯出再匯入完全相同。
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildCharacter } from '@/rules/build'
import { exportCharacter, importCharacter, migrateSpellsV1, newCharacter, SCHEMA_VERSION } from '@/rules/character'
import { benchmarkLevel, EVOKER, PREPARED, setSpellbook, SPELLBOOK, WIZARD } from './benchmark'
import { hasRealData, realData } from './realData'
import { screenshotCharacter } from './screenshotChar'

const legacyJson = readFileSync(resolve(__dirname, 'fixtures/save-pre-m4.json'), 'utf8')
const MI = 'background|侍僧|XPHB:feat>feat|魔法学徒；牧师|XPHB:spells'

describe('v1 → v2 遷移（純函式，不需要資料）', () => {
  it('schemaVersion 升到 2', () => {
    expect(SCHEMA_VERSION).toBe(2)
    expect(importCharacter(legacyJson).schemaVersion).toBe(2)
  })

  it('法師：:spellbook／:prepared 欄位 → spellbooks；additionalSpells 的序號欄位 → :legacy', () => {
    const c = importCharacter(legacyJson)
    expect(c.spellbooks[WIZARD]).toEqual({ spellbook: Object.fromEntries(SPELLBOOK.map((id) => [id, {}])), prepared: PREPARED })
    expect(c.choices[`${WIZARD}:spellbook`]).toBeUndefined()
    expect(c.choices[`${WIZARD}:prepared`]).toBeUndefined()
    expect(c.choices[`${MI}:legacy`]).toEqual(['spell|神导术|XPHB', 'spell|修复术|XPHB', 'spell|光导箭|XPHB'])
    expect(c.choices[`${EVOKER}:spells:legacy`]).toEqual(['spell|燃烧之手|XPHB', 'spell|魔法飞弹|XPHB'])
    expect(Object.keys(c.choices).filter((k) => /:spells:\d+$/.test(k))).toEqual([])
    // 職業戲法、施法屬性這類欄位不變
    expect(c.choices[`${WIZARD}:cantrips`]).toHaveLength(3)
    expect(c.choices['race|侏儒|XPHB:spells:ability']).toEqual(['int'])
  })

  it('已準備但不在法術書的法術，載入時補進法術書', () => {
    const c = newCharacter()
    c.schemaVersion = 1
    c.choices[`${WIZARD}:spellbook`] = ['a']
    c.choices[`${WIZARD}:prepared`] = ['a', 'b']
    const m = importCharacter(JSON.stringify(c))
    expect(Object.keys(m.spellbooks[WIZARD]!.spellbook)).toEqual(['a', 'b'])
    expect(m.spellbooks[WIZARD]!.prepared).toEqual(['a', 'b'])
  })

  it('v2 存檔載入時同樣驗證 prepared ⊆ 法術書', () => {
    const c = newCharacter()
    setSpellbook(c, WIZARD, ['a'], ['a', 'x', 'x'])
    const m = importCharacter(exportCharacter(c))
    expect(m.spellbooks[WIZARD]).toEqual({ spellbook: { a: {}, x: {} }, prepared: ['a', 'x'] })
  })

  it('遷移只做一次：v2 存檔裡的 :spells:<kind> 不會被當成舊格式', () => {
    const c = newCharacter()
    c.choices['x:spells:spellbook'] = ['a', '', 'b']
    c.choices['x:spells:0'] = ['zzz']
    const m = importCharacter(exportCharacter(c))
    expect(m.choices['x:spells:spellbook']).toEqual(['a', '', 'b'])
    expect(m.choices['x:spells:0']).toEqual(['zzz'])
    const v1 = structuredClone(c)
    migrateSpellsV1(v1)
    expect(v1.choices['x:spells:legacy']).toEqual(['zzz'])
  })
})

describe.skipIf(!hasRealData)('遷移後建角（真實資料）', () => {
  const data = hasRealData ? realData() : undefined!

  it('舊存檔的法術全部還在：法術書、準備 4、塑能學者 2 道、魔法學徒 2 戲法＋1 環', () => {
    const c = importCharacter(legacyJson)
    const b = buildCharacter(c, data)
    const sel = (k: string) => b.slots.find((s) => s.key === k)!.selected.filter(Boolean)
    // 魔法飞弹同時是付費抄寫與塑能學者的免費抄寫：免費的優先，不再占書的名額並提示
    expect(sel(`${WIZARD}:spellbook`)).toEqual(SPELLBOOK.filter((id) => id !== 'spell|魔法飞弹|XPHB'))
    expect(sel(`${WIZARD}:prepared`)).toEqual(PREPARED)
    expect(sel(`${EVOKER}:spells:spellbook`)).toEqual(['spell|燃烧之手|XPHB', 'spell|魔法飞弹|XPHB'])
    expect(sel(`${MI}:cantrip`)).toEqual(['spell|神导术|XPHB', 'spell|修复术|XPHB'])
    expect(sel(`${MI}:innate`)).toEqual(['spell|光导箭|XPHB'])
    expect(b.slots.flatMap((s) => s.warnings)).toEqual(['「魔法飞弹」已由 塑能师 免費加入法術書，不再占法術書名額，可以另抄一道'])
  })

  it('補進法術書後超出名額：多出來的標成未選擇並提示', () => {
    const c = benchmarkLevel(data, 1)
    // 1 級法術書 6 道：書已滿，又多準備一道不在書裡的
    c.spellbooks[WIZARD]!.prepared.push('spell|燃烧之手|XPHB')
    const m = importCharacter(exportCharacter(c))
    const b = buildCharacter(m, data)
    const prep = b.slots.find((s) => s.key === `${WIZARD}:prepared`)!
    expect(prep.selected).not.toContain('spell|燃烧之手|XPHB')
    expect(prep.warnings.join()).toContain('已準備但不在法術書（法術書已滿），改為未選擇')
  })

  it('匯出後再匯入，結果完全相同（基準角色 20 級、截圖角色）', () => {
    for (const c of [benchmarkLevel(data, 20), screenshotCharacter(data)]) {
      const json = exportCharacter(c)
      expect(exportCharacter(importCharacter(json))).toBe(json)
    }
  })
})
