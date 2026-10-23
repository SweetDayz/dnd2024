import { describe, expect, it } from 'vitest'
import { describeTag, parseTags, stripTags, type TagNode } from '../tags'

const tag = (raw: string) => parseTags(raw)[0] as TagNode

describe('parseTags', () => {
  it('切出純文字與標籤', () => {
    expect(parseTags('你知晓{@spell 次级幻象|XPHB}戏法')).toEqual([
      '你知晓',
      { tag: 'spell', args: ['次级幻象', 'XPHB'], raw: '{@spell 次级幻象|XPHB}' },
      '戏法',
    ])
  })

  it('支援巢狀標籤，內層的 | 不會切開外層參數', () => {
    const n = tag('{@i 3级法师{@variantrule 可选职业特性|tce|可选特性}}')
    expect(n.tag).toBe('i')
    expect(n.args).toEqual(['3级法师{@variantrule 可选职业特性|tce|可选特性}'])
  })

  it('不成對的 {@ 當成純文字', () => {
    expect(parseTags('abc {@b 沒結尾')).toEqual(['abc {@b 沒結尾'])
  })
})

describe('describeTag', () => {
  it('spell、item、condition、skill、feat 是可連結條目；省略來源時用預設', () => {
    expect(describeTag(tag('{@spell 火球术}'))).toMatchObject({ type: 'link', kind: 'spell', name: '火球术', source: 'PHB', text: '火球术' })
    expect(describeTag(tag('{@item 书籍|XPHB|祈祷书}'))).toMatchObject({ kind: 'item', source: 'XPHB', text: '祈祷书' })
    expect(describeTag(tag('{@item 长剑}'))).toMatchObject({ source: 'DMG' })
    expect(describeTag(tag('{@condition 失能|XPHB}'))).toMatchObject({ kind: 'condition' })
    expect(describeTag(tag('{@skill 洞悉|XPHB}'))).toMatchObject({ kind: 'skill' })
    expect(describeTag(tag('{@feat 魔法学徒|XPHB}'))).toMatchObject({ kind: 'feat' })
  })

  it('class、subclass、classFeature 帶額外 id 欄位', () => {
    expect(describeTag(tag('{@class 战士||战士}'))).toMatchObject({ kind: 'class', name: '战士', source: 'PHB' })
    expect(describeTag(tag('{@subclass 炼金师|奇械师|EFA|EFA}'))).toMatchObject({
      kind: 'subclass',
      name: '炼金师',
      source: 'EFA',
      extra: ['奇械师', 'EFA'],
    })
    expect(describeTag(tag('{@classFeature 灵光一闪|奇械师|EFA|7|EFA}'))).toMatchObject({
      kind: 'classFeature',
      extra: ['奇械师', 'EFA', '7'],
      text: '灵光一闪',
    })
  })

  it('creature、filter 等本站沒有資料的參照，顯示文字', () => {
    expect(describeTag(tag('{@creature 哥布林|MM|小哥布林}'))).toEqual({ type: 'ref', tag: 'creature', text: '小哥布林' })
    expect(describeTag(tag('{@filter 已知戏法|spells|level=0|class=法师}'))).toMatchObject({ type: 'ref', text: '已知戏法' })
  })

  it('b、i、damage、dice、dc 是樣式', () => {
    expect(describeTag(tag('{@b 粗}'))).toEqual({ type: 'style', style: 'b', text: '粗' })
    expect(describeTag(tag('{@i 斜}'))).toMatchObject({ style: 'i' })
    expect(describeTag(tag('{@damage 1d10}'))).toMatchObject({ style: 'dice', text: '1d10' })
    expect(describeTag(tag('{@dice 4d4 × 10|4d4 × 10|起始金币}'))).toMatchObject({ text: '起始金币' })
    expect(describeTag(tag('{@dc 8}'))).toMatchObject({ text: 'DC 8' })
    expect(describeTag(tag('{@hit 5}'))).toMatchObject({ text: '+5' })
  })

  it('未知標籤標示為 unknown，顯示第一個參數', () => {
    expect(describeTag(tag('{@foobar 文字|X}'))).toEqual({ type: 'unknown', tag: 'foobar', text: '文字' })
  })
})

describe('stripTags', () => {
  it('只留顯示文字', () => {
    expect(stripTags('造成{@damage 1d10}点伤害，{@b 并且{@condition 目盲|XPHB}}')).toBe('造成1d10点伤害，并且目盲')
  })
})
