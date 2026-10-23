import { describe, expect, it } from 'vitest'
import { classFeatureRef, subclassFeatureRef } from '../classRefs'

describe('class feature refs', () => {
  it('職業來源空白代表 PHB，特性來源省略等於職業來源', () => {
    expect(classFeatureRef('奥术回想|法师||1')).toEqual({
      id: 'classFeature|奥术回想|PHB|法师|PHB|1',
      level: 1,
      gainSubclassFeature: false,
    })
    expect(classFeatureRef('戏法公式|法师||3|TCE').id).toBe('classFeature|戏法公式|TCE|法师|PHB|3')
  })

  it('物件形式帶 gainSubclassFeature', () => {
    expect(classFeatureRef({ classFeature: '法师子职|法师|XPHB|3', gainSubclassFeature: true })).toEqual({
      id: 'classFeature|法师子职|XPHB|法师|XPHB|3',
      level: 3,
      gainSubclassFeature: true,
    })
  })

  it('子職特性', () => {
    expect(subclassFeatureRef('法术塑形|法师|XPHB|塑能师|XPHB|6').id).toBe(
      'subclassFeature|法术塑形|XPHB|法师|XPHB|塑能师|XPHB|6',
    )
  })
})
