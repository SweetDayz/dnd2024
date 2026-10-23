// 建置管線的純函式部分：raw 陣列 → 建置後條目。不讀寫檔案，方便用 Vitest 測試。
//
// 步驟：
//   1. 各類別分別解析 `_copy`（在過濾前做，因為母條目可能來自白名單外的書）
//   2. 只保留白名單來源；子條目（subrace、subclass、職業特性）還要求母條目存在
//   3. 加上統一 id、engName、edition，統一來源代碼大小寫
//   4. reprintedAs → 重印版 id（只保留建置後實際存在的）
//   5. 標記 TCE 可選規則
//   6. 刪掉建角用不到的欄位
import { makeId, type EntryKind } from '../../src/data/ids.ts'
import type { Edition, Entry, SourceInfo, SpellClassRef } from '../../src/data/types.ts'
import { expandVersions, resolveCopies } from './copy.ts'
import type { Json } from './raw.ts'

export type RawInput = Partial<Record<EntryKind | 'baseitem' | 'itemGroup' | 'magicvariant', Json[]>> & {
  /** generated/gendata-spell-source-lookup.json */
  spellLookup?: Json
}

export interface BuildOptions {
  whitelist: ReadonlySet<string>
  sources: readonly SourceInfo[]
  /** 缺頁碼時的補丁（scripts/data/page-patches.json，鍵見 patchKey） */
  pagePatches?: Readonly<Record<string, number>>
  /** 傳入的話，管線會把診斷資訊（找不到的重印目標等）寫進來，給稽核報告用 */
  report?: BuildReport
}

/** 一個解析不到的重印參照。 */
export interface UnresolvedReprint {
  kind: EntryKind
  id: string
  ref: string
  /** target-not-whitelisted：目標書不在白名單（正常）；target-missing：目標書在白名單但找不到條目 */
  reason: 'target-not-whitelisted' | 'target-missing'
}

export interface BuildReport {
  reprintUnresolved: UnresolvedReprint[]
}

/** 頁碼補丁的鍵：kind|英文名|來源|等級（只有職業／子職特性用等級區分）。 */
export function patchKey(kind: string, engName: string, source: string, level?: unknown): string {
  const lv = kind === 'classFeature' || kind === 'subclassFeature' ? (level ?? '') : ''
  return `${kind}|${engName}|${source.toLowerCase()}|${lv}`
}

export type Dataset = Partial<Record<EntryKind, Entry[]>>

/** 所有類別都刪掉的欄位：背景故事圖片、翻譯者、SRD 標記、載具數值等。 */
const DROP_FIELDS = new Set([
  'ENG_name',
  'translator',
  'hasFluff',
  'hasFluffImages',
  'fluff',
  'soundClip',
  'srd',
  'srd52',
  'basicRules',
  'basicRules2024',
  'referenceSources',
  'otherSources',
  'additionalSources',
  'lootTables',
  'hasRefs',
  'hasToken',
  'token',
  'seeAlsoVehicle',
  'seeAlsoDeck',
  'vehSpeed',
  'vehAc',
  'vehHp',
  'vehDmgThresh',
  'crew',
  'crewMin',
  'crewMax',
  'capCargo',
  'capPassenger',
  'travelCost',
  'shippingCost',
  'barDimensions',
  'isClassFeatureVariant',
])

const low = (s: unknown) => String(s ?? '').toLowerCase()

/** 各類別的查找鍵（`_copy` 與重印解析共用）。來源一律小寫比對。 */
const KEY: Record<string, (e: Json) => string> = {
  default: (e) => `${e.name}|${low(e.source)}`,
  subrace: (e) => `${e.name}|${low(e.source)}|${e.raceName}|${low(e.raceSource)}`,
  subclass: (e) => `${e.name}|${low(e.source)}|${e.className}|${low(e.classSource)}`,
  classFeature: (e) => `${e.name}|${low(e.source)}|${e.className}|${low(e.classSource)}|${e.level}`,
  subclassFeature: (e) =>
    `${e.name}|${low(e.source)}|${e.className}|${low(e.classSource)}|${e.subclassShortName}|${low(e.subclassSource)}|${e.level}`,
}
const keyOf = (kind: string) => KEY[kind] ?? KEY.default!

/** 5etools 的重印標籤名稱 → 本專案的 kind。 */
const TAG_KIND: Record<string, EntryKind> = { optfeature: 'optionalfeature' }

export function buildDataset(raw: RawInput, opts: BuildOptions): Dataset {
  const canonical = new Map(opts.sources.map((s) => [s.source.toLowerCase(), s]))
  const allowed = new Set([...opts.whitelist].map(low))
  const isAllowed = (src: unknown) => allowed.has(low(src))
  const canon = (src: unknown) => canonical.get(low(src))?.source ?? String(src)

  // 1. 解析 _copy。物品的三個陣列各自解析後合併成同一個 kind。
  const resolved: Partial<Record<EntryKind, Json[]>> = {}
  for (const [k, arr] of Object.entries(raw)) {
    if (k === 'spellLookup' || !Array.isArray(arr)) continue
    const items =
      k === 'magicvariant'
        ? resolveCopies(arr, (e) => `${e.name}|${low(e.source ?? e.inherits?.source)}`).map(flattenMagicVariant)
        : resolveCopies(arr, keyOf(k))
    if (k === 'baseitem') items.forEach((e) => (e.isBaseItem = true))
    if (k === 'itemGroup') items.forEach((e) => (e.isItemGroup = true))
    const kind = (['baseitem', 'itemGroup', 'magicvariant'].includes(k) ? 'item' : k) as EntryKind
    ;(resolved[kind] ??= []).push(...items)
  }
  // itemProperty 沒有 name，以縮寫當名稱
  for (const e of resolved.itemProperty ?? []) e.name ??= e.abbreviation

  // 2. 白名單過濾
  const out: Dataset = {}
  const present = (kind: EntryKind) => new Set((out[kind] ?? []).map(keyOf(kind)))
  const order: EntryKind[] = [
    'race',
    'subrace',
    'class',
    'subclass',
    'classFeature',
    'subclassFeature',
    ...(Object.keys(resolved) as EntryKind[]),
  ]
  const kept: Partial<Record<EntryKind, Json[]>> = {}
  for (const kind of new Set(order)) {
    const arr = resolved[kind]
    if (!arr) continue
    let list = arr.filter((e) => isAllowed(e.source))
    if (kind === 'subrace') {
      const races = new Set((kept.race ?? []).map(KEY.default!))
      list = list.filter((e) => races.has(`${e.raceName}|${low(e.raceSource)}`))
    } else if (kind === 'subclass' || kind === 'classFeature') {
      const classes = new Set((kept.class ?? []).map(KEY.default!))
      list = list.filter((e) => classes.has(`${e.className}|${low(e.classSource)}`))
    } else if (kind === 'subclassFeature') {
      const subs = new Set(
        (kept.subclass ?? []).map((s) => `${s.shortName}|${low(s.source)}|${s.className}|${low(s.classSource)}`),
      )
      list = list.filter((e) =>
        subs.has(`${e.subclassShortName}|${low(e.subclassSource)}|${e.className}|${low(e.classSource)}`),
      )
    }
    // 同類別重複（例如物品與基礎物品同名同源）時保留第一筆
    const seen = new Set<string>()
    kept[kind] = list.filter((e) => {
      const k = keyOf(kind)(e)
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
  }

  // 3. 正規化
  for (const [kind, list] of Object.entries(kept) as [EntryKind, Json[]][]) {
    out[kind] = list.map((e) => {
      const n = normalize(kind, e, canon, canonical)
      if (n.page === undefined && n.engName) {
        const page = opts.pagePatches?.[patchKey(kind, n.engName, n.source, e.level)]
        if (page !== undefined) n.page = page
      }
      // _versions → versions：每個版本都是完整條目（有自己的 id），並記住母條目 versionOf
      if (e._versions) {
        delete n._versions
        n.versions = expandVersions(e).map((v) => ({ ...normalize(kind, v, canon, canonical), versionOf: n.id }))
      }
      return n
    })
  }

  // 4. 重印
  const idByKey = new Map<string, string>()
  for (const [kind, list] of Object.entries(out) as [EntryKind, Entry[]][]) {
    for (const e of list) idByKey.set(`${kind}|${keyOf(kind)(e)}`, e.id)
    if (kind === 'subclass') {
      // 子職的重印參照用「短名|職業|職業來源|來源」
      for (const e of list) {
        idByKey.set(`subclassRef|${e.shortName}|${e.className}|${low(e.classSource)}|${low(e.source)}`, e.id)
      }
    }
  }
  const direct = new Map<string, string[]>()
  for (const [kind, list] of Object.entries(out) as [EntryKind, Entry[]][]) {
    for (const e of list) {
      const refs = e.reprintedAs as Json[] | undefined
      delete e.reprintedAs
      if (!refs?.length) continue
      const ids: string[] = []
      for (const r of refs) {
        const id = resolveReprint(kind, r, idByKey)
        if (id) ids.push(id)
        else {
          const ref = typeof r === 'string' ? r : `${r.tag}:${r.uid}`
          const src = reprintSource(kind, r)
          opts.report?.reprintUnresolved.push({
            kind,
            id: e.id,
            ref,
            reason: isAllowed(src) ? 'target-missing' : 'target-not-whitelisted',
          })
        }
      }
      if (ids.length) direct.set(e.id, [...new Set(ids)])
    }
  }
  // 鏈狀重印（例如 VGM → MPMM → XPHB）：把間接目標也列進來（直接目標在前），
  // 這樣中間那本書沒開、最新那本有開時，最舊的版本也會被隱藏。
  for (const list of Object.values(out)) {
    for (const e of list) {
      if (!direct.has(e.id)) continue
      const all: string[] = []
      const walk = (id: string) => {
        for (const t of direct.get(id) ?? []) {
          if (t === e.id || all.includes(t)) continue
          all.push(t)
          walk(t)
        }
      }
      walk(e.id)
      e.reprintedAs = all
    }
  }

  // 5. 法術 ↔ 職業
  if (out.spell && raw.spellLookup) {
    const classes = present('class')
    for (const sp of out.spell) {
      const info = raw.spellLookup[low(sp.source)]?.[sp.name]
      const refs = spellClasses(info, canon).filter(
        (c) =>
          classes.has(`${c.className}|${low(c.classSource)}`) && (c.definedIn?.some(isAllowed) ?? true),
      )
      if (refs.length) sp.classes = refs
    }
  }

  return out
}

/** 只在泛用變體上有意義、展開後不需要的欄位 */
const VARIANT_ONLY = new Set(['namePrefix', 'nameSuffix', 'nameRemove', 'valueExpression', 'weightExpression', 'valueMult', 'weightMult', 'propertyAdd'])

/**
 * magicvariants.json 的泛用魔法物品變體（例如「+1 武器」「矮人板甲」）：
 * 真正的物品資料放在 `inherits` 裡，套用到符合 `requires` 的基礎物品上。
 * 這裡不展開到每一種基礎物品，只把它當成一筆「泛用變體」物品，並代入內文的 {=欄位} 模板。
 */
export function flattenMagicVariant(v: Json): Json {
  const { inherits = {}, ...own } = v
  const out: Json = { ...own, isGenericVariant: true }
  for (const [k, val] of Object.entries<Json>(inherits)) if (!VARIANT_ONLY.has(k)) out[k] = val
  const fill = (x: Json): Json =>
    typeof x === 'string'
      ? x.replace(/\{=(\w+)(?:\/\w+)?\}/g, (_m, p: string) =>
          p === 'baseName' ? '该物品' : p === 'dmgType' ? '相应类型' : String(inherits[p] ?? ''),
        )
      : Array.isArray(x)
        ? x.map(fill)
        : x && typeof x === 'object'
          ? Object.fromEntries(Object.entries(x).map(([k, val]) => [k, fill(val)]))
          : x
  if (out.entries) out.entries = fill(out.entries)
  return out
}

function normalize(
  kind: EntryKind,
  e: Json,
  canon: (s: unknown) => string,
  sources: Map<string, SourceInfo>,
): Entry {
  const source = canon(e.source)
  const out: Json = {}
  for (const [k, v] of Object.entries(e)) {
    if (!DROP_FIELDS.has(k) && !k.startsWith('foundry')) out[k] = v
  }
  for (const f of ['raceSource', 'classSource', 'subclassSource']) {
    if (out[f] !== undefined) out[f] = canon(out[f])
  }
  const edition: Edition =
    e.edition === 'one' ? '2024' : e.edition === 'classic' ? '2014' : (sources.get(low(source))?.edition ?? '2014')

  const extra: (string | number)[] =
    kind === 'subrace'
      ? [e.raceName, out.raceSource]
      : kind === 'subclass'
        ? [e.className, out.classSource]
        : kind === 'classFeature'
          ? [e.className, out.classSource, e.level]
          : kind === 'subclassFeature'
            ? [e.className, out.classSource, e.subclassShortName, out.subclassSource, e.level]
            : []

  const tceOptional =
    e.isClassFeatureVariant === true || (kind === 'race' && e.lineage === true) ? true : undefined

  return {
    ...out,
    id: makeId(kind, e.name ?? '', source, ...extra),
    kind,
    name: e.name ?? '',
    ...(e.ENG_name ? { engName: e.ENG_name } : {}),
    source,
    edition,
    ...(tceOptional ? { tceOptional } : {}),
  }
}

/** 解析一個 reprintedAs 參照；找不到（例如目標書不在白名單）就回傳 undefined。 */
function resolveReprint(kind: EntryKind, ref: Json, idByKey: Map<string, string>): string | undefined {
  let uid: string
  let target: EntryKind = kind
  if (typeof ref === 'string') uid = ref
  else {
    uid = ref.uid
    target = TAG_KIND[ref.tag] ?? ref.tag
  }
  const parts = uid.split('|')
  if (target === 'subclass') {
    const [short, cls, clsSrc, src] = parts
    return idByKey.get(`subclassRef|${short}|${cls}|${low(clsSrc)}|${low(src ?? clsSrc)}`)
  }
  const [name, src = 'phb'] = parts
  const key = `${name}|${low(src)}`
  // 亞種的重印目標是種族（例如 VGM 阿斯莫亞種 → XPHB 阿斯莫）
  if (target === 'subrace') return idByKey.get(`race|${key}`)
  return idByKey.get(`${target}|${key}`)
}

/** 重印參照的目標來源代碼（子職參照的來源在第 4 段）。 */
function reprintSource(kind: EntryKind, ref: Json): string {
  const uid: string = typeof ref === 'string' ? ref : ref.uid
  const parts = uid.split('|')
  const target = typeof ref === 'string' ? kind : (TAG_KIND[ref.tag] ?? ref.tag)
  if (target === 'subclass') return parts[3] ?? parts[2] ?? ''
  return parts[1] ?? 'phb'
}

function spellClasses(info: Json, canon: (s: unknown) => string): SpellClassRef[] {
  const refs: SpellClassRef[] = []
  for (const [classSource, names] of Object.entries<Json>(info?.class ?? {})) {
    for (const className of Object.keys(names)) refs.push({ className, classSource: canon(classSource) })
  }
  for (const [classSource, names] of Object.entries<Json>(info?.classVariant ?? {})) {
    for (const [className, v] of Object.entries<Json>(names)) {
      const definedIn: string[] = (v.definedInSources ?? []).map(canon)
      const tce = definedIn.includes('TCE')
      refs.push({ className, classSource: canon(classSource), definedIn, ...(tce ? { tceOptional: true } : {}) })
    }
  }
  return refs
}
