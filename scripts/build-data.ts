// 把 raw/ 的 JSON 篩選、整理後輸出成 public/data/*.js（classic script）。
//
// 為什麼是 .js 而不是 .json？app 要能在 file:// 下執行，而瀏覽器在 file:// 下會擋 fetch，
// 所以每個資料檔都寫成一般的 script：window.__DND__.register('races', {...})
// 詳見 src/data/loader.ts。
//
// 用法：npm run build-data（需要先 npm run fetch-data）
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { SOURCE_WHITELIST } from '../src/data/sourceGroups.ts'
import { DATA_FILES } from '../src/data/types.ts'
import { versionWarnings } from './lib/copy.ts'
import { auditData } from './audit-data.ts'
import { buildDataset, emptyReport } from './lib/pipeline.ts'
import { readRawInput } from './lib/rawInput.ts'
import { readRaw } from './lib/raw.ts'
import { buildSourceTable } from './lib/sources.ts'

const OUT = resolve('public/data')

const sources = buildSourceTable(readRaw('books.json').book, readRaw('adventures.json').adventure)

const { input: raw, excluded } = readRawInput()

const pagePatches = JSON.parse(readFileSync(resolve('scripts/data/page-patches.json'), 'utf8')).patches
const report = emptyReport()
const dataset = buildDataset(raw, { whitelist: SOURCE_WHITELIST, sources, pagePatches, report })

mkdirSync(OUT, { recursive: true })
// 清掉舊的輸出
for (const f of readdirSync(OUT)) {
  if (f.endsWith('.js')) writeFileSync(resolve(OUT, f), '')
}

function writeData(file: string, data: unknown) {
  const path = resolve(OUT, `${file}.js`)
  writeFileSync(path, `window.__DND__.register(${JSON.stringify(file)},${JSON.stringify(data)});\n`)
  const kb = statSync(path).size / 1024
  console.log(`  ${`${file}.js`.padEnd(22)} ${kb >= 1024 ? `${(kb / 1024).toFixed(2)} MB` : `${kb.toFixed(0)} KB`}`)
  return statSync(path).size
}

console.log('輸出 public/data/：')
let total = writeData(
  'sources',
  sources.filter((s) => SOURCE_WHITELIST.has(s.source)),
)
// 上游資料版本（fetch-data 寫的 raw/VERSION：repo、分支、commit、commit 時間），給 xlsx「關於」工作表用
const [repo = '', branch = '', commit = '', committedAt = ''] = readFileSync(resolve('raw/VERSION'), 'utf8').trim().split(/\r?\n/)
total += writeData('meta', { repo, branch, commit, committedAt, builtAt: new Date().toISOString() })
for (const [file, kinds] of Object.entries(DATA_FILES)) {
  const data = Object.fromEntries(kinds.map((k) => [k, dataset[k] ?? []]))
  total += writeData(file, data)
}
console.log(`  合計 ${(total / 1024 / 1024).toFixed(2)} MB`)

console.log('條目數：')
for (const [kind, list] of Object.entries(dataset)) {
  const reprinted = list.filter((e) => e.reprintedAs).length
  const tce = list.filter((e) => e.tceOptional).length
  console.log(`  ${kind.padEnd(16)} ${String(list.length).padStart(5)}  (已被重印 ${reprinted}${tce ? `、TCE 可選 ${tce}` : ''})`)
}

if (versionWarnings.length) {
  console.log(`_versions 展開警告（${versionWarnings.length}，見 docs/data-notes.md §3）：`)
  for (const w of versionWarnings) console.log(`  ${w}`)
}

// 資料完整性稽核：寫 docs/data-audit.md，終端機只印摘要
auditData({ report, dataset, sources, excluded, version: readFileSync(resolve('raw/VERSION'), 'utf8') })
