// M4-5 回歸測試：每個類別「2024 新書的輸出數量 = raw 中應保留的數量」，避免之後再次漏掉資料。
// 參考值直接從 raw/ 數（不經過建置管線）：同類別內以「名稱＋來源（＋附加欄位）」去重。
// raw/ 與 public/data/ 都不在 git 裡；沒抓過資料的環境自動跳過。
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { EntryKind } from '../../../src/data/ids.ts'
import { DEFAULT_GROUP_ID, SOURCE_GROUPS } from '../../../src/data/sourceGroups.ts'
import { DATA_FILES, type DataFile, type Entry } from '../../../src/data/types.ts'
import { isVisible } from '../../../src/data/visibility.ts'
import type { Json } from '../raw.ts'
import { readRawInput } from '../rawInput.ts'

const hasRaw = existsSync(resolve('raw/languages.json'))
const hasOut = existsSync(resolve('public/data/classes.js'))

/** 讀 public/data/*.js（建置輸出），kind → 條目 */
function loadOutput(): Map<EntryKind, Entry[]> {
  const lists = new Map<EntryKind, Entry[]>()
  for (const file of Object.keys(DATA_FILES)) {
    let data: DataFile = {}
    const fake = { __DND__: { register: (_k: string, d: DataFile) => (data = d) } }
    new Function('window', readFileSync(resolve(`public/data/${file}.js`), 'utf8'))(fake)
    for (const [kind, list] of Object.entries(data) as [EntryKind, Entry[]][]) lists.set(kind, list)
  }
  return lists
}
const official = {
  enabled: new Set(SOURCE_GROUPS[DEFAULT_GROUP_ID]!.sources),
  showLegacy: false,
  tceOptional: false,
}

/** 獨立的去重鍵（與管線的 KEY 寫法不同，但語意相同） */
const extra = (kind: string, e: Json): string =>
  kind === 'subrace'
    ? `${e.raceName}/${e.raceSource}`
    : kind === 'subclass'
      ? `${e.className}/${e.classSource}`
      : kind === 'classFeature'
        ? `${e.className}/${e.classSource}/${e.level}`
        : kind === 'subclassFeature'
          ? `${e.className}/${e.classSource}/${e.subclassShortName}/${e.subclassSource}/${e.level}`
          : ''

const KINDS: EntryKind[] = [
  'race',
  'subrace',
  'background',
  'feat',
  'optionalfeature',
  'item',
  'spell',
  'class',
  'subclass',
  'classFeature',
  'subclassFeature',
  'language',
  'skill',
  'condition',
  'variantrule',
  'sense',
  'action',
]

describe.skipIf(!hasRaw || !hasOut)('資料完整性：輸出數量 = raw 應保留的數量', () => {
  const { input } = hasRaw ? readRawInput() : { input: {} as Json }
  const rawOf = (kind: EntryKind): Json[] =>
    kind === 'item'
      ? [
          ...(input.baseitem ?? []),
          ...(input.item ?? []),
          ...(input.itemGroup ?? []),
          ...(input.magicvariant ?? []).map((m: Json) => ({
            ...m,
            source: m.source ?? m.inherits?.source,
          })),
        ]
      : (input[kind] ?? [])
  const expected = (kind: EntryKind, source: string) =>
    new Set(
      rawOf(kind)
        .filter((e: Json) => String(e.source).toLowerCase() === source.toLowerCase())
        .map((e: Json) => `${e.name}|${extra(kind, e)}`),
    ).size

  const out = hasOut ? loadOutput() : new Map<EntryKind, Entry[]>()
  const list = (kind: EntryKind) => out.get(kind) ?? []

  it.each(['XPHB', 'XDMG', 'XMM', 'FRHoF', 'EFA', 'AU'])('%s', (source) => {
    const got: Record<string, [number, number]> = {}
    for (const kind of KINDS) {
      const exp = expected(kind, source)
      const n = list(kind).filter((e) => e.source === source).length
      if (exp || n) got[kind] = [n, exp]
    }
    for (const [kind, [n, exp]] of Object.entries(got))
      expect({ kind, n }).toEqual({ kind, n: exp })
    expect(Object.keys(got).length).toBeGreaterThan(0)
  })

  it('語言：official 下輸出 160 筆（= 白名單內 raw 數），可見 116 筆', () => {
    expect(list('language')).toHaveLength(160)
    expect(list('language').filter((e) => isVisible(e, official))).toHaveLength(116)
    // XPHB 19 筆：標準 10（含通用手語）、稀有 9
    const x = list('language').filter((e) => e.source === 'XPHB')
    expect(x.filter((e) => e.type === 'standard')).toHaveLength(10)
    expect(x.filter((e) => e.type === 'rare')).toHaveLength(9)
  })
})
