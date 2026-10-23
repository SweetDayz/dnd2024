// 把 raw/ 的 JSON 篩選、整理後輸出成 public/data/*.js（classic script）。
//
// 為什麼是 .js 而不是 .json？app 要能在 file:// 下執行，而瀏覽器在 file:// 下會擋 fetch，
// 所以每個資料檔都寫成一般的 script：window.__DND__.register('races', {...})
// 詳見 src/data/loader.ts。
//
// 用法：npm run build-data（需要先 npm run fetch-data）
import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { SOURCE_WHITELIST } from '../src/data/sourceGroups.ts'
import { DATA_FILES } from '../src/data/types.ts'
import { buildDataset, type RawInput } from './lib/pipeline.ts'
import { readRaw, type Json } from './lib/raw.ts'
import { buildSourceTable } from './lib/sources.ts'

const OUT = resolve('public/data')

const sources = buildSourceTable(readRaw('books.json').book, readRaw('adventures.json').adventure)

const races = readRaw('races.json')
const itemsBase = readRaw('items-base.json')
const items = readRaw('items.json')
const conditions = readRaw('conditionsdiseases.json')

const spellFiles: string[] = Object.values(readRaw('spells/index.json'))
// 協力者（sidekick）不是玩家職業，不打包。
const classFiles: string[] = Object.values<string>(readRaw('class/index.json')).filter((f) => !f.includes('sidekick'))
const classData: Json[] = classFiles.map((f) => readRaw(`class/${f}`))
const fromClasses = (k: string) => classData.flatMap((c) => c[k] ?? [])

const raw: RawInput = {
  race: races.race,
  subrace: races.subrace,
  background: readRaw('backgrounds.json').background,
  feat: readRaw('feats.json').feat,
  optionalfeature: readRaw('optionalfeatures.json').optionalfeature,
  baseitem: itemsBase.baseitem,
  item: items.item,
  itemGroup: items.itemGroup,
  spell: spellFiles.flatMap((f) => readRaw(`spells/${f}`).spell),
  spellLookup: readRaw('generated/gendata-spell-source-lookup.json'),
  class: fromClasses('class'),
  subclass: fromClasses('subclass'),
  classFeature: fromClasses('classFeature'),
  subclassFeature: fromClasses('subclassFeature'),
  language: readRaw('languages.json').language,
  skill: readRaw('skills.json').skill,
  condition: conditions.condition,
  disease: conditions.disease,
  status: conditions.status,
  variantrule: readRaw('variantrules.json').variantrule,
  sense: readRaw('senses.json').sense,
  action: readRaw('actions.json').action,
  itemProperty: itemsBase.itemProperty,
  itemMastery: itemsBase.itemMastery,
}

const dataset = buildDataset(raw, { whitelist: SOURCE_WHITELIST, sources })

mkdirSync(OUT, { recursive: true })
// 清掉舊的輸出（保留 M0 的 demo.js）
for (const f of readdirSync(OUT)) {
  if (f.endsWith('.js') && f !== 'demo.js') writeFileSync(resolve(OUT, f), '')
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
