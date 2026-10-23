// 補頁碼：中文上游有些條目缺 `page`（目前是 AU 的部分資料），從英文 5etools-src 找對應條目的頁碼，
// 輸出成 scripts/data/page-patches.json（進 git）。build-data 只在條目缺頁碼時才套用。
//
// 對應方式：kind + 英文名（ENG_name ↔ name）+ 來源（+ 等級）。同一個鍵在英文資料出現多次（無法確定是哪筆）就跳過。
// 用法：npm run gen-page-patches（需要網路；平常 build 不需要）
import { mkdirSync, writeFileSync } from 'node:fs'
import { SOURCE_WHITELIST } from '../src/data/sourceGroups.ts'
import { patchKey } from './lib/pipeline.ts'
import { readRaw, type Json } from './lib/raw.ts'

const EN_TAG = 'v2.38.0'
const EN_BASE = `https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/${EN_TAG}/data/`
const OUT = 'scripts/data/page-patches.json'

async function en(path: string): Promise<Json> {
  const res = await fetch(EN_BASE + path)
  if (!res.ok) throw new Error(`${res.status} ${EN_BASE + path}`)
  return res.json()
}

// 中文 raw 裡缺頁碼的條目
const cnClasses: Json[] = Object.values<string>(readRaw('class/index.json')).map((f) => readRaw(`class/${f}`))
const cn: Record<string, Json[]> = {
  race: readRaw('races.json').race,
  background: readRaw('backgrounds.json').background,
  feat: readRaw('feats.json').feat,
  optionalfeature: readRaw('optionalfeatures.json').optionalfeature,
  item: [...readRaw('items.json').item, ...readRaw('items.json').itemGroup, ...readRaw('items-base.json').baseitem],
  spell: Object.values<string>(readRaw('spells/index.json')).flatMap((f) => readRaw(`spells/${f}`).spell),
  subclass: cnClasses.flatMap((c) => c.subclass ?? []),
  subclassFeature: cnClasses.flatMap((c) => c.subclassFeature ?? []),
  classFeature: cnClasses.flatMap((c) => c.classFeature ?? []),
}
const missing = Object.entries(cn).flatMap(([kind, list]) =>
  list
    .filter((e) => e.page === undefined && !e._copy && SOURCE_WHITELIST.has(e.source))
    .map((e) => ({ kind, e })),
)
console.log(`缺頁碼：${missing.length} 筆`)

// 英文對應資料（只抓需要的類別）
const kinds = new Set(missing.map((m) => m.kind))
const enData: Record<string, Json[]> = {}
if (kinds.has('optionalfeature')) enData.optionalfeature = (await en('optionalfeatures.json')).optionalfeature
if (kinds.has('item')) {
  const [items, base] = await Promise.all([en('items.json'), en('items-base.json')])
  enData.item = [...items.item, ...(items.itemGroup ?? []), ...base.baseitem]
}
if (kinds.has('race')) enData.race = (await en('races.json')).race
if (kinds.has('background')) enData.background = (await en('backgrounds.json')).background
if (kinds.has('feat')) enData.feat = (await en('feats.json')).feat
if (kinds.has('spell')) {
  const idx: Record<string, string> = await en('spells/index.json')
  enData.spell = (await Promise.all(Object.values(idx).map((f) => en(`spells/${f}`)))).flatMap((d) => d.spell)
}
if (kinds.has('subclass') || kinds.has('subclassFeature') || kinds.has('classFeature')) {
  const idx: Record<string, string> = await en('class/index.json')
  const files = await Promise.all(Object.values(idx).map((f) => en(`class/${f}`)))
  for (const k of ['subclass', 'subclassFeature', 'classFeature']) enData[k] = files.flatMap((d) => d[k] ?? [])
}

const enIndex = new Map<string, number[]>()
for (const [kind, list] of Object.entries(enData)) {
  for (const e of list) {
    if (e.page === undefined) continue
    const k = patchKey(kind, e.name, e.source, e.level)
    enIndex.set(k, [...(enIndex.get(k) ?? []), e.page])
  }
}

const patches: Record<string, number> = {}
const unmatched: string[] = []
for (const { kind, e } of missing) {
  const k = patchKey(kind, e.ENG_name, e.source, e.level)
  const pages = [...new Set(enIndex.get(k) ?? [])]
  if (pages.length === 1) patches[k] = pages[0]!
  else unmatched.push(`${k}${pages.length > 1 ? `（多個候選 ${pages.join(',')}）` : ''}`)
}

mkdirSync('scripts/data', { recursive: true })
writeFileSync(OUT, JSON.stringify({ from: `5etools-src ${EN_TAG}`, patches }, null, 2) + '\n')
console.log(`已寫入 ${OUT}：補上 ${Object.keys(patches).length} 筆，找不到 ${unmatched.length} 筆`)
for (const u of unmatched) console.log(`  找不到：${u}`)
