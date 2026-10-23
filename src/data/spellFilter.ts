/**
 * 法術篩選（M5-2）：仿上游 5etools 法術頁的篩選面板。純函式，不依賴 Vue。
 *
 * 每個「群組」（來源、環階、職業…）有一組「標籤」，每個標籤是三態：
 *   包含（1，藍）、排除（-1，紅）、不篩選（沒有記錄）。
 * 群組內：
 *   - 有任何「包含」時，OR 模式要符合其中一個、AND 模式要全部符合；
 *   - 任何「排除」的標籤只要符合一個就淘汰（兩種模式都一樣）。
 * 群組之間一律是 AND。
 *
 * 篩選只在「候選範圍」內縮小：候選範圍由選擇欄位決定（例如法術書＝法師清單＋可學環階），見 M5-3。
 * 每道法術的標籤值（facets）由建置期的扁平索引 `idx`、`origins`（scripts/lib/spellIndex.ts）
 * 加上執行期才知道的東西（啟用的書、TCE 開關、是否被重印取代）組成。
 */
import { ABILITY_NAME, isAbility } from '../rules/abilities.ts'
import type { Entry, SpellClassRef, SpellIndex, SpellOrigins } from './types.ts'
import { entryMatches, sourceAbbr } from './sourceDisplay.ts'
import { schoolName } from './summary.ts'

export const SPELL_GROUP_IDS = [
  'source',
  'level',
  'class',
  'subclass',
  'race',
  'background',
  'feat',
  'optionalfeature',
  'misc',
  'school',
  'damage',
  'condition',
  'attack',
  'save',
  'check',
  'time',
  'duration',
  'range',
  'area',
  'creature',
] as const
export type SpellGroupId = (typeof SPELL_GROUP_IDS)[number]

/** 上游有、但中文資料沒有欄位的群組（記在 docs/data-notes.md §15）：子學派（subschools）、組別（groups）。 */
export const SPELL_GROUP_LABEL: Record<SpellGroupId, string> = {
  source: '來源',
  level: '環階',
  class: '職業',
  subclass: '子職',
  race: '種族',
  background: '背景',
  feat: '專長',
  optionalfeature: '其他選項／特性',
  misc: '成分與雜項',
  school: '學派',
  damage: '傷害類型',
  condition: '造成的狀態',
  attack: '法術攻擊',
  save: '豁免',
  check: '屬性檢定',
  time: '施法時間',
  duration: '持續時間',
  range: '射程',
  area: '範圍形狀',
  creature: '影響的生物類型',
}

export type TagState = 1 | -1
export interface GroupState {
  /** 標籤 → 包含（1）／排除（-1）；不在表內＝不篩選 */
  tags: Record<string, TagState>
  mode: 'and' | 'or'
}
export type SpellFilterState = Partial<Record<SpellGroupId, GroupState>>

export type SpellFacets = Record<SpellGroupId, string[]>

/** 計算 facets 需要的執行期資訊（RulesData 與 sourceFilter store 都滿足）。 */
export interface FacetContext {
  tceOptional: boolean
  sourceEnabled(source: string): boolean
  /** 目前書目下已被重印取代 */
  superseded(e: Entry): boolean
}

// ---------------------------------------------------------------------------
// 固定標籤（順序照上游）與顯示名稱
// ---------------------------------------------------------------------------

const MISC_ORDER = ['conc', 'ritual', 'V', 'S', 'M', 'R', 'Mcost', 'Mconsume', 'MconsumeOpt', 'reprinted']
const MISC_TAG_LABEL: Record<string, string> = {
  conc: '專注',
  ritual: '儀式',
  V: '聲音 (V)',
  S: '姿勢 (S)',
  M: '材料 (M)',
  R: '皇家 (R)',
  Mcost: '有花費的材料',
  Mconsume: '會消耗的材料',
  MconsumeOpt: '可能消耗的材料',
  reprinted: '重印（已有新版）',
  HL: '治療',
  THP: '給予臨時生命值',
  SGT: '需要視線',
  PRM: '永久效果',
  SCL: '升環效果',
  SCT: '升環增加目標',
  SMN: '召喚生物',
  MAC: '改變 AC',
  TP: '傳送',
  FMV: '強制移動',
  RO: '可擲骰效果',
  LGTS: '製造日光',
  LGT: '製造光亮',
  UA: '使用動作',
  UBA: '使用附贈動作',
  PS: '位面轉移',
  OBS: '遮蔽視線',
  DFT: '困難地形',
  AAD: '額外攻擊傷害',
  OBJ: '影響物件',
  ADV: '給予優勢',
  PIR: '重複施放則永久',
  BO: '燒毀物件',
}
const DAMAGE_LABEL: Record<string, string> = {
  acid: '強酸 (Acid)',
  bludgeoning: '鈍擊 (Bludgeoning)',
  cold: '寒冷 (Cold)',
  fire: '火焰 (Fire)',
  force: '力場 (Force)',
  lightning: '閃電 (Lightning)',
  necrotic: '暗蝕 (Necrotic)',
  piercing: '穿刺 (Piercing)',
  poison: '毒素 (Poison)',
  psychic: '心靈 (Psychic)',
  radiant: '光耀 (Radiant)',
  slashing: '揮砍 (Slashing)',
  thunder: '雷鳴 (Thunder)',
}
const TIME_LABEL: Record<string, string> = {
  action: '動作',
  bonus: '附贈動作',
  reaction: '反應',
  round: '輪',
  minute: '分鐘',
  hour: '小時',
  special: '特殊',
}
const DURATION_LABEL: Record<string, string> = {
  instant: '立即',
  round: '1 輪',
  minute: '1 分鐘',
  '10minutes': '10 分鐘',
  hour: '1 小時',
  '8hours': '8 小時',
  '24hours': '24 小時以上',
  permanent: '永久',
  special: '特殊',
}
const RANGE_LABEL: Record<string, string> = {
  self: '自身',
  touch: '觸碰',
  point: '指定距離',
  selfArea: '自身（範圍）',
  special: '特殊',
}
const AREA_LABEL: Record<string, string> = {
  ST: '單一目標',
  MT: '多個目標',
  C: '立方',
  N: '錐形',
  Y: '圓柱',
  S: '球形',
  R: '圓形',
  Q: '正方形',
  L: '直線',
  H: '半球',
  W: '牆',
  E: '散發',
}
const ATTACK_LABEL: Record<string, string> = { M: '近戰', R: '遠程' }
const SCHOOL_ENG: Record<string, string> = {
  A: 'Abjuration',
  C: 'Conjuration',
  D: 'Divination',
  E: 'Enchantment',
  V: 'Evocation',
  I: 'Illusion',
  N: 'Necromancy',
  T: 'Transmutation',
}
const ABILITY_ORDER = ['str', 'dex', 'con', 'int', 'wis', 'cha']

/** 固定順序的群組；其餘群組依顯示名稱排序。 */
const FIXED_ORDER: Partial<Record<SpellGroupId, string[]>> = {
  level: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
  misc: [...MISC_ORDER, ...Object.keys(MISC_TAG_LABEL).filter((k) => !MISC_ORDER.includes(k))],
  school: Object.keys(SCHOOL_ENG),
  damage: Object.keys(DAMAGE_LABEL),
  attack: ['M', 'R'],
  save: ABILITY_ORDER,
  check: ABILITY_ORDER,
  time: Object.keys(TIME_LABEL),
  duration: Object.keys(DURATION_LABEL),
  range: Object.keys(RANGE_LABEL),
  area: Object.keys(AREA_LABEL),
}

/** 「名稱|來源」→「名稱（PHB24）」 */
const nameSource = (v: string) => {
  const [name = '', source = ''] = v.split('|')
  return `${name}（${sourceAbbr(source)}）`
}

/**
 * 標籤的顯示名稱。子職預設顯示「職業：短名（來源）」；畫面有資料時可傳 subclassName 換成正式名稱。
 */
export function tagLabel(group: SpellGroupId, value: string, subclassName?: (key: string) => string | undefined): string {
  switch (group) {
    case 'source':
      return sourceAbbr(value)
    case 'level':
      return value === '0' ? '戲法' : `${value} 環`
    case 'class': {
      const [name = '', source = ''] = value.split('|')
      return `${name}（${sourceAbbr(source)}）`
    }
    case 'subclass': {
      const [cls = '', clsSrc = '', short = '', src = ''] = value.split('|')
      const name = subclassName?.(value) ?? short
      return `${cls}（${sourceAbbr(clsSrc)}）：${name}${src !== clsSrc ? `（${sourceAbbr(src)}）` : ''}`
    }
    case 'race':
    case 'background':
    case 'feat':
    case 'optionalfeature':
      return nameSource(value)
    case 'misc':
      return MISC_TAG_LABEL[value] ?? value
    case 'school':
      return `${schoolName(value)} (${SCHOOL_ENG[value] ?? value})`
    case 'damage':
      return DAMAGE_LABEL[value] ?? value
    case 'attack':
      return ATTACK_LABEL[value] ?? value
    case 'save':
    case 'check':
      return isAbility(value) ? ABILITY_NAME[value].zh : value
    case 'time':
      return TIME_LABEL[value] ?? value
    case 'duration':
      return DURATION_LABEL[value] ?? value
    case 'range':
      return RANGE_LABEL[value] ?? value
    case 'area':
      return AREA_LABEL[value] ?? value
    default:
      return value
  }
}

// ---------------------------------------------------------------------------
// facets：每道法術在各群組的標籤值
// ---------------------------------------------------------------------------

const EMPTY: string[] = []
/** 代表「所有類型」的標記陣列（creature 群組用） */
const ANY: string[] = ['*']

/** 法術在職業清單上的職業鍵「職業|職業來源」（擴充表依書目與 TCE 開關，同 spellOnClassList）。 */
export function spellClassKeys(sp: Entry, ctx: Pick<FacetContext, 'tceOptional' | 'sourceEnabled'>): string[] {
  const out: string[] = []
  for (const c of (sp.classes as SpellClassRef[] | undefined) ?? []) {
    if (c.tceOptional && !ctx.tceOptional) continue
    if (c.definedIn && !c.definedIn.some((s) => ctx.sourceEnabled(s))) continue
    const k = `${c.className}|${c.classSource}`
    if (!out.includes(k)) out.push(k)
  }
  return out
}

export function spellFacets(sp: Entry, ctx: FacetContext): SpellFacets {
  const idx = (sp.idx as SpellIndex | undefined) ?? ({ timeSort: 0, dur: 'special', durSort: 0, range: 'special', rangeSort: 0 } as SpellIndex)
  const origins = (sp.origins as SpellOrigins | undefined) ?? {}
  const misc: string[] = []
  if (idx.conc) misc.push('conc')
  if (idx.ritual) misc.push('ritual')
  misc.push(...(idx.comp ?? EMPTY), ...(idx.misc ?? EMPTY))
  if (ctx.superseded(sp)) misc.push('reprinted')
  return {
    source: [sp.source],
    level: [String(sp.level)],
    class: spellClassKeys(sp, ctx),
    subclass: origins.subclass ?? EMPTY,
    race: origins.race ?? EMPTY,
    background: origins.background ?? EMPTY,
    feat: origins.feat ?? EMPTY,
    optionalfeature: origins.optionalfeature ?? EMPTY,
    misc,
    school: [String(sp.school)],
    damage: idx.dmg ?? EMPTY,
    condition: idx.cond ?? EMPTY,
    attack: idx.atk ?? EMPTY,
    save: idx.save ?? EMPTY,
    check: idx.check ?? EMPTY,
    time: idx.time ?? EMPTY,
    duration: [idx.dur],
    range: [idx.range],
    area: idx.area ?? EMPTY,
    // 沒寫生物類型＝不限（上游視為全部類型，任何「包含」都符合、任何「排除」都淘汰）
    creature: idx.creature ?? ANY,
  }
}

// ---------------------------------------------------------------------------
// 比對
// ---------------------------------------------------------------------------

export function matchGroup(values: readonly string[], g: GroupState | undefined): boolean {
  if (!g) return true
  const any = values.length === 1 && values[0] === '*'
  const has = (t: string) => any || values.includes(t)
  const include: string[] = []
  for (const [t, s] of Object.entries(g.tags)) {
    if (s === -1 && has(t)) return false
    if (s === 1) include.push(t)
  }
  if (!include.length) return true
  return g.mode === 'and' ? include.every(has) : include.some(has)
}

export function matchFacets(f: SpellFacets, state: SpellFilterState): boolean {
  for (const id of SPELL_GROUP_IDS) {
    const g = state[id]
    if (g && !matchGroup(f[id], g)) return false
  }
  return true
}

/** 文字搜尋：中文名、英文名、別名、來源代碼或縮寫（共用 entryMatches）。 */
export const spellMatchesQuery = (sp: Entry, query: string) => entryMatches(sp, query)

/** 篩選：候選範圍 → 符合篩選與搜尋的法術。facetsOf 通常是有快取的（見 makeFacetCache）。 */
export function filterSpells(
  candidates: readonly Entry[],
  state: SpellFilterState,
  facetsOf: (sp: Entry) => SpellFacets,
  query = '',
): Entry[] {
  const q = query.trim()
  return candidates.filter((sp) => (!q || spellMatchesQuery(sp, q)) && matchFacets(facetsOf(sp), state))
}

/** facets 快取：同一個 FacetContext（書目、開關不變）下每道法術只算一次。 */
export function makeFacetCache(ctx: FacetContext): (sp: Entry) => SpellFacets {
  const m = new Map<string, SpellFacets>()
  return (sp) => {
    let f = m.get(sp.id)
    if (!f) m.set(sp.id, (f = spellFacets(sp, ctx)))
    return f
  }
}

// ---------------------------------------------------------------------------
// 群組內可用的標籤、預設值、全選／清除
// ---------------------------------------------------------------------------

/** 候選範圍內實際出現的標籤（固定群組照上游順序，其餘依顯示名稱）。 */
export function availableTags(
  group: SpellGroupId,
  spells: readonly Entry[],
  facetsOf: (sp: Entry) => SpellFacets,
  label: (v: string) => string = (v) => tagLabel(group, v),
): string[] {
  const set = new Set<string>()
  for (const sp of spells) for (const v of facetsOf(sp)[group]) if (v !== '*') set.add(v)
  const fixed = FIXED_ORDER[group]
  if (fixed) {
    const known = fixed.filter((v) => set.has(v))
    return [...known, ...[...set].filter((v) => !fixed.includes(v)).sort()]
  }
  return [...set].sort((a, b) => label(a).localeCompare(label(b), 'zh'))
}

export interface DefaultContext {
  /** 目前啟用的書目 */
  enabledSources: readonly string[]
  /** 全域「顯示已被重印取代的版本」 */
  showLegacy: boolean
}

/** 某個群組的預設值：來源＝啟用的書目（包含）；重印＝排除（除非全域顯示舊版）；其餘不篩選。 */
export function defaultGroup(group: SpellGroupId, ctx: DefaultContext): GroupState | undefined {
  if (group === 'source') return { mode: 'or', tags: Object.fromEntries(ctx.enabledSources.map((s) => [s, 1 as const])) }
  if (group === 'misc' && !ctx.showLegacy) return { mode: 'or', tags: { reprinted: -1 } }
  return undefined
}

export function defaultFilterState(ctx: DefaultContext): SpellFilterState {
  const out: SpellFilterState = {}
  for (const id of SPELL_GROUP_IDS) {
    const g = defaultGroup(id, ctx)
    if (g) out[id] = g
  }
  return out
}

/** 三態循環：不篩選 → 包含 → 排除 → 不篩選（上游的點擊順序）。回傳新的群組狀態。 */
export function cycleTag(g: GroupState | undefined, tag: string): GroupState {
  const tags = { ...g?.tags }
  const cur = tags[tag]
  if (cur === undefined) tags[tag] = 1
  else if (cur === 1) tags[tag] = -1
  else delete tags[tag]
  return { mode: g?.mode ?? 'or', tags }
}

/** 全選：所有可用標籤設為包含。 */
export const selectAll = (g: GroupState | undefined, tags: readonly string[]): GroupState => ({
  mode: g?.mode ?? 'or',
  tags: Object.fromEntries(tags.map((t) => [t, 1 as const])),
})

/** 清除：整個群組不篩選（保留 AND／OR）。 */
export const clearGroup = (g: GroupState | undefined): GroupState => ({ mode: g?.mode ?? 'or', tags: {} })

export const toggleMode = (g: GroupState | undefined): GroupState => ({
  tags: { ...g?.tags },
  mode: g?.mode === 'and' ? 'or' : 'and',
})

/** 群組目前有幾個標籤在作用（面板收合時顯示用）。 */
export const activeCount = (g: GroupState | undefined) => (g ? Object.keys(g.tags).length : 0)

// ---------------------------------------------------------------------------
// 排序
// ---------------------------------------------------------------------------

export type SpellSortKey = 'name' | 'level' | 'time' | 'school' | 'conc' | 'range' | 'duration' | 'components' | 'source'
export interface SpellSort {
  key: SpellSortKey
  dir: 1 | -1
}
export const DEFAULT_SORT: SpellSort = { key: 'level', dir: 1 }

const idxOf = (sp: Entry) => (sp.idx as SpellIndex | undefined) ?? ({} as Partial<SpellIndex>)
const byName = (a: Entry, b: Entry) => (a.engName ?? a.name).localeCompare(b.engName ?? b.name)

const SORT_VALUE: Record<SpellSortKey, (sp: Entry) => number | string> = {
  name: (sp) => (sp.engName ?? sp.name).toLowerCase(),
  level: (sp) => Number(sp.level),
  time: (sp) => idxOf(sp).timeSort ?? 0,
  school: (sp) => schoolName(sp.school),
  conc: (sp) => (idxOf(sp).conc ? 0 : 1),
  range: (sp) => idxOf(sp).rangeSort ?? 0,
  duration: (sp) => idxOf(sp).durSort ?? 0,
  components: (sp) => (idxOf(sp).comp ?? []).join(' '),
  source: (sp) => sourceAbbr(sp.source),
}

/** 依某一欄排序；同值時依環階、再依名稱（預設排序＝環階→名稱）。不改動輸入陣列。 */
export function sortSpells(list: readonly Entry[], sort: SpellSort = DEFAULT_SORT): Entry[] {
  const val = SORT_VALUE[sort.key]
  return [...list].sort((a, b) => {
    const va = val(a)
    const vb = val(b)
    const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'zh')
    return c * sort.dir || Number(a.level) - Number(b.level) || byName(a, b)
  })
}
