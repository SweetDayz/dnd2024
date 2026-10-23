// 法術的扁平篩選索引（M5-1）：把巢狀的 5etools 欄位在建置期整理成一層的字串陣列與排序鍵，
// 執行期的篩選（src/data/spellFilter.ts）只要做集合比對，不必再解析 components、duration 這些結構。
// 分類方式照上游 5etools 的法術頁（js/filter-spells.js v2.38.0），欄位實測見 docs/data-notes.md §15。
import type { SpellIndex, SpellOrigins } from '../../src/data/types.ts'
import type { Json } from './raw.ts'

/** 屬性名（英文全名或簡體中文）→ 屬性鍵。savingThrow 多半是英文全名，abilityCheck 是中文。 */
const ABILITY_KEY: Record<string, string> = {
  strength: 'str',
  dexterity: 'dex',
  constitution: 'con',
  intelligence: 'int',
  wisdom: 'wis',
  charisma: 'cha',
  力量: 'str',
  敏捷: 'dex',
  体质: 'con',
  智力: 'int',
  感知: 'wis',
  魅力: 'cha',
}

const FEET_PER_MILE = 5280

/** 施法時間排序鍵（秒）：附贈動作、反應排在動作後面；有多種時間的再加 0.5。照上游 getNormalisedTime。 */
function timeSort(time: Json[]): number {
  const t = time[0]
  if (!t) return 1e9
  const mult: Record<string, number> = { round: 6, minute: 60, hour: 3600, special: 1e6 }
  const offset: Record<string, number> = { bonus: 1, reaction: 2 }
  return (mult[t.unit] ?? 1) * (t.number ?? 1) + (offset[t.unit] ?? 0) + (time.length > 1 ? 0.5 : 0)
}

/** 持續時間分類（照上游的 9 個標籤，只看第一個持續時間）。 */
function durationBucket(duration: Json[]): string {
  const d = duration[0]
  if (!d) return 'special'
  if (d.type === 'instant') return 'instant'
  if (d.type === 'permanent') return 'permanent'
  if (d.type !== 'timed' || !d.duration) return 'special'
  const n = Number(d.duration.amount ?? 0)
  switch (d.duration.type) {
    case 'turn':
    case 'round':
      return 'round'
    case 'minute':
      return n <= 1 ? 'minute' : n <= 10 ? '10minutes' : n <= 60 ? 'hour' : n <= 480 ? '8hours' : '24hours'
    case 'hour':
      return n <= 1 ? 'hour' : n <= 8 ? '8hours' : '24hours'
    default:
      return '24hours'
  }
}

/** 持續時間排序鍵（秒）：立即 0、永久與特殊排最後。 */
function durationSort(duration: Json[]): number {
  const d = duration[0]
  if (!d || d.type === 'special') return 1e10
  if (d.type === 'instant') return 0
  if (d.type === 'permanent') return 1e9
  const sec: Record<string, number> = { turn: 6, round: 6, minute: 60, hour: 3600, day: 86400, week: 604800, month: 2592000, year: 31536000 }
  return (sec[d.duration?.type] ?? 1) * Number(d.duration?.amount ?? 1)
}

/** 射程分類：自身、觸碰、指定點、自身（範圍）、特殊。 */
function rangeBucket(range: Json): string {
  if (!range || range.type === 'special') return 'special'
  if (range.type === 'point') {
    const t = range.distance?.type
    return t === 'self' ? 'self' : t === 'touch' ? 'touch' : 'point'
  }
  return 'selfArea'
}

/** 射程排序鍵（吋，照上游 getNormalisedRange：同距離時以形狀區分先後）。 */
function rangeSort(range: Json): number {
  if (!range || range.type === 'special') return 1e9
  const offset: Record<string, number> = { line: 1, cone: 2, emanation: 3, radius: 4, hemisphere: 5, sphere: 6, cylinder: 7, cube: 8 }
  const d = range.distance ?? {}
  let inches = 0
  switch (d.type) {
    case 'feet':
      inches = 12 * Number(d.amount ?? 0)
      break
    case 'yards':
      inches = 36 * Number(d.amount ?? 0)
      break
    case 'miles':
      inches = 12 * FEET_PER_MILE * Number(d.amount ?? 0)
      break
    case 'touch':
      inches = 1
      break
    case 'sight':
      inches = 12 * FEET_PER_MILE * 12
      break
    case 'unlimited':
      inches = 900000001
      break
  }
  return inches + (offset[range.type] ?? 0)
}

const uniq = (xs: string[]) => [...new Set(xs)]

/** 一道法術（raw 欄位）的篩選索引。 */
export function spellIndex(sp: Json): SpellIndex {
  const c = sp.components ?? {}
  const m = c.m
  const comp: string[] = []
  if (c.v) comp.push('V')
  if (c.s) comp.push('S')
  if (m) comp.push('M')
  if (c.r) comp.push('R')
  if (m && typeof m === 'object' && m.cost) comp.push('Mcost')
  if (m && typeof m === 'object' && m.consume) comp.push(m.consume === 'optional' ? 'MconsumeOpt' : 'Mconsume')

  const duration: Json[] = sp.duration ?? []
  const misc: string[] = [...(sp.miscTags ?? [])]
  // 上游補的兩個推導標籤：有永久持續時間→PRM；有升環說明→SCL
  if (!misc.includes('PRM') && duration.some((d) => d.type === 'permanent')) misc.push('PRM')
  if (!misc.includes('SCL') && sp.entriesHigherLevel) misc.push('SCL')

  const area: string[] = [...(sp.areaTags ?? [])]
  if (sp.range?.type === 'line' && !area.includes('L')) area.push('L')
  if (sp.range?.type === 'emanation' && !area.includes('E')) area.push('E')

  const abilities = (xs: unknown) => uniq(((xs as string[] | undefined) ?? []).map((a) => ABILITY_KEY[a] ?? a))

  // 空陣列與 false 不寫出（全部法術合計省約 0.1 MB），讀取端一律用 `?? []`
  const idx: Json = {
    time: uniq(((sp.time ?? []) as Json[]).map((t) => String(t.unit))),
    timeSort: timeSort(sp.time ?? []),
    dur: durationBucket(duration),
    durSort: durationSort(duration),
    conc: duration.some((d) => d.concentration),
    ritual: !!sp.meta?.ritual,
    comp,
    misc: uniq(misc),
    range: rangeBucket(sp.range),
    rangeSort: rangeSort(sp.range),
    area: uniq(area),
    dmg: uniq(sp.damageInflict ?? []),
    cond: uniq(sp.conditionInflict ?? []),
    save: abilities(sp.savingThrow),
    check: abilities(sp.abilityCheck),
    atk: uniq(sp.spellAttack ?? []),
    creature: uniq(sp.affectsCreatureType ?? []),
  }
  for (const [k, v] of Object.entries(idx)) if (v === false || (Array.isArray(v) && !v.length)) delete idx[k]
  return idx as SpellIndex
}

/**
 * spell lookup（generated/gendata-spell-source-lookup.json）的子職、種族、背景、專長、其他特性 → 扁平清單。
 * 職業（class、classVariant）另外由 pipeline 的 spellClasses 處理；reward（祝福、魔力恩賜）不屬於建角，不收。
 * 只保留來源在白名單內的條目。
 */
export function spellOrigins(info: Json, canon: (s: unknown) => string, isAllowed: (s: unknown) => boolean): SpellOrigins {
  const out: SpellOrigins = {}
  // 子職：「職業|職業來源|子職短名|子職來源」（顯示名稱執行期從 classes 資料查，省下約 0.4 MB）
  const subclass: string[] = []
  for (const [classSource, byClass] of Object.entries<Json>(info?.subclass ?? {})) {
    for (const [className, bySource] of Object.entries<Json>(byClass)) {
      for (const [source, byShort] of Object.entries<Json>(bySource)) {
        if (!isAllowed(source) || !isAllowed(classSource)) continue
        for (const shortName of Object.keys(byShort)) subclass.push(`${className}|${canon(classSource)}|${shortName}|${canon(source)}`)
      }
    }
  }
  if (subclass.length) out.subclass = subclass
  // 其他：「名稱|來源」
  for (const kind of ['race', 'background', 'feat', 'optionalfeature'] as const) {
    const list: string[] = []
    for (const [source, byName] of Object.entries<Json>(info?.[kind] ?? {})) {
      if (!isAllowed(source)) continue
      for (const name of Object.keys(byName)) list.push(`${name}|${canon(source)}`)
    }
    if (list.length) out[kind] = list
  }
  return out
}
