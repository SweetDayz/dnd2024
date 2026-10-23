// 由 books.json 與 adventures.json 產生來源對照表。
import { EDITION_2024_CUTOFF } from '../../src/data/sourceGroups.ts'
import type { SourceInfo } from '../../src/data/types.ts'
import type { Json } from './raw.ts'

export function buildSourceTable(books: Json[], adventures: Json[]): SourceInfo[] {
  const rows: SourceInfo[] = []
  const seen = new Set<string>()
  // MOT、FRAiF 同時出現在書與冒險表；先加入的（書）優先。
  const add = (e: Json, type: SourceInfo['type']) => {
    const source: string = e.source ?? e.id
    if (seen.has(source)) return
    seen.add(source)
    rows.push({
      source,
      name: e.name,
      engName: e.ENG_name,
      published: e.published,
      type,
      group: e.group,
      edition: e.published >= EDITION_2024_CUTOFF ? '2024' : '2014',
    })
  }
  books.forEach((b) => add(b, 'book'))
  adventures.forEach((a) => add(a, 'adventure'))
  return rows.sort((a, b) => a.published.localeCompare(b.published) || a.source.localeCompare(b.source))
}
