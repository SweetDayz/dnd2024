import { describe, expect, it } from 'vitest'
import { buildCharacter } from '@/rules/build'
import { detectEffects, detectHits, effectsFor, inferFields } from '@/rules/effects'
import { benchmarkLevel1 } from './benchmark'
import { hasRealData, realData } from './realData'

describe('效果偵測（關鍵字與標籤）', () => {
  it('侏儒狡黠：智力、感知、魅力豁免優勢', () => {
    const t = '你进行的智力、感知、魅力豁免检定均具有{@variantrule 优势|XPHB}。'
    expect(detectHits(t)).toEqual(expect.arrayContaining(['优势', '豁免']))
    expect(inferFields(t)).toEqual(['save:int', 'save:wis', 'save:cha'])
  })
  it('目標的豁免（吐息武器）不算角色自己的豁免欄位', () => {
    const t = '区域内的生物必须进行一次敏捷豁免检定（{@dc 8} + 你的体质调整值）。豁免失败的生物受到{@damage 1d10}伤害。'
    expect(inferFields(t)).not.toContain('save:dex')
    expect(inferFields(t)).toContain('attacks')
  })
  it('屬性檢定優勢、先攻、生命值上限', () => {
    expect(inferFields('你进行的力量检定具有优势，速度增加 10 尺')).toEqual(expect.arrayContaining(['check:str', 'speed']))
    expect(inferFields('你掷先攻时可以加上熟练加值')).toContain('initiative')
    expect(inferFields('你的生命值上限增加')).toContain('hp')
  })
  it('沒有數值影響的段落不列出', () => {
    expect(detectHits('你知晓{@spell 光亮术|XPHB}戏法。')).toEqual([])
  })
})

describe.skipIf(!hasRealData)('基準角色的效果（真實資料）', () => {
  const data = realData()
  const b = buildCharacter(benchmarkLevel1(data), data)
  const effects = detectEffects(b, data)

  it('侏儒狡黠連到智力／感知／魅力豁免，並標註來源', () => {
    const e = effectsFor(effects, 'save:int').find((x) => x.title === '侏儒狡黠')
    expect(e?.feature.category).toBe('race')
    expect(e?.feature.entry.source).toBe('XPHB')
    expect(e?.feature.entry.page).toBe(191)
    expect(effectsFor(effects, 'save:str').some((x) => x.title === '侏儒狡黠')).toBe(false)
  })
  it('黑暗視覺列在效果中', () => {
    expect(effects.some((e) => e.fields.includes('senses'))).toBe(true)
  })
})
