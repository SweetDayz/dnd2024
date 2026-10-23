/**
 * 職業／子職特性參照字串 → 條目 id（見 docs/data-notes.md §5）。純函式。
 *
 *   classFeatures:    "名稱|職業|職業來源|等級[|特性來源]"            職業來源空白 = PHB
 *   subclassFeatures: "名稱|職業|職業來源|子職短名|子職來源|等級[|特性來源]"
 *   物件形式 { classFeature: "...", gainSubclassFeature: true } 表示該級取得子職特性
 */
import { makeId } from './ids.ts'

export interface FeatureRef {
  id: string
  level: number
  gainSubclassFeature: boolean
}

export function classFeatureRef(ref: string | { classFeature: string; gainSubclassFeature?: boolean }): FeatureRef {
  const s = typeof ref === 'string' ? ref : ref.classFeature
  const [name = '', className = '', classSource = '', level = '', source = ''] = s.split('|')
  const cs = classSource || 'PHB'
  return {
    id: makeId('classFeature', name, source || cs, className, cs, level),
    level: Number(level),
    gainSubclassFeature: typeof ref !== 'string' && !!ref.gainSubclassFeature,
  }
}

export function subclassFeatureRef(ref: string | { subclassFeature: string }): FeatureRef {
  const s = typeof ref === 'string' ? ref : ref.subclassFeature
  const [name = '', className = '', classSource = '', short = '', subSource = '', level = '', source = ''] = s.split('|')
  const cs = classSource || 'PHB'
  const ss = subSource || 'PHB'
  return {
    id: makeId('subclassFeature', name, source || ss, className, cs, short, ss, level),
    level: Number(level),
    gainSubclassFeature: false,
  }
}
