/**
 * 條目的統一 id。建置腳本與 app 共用，不可 import Vue。
 *
 * 格式：`kind|name|source`，name 是簡體中文名（上游所有交叉參照都用中文名）。
 * 有些類別光靠 name+source 不唯一，會在後面附加欄位（調查結果見 docs/data-notes.md §2）：
 *   subrace          subrace|name|source|raceName|raceSource
 *   subclass         subclass|name|source|className|classSource
 *   classFeature     classFeature|name|source|className|classSource|level
 *   subclassFeature  subclassFeature|name|source|className|classSource|subclassShortName|subclassSource|level
 */

export type EntryKind =
  | 'race'
  | 'subrace'
  | 'background'
  | 'feat'
  | 'optionalfeature'
  | 'item'
  | 'spell'
  | 'class'
  | 'subclass'
  | 'classFeature'
  | 'subclassFeature'
  | 'language'
  | 'skill'
  | 'condition'
  | 'disease'
  | 'status'
  | 'variantrule'
  | 'sense'
  | 'action'
  | 'itemProperty'
  | 'itemMastery'

export function makeId(kind: EntryKind, name: string, source: string, ...extra: (string | number)[]): string {
  return [kind, name, source, ...extra].join('|')
}

export function kindOfId(id: string): EntryKind {
  return id.slice(0, id.indexOf('|')) as EntryKind
}

/** id 的第三段固定是來源代碼。 */
export function sourceOfId(id: string): string {
  return id.split('|')[2] ?? ''
}
