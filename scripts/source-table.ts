// 把「來源對照表」寫進 docs/data-notes.md 的標記區塊之間（重跑會覆蓋該區塊）。
// 用法：npm run source-table
import { readFileSync, writeFileSync } from 'node:fs'
import { SOURCE_WHITELIST } from '../src/data/sourceGroups.ts'
import { readRaw } from './lib/raw.ts'
import { buildSourceTable } from './lib/sources.ts'

const NOTES = 'docs/data-notes.md'
const BEGIN = '<!-- source-table:begin -->'
const END = '<!-- source-table:end -->'

const rows = buildSourceTable(readRaw('books.json').book, readRaw('adventures.json').adventure)
const lines = [
  BEGIN,
  '',
  `共 ${rows.length} 筆（書 ${rows.filter((r) => r.type === 'book').length}、冒險 ${rows.filter((r) => r.type === 'adventure').length}）。「官方」欄 ✅ 代表在 \`official\` 群組內。`,
  '',
  '| 官方 | 代碼 | 中文名 | 英文名 | 出版日期 | 類型 | 上游分類 |',
  '| :--: | ---- | ------ | ------ | -------- | ---- | -------- |',
  ...rows.map(
    (r) =>
      `| ${SOURCE_WHITELIST.has(r.source) ? '✅' : ''} | ${r.source} | ${r.name} | ${r.engName} | ${r.published} | ${r.type === 'book' ? '規則書' : '冒險'} | ${r.group} |`,
  ),
  '',
  END,
]

const notes = readFileSync(NOTES, 'utf8')
const a = notes.indexOf(BEGIN)
const b = notes.indexOf(END)
if (a < 0 || b < 0) throw new Error(`${NOTES} 缺少 ${BEGIN} / ${END} 標記`)
writeFileSync(NOTES, notes.slice(0, a) + lines.join('\n') + notes.slice(b + END.length))
console.log(`已更新 ${NOTES}：${rows.length} 筆來源`)
