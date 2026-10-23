/**
 * 建角引擎核心：角色的「選擇」＋資料 → 這個角色擁有什麼（Build）。
 *
 * 做法：依序走過職業（逐級）、背景、種族、專長，把每個條目的結構化欄位
 * （skillProficiencies、ability、feats、additionalSpells…）轉成兩種東西：
 *   - grant（獲得）：固定的熟練、屬性加值、抗性、法術…
 *   - ChoiceSlot（選擇欄位）：需要玩家選的東西，例如「從這 7 項技能選 2 項」
 * 選擇欄位的 key 是穩定字串（以條目 id 開頭），玩家選的值存在 character.choices[key]。
 * 選了之後可能又產生新的選擇（例如 ASI 選了專長 → 專長自己的屬性選擇），所以是遞迴處理。
 *
 * 這裡只決定「有什麼」，數值計算在 derive.ts。純函式，不依賴 Vue。
 */
import type { Entry } from '../data/types.ts'
import { classFeatureRef, subclassFeatureRef } from '../data/classRefs.ts'
import { ABILITIES, ABILITY_NAME, isAbility, type Ability } from './abilities.ts'
import { abilityScores } from './derive.ts'
import { goldAlternative, startingSets } from './equipment.ts'
import { canMulticlass } from './multiclass.ts'
import { classCastings, classSpellList } from './spells.ts'
import type { Character } from './character.ts'
import {
  LANGUAGE_TYPE_LABEL,
  LANGUAGE_TYPES,
  languageType,
  canPick,
  languageKey,
  languageList,
  lookupRef,
  normalizeSkill,
  profLabel,
  refToId,
  skillList,
  spellsByFilter,
  toolList,
  toolType,
  type ProfType,
  type RulesData,
} from './data.ts'

// ---------------------------------------------------------------------------
// 型別
// ---------------------------------------------------------------------------

/** 建角精靈的步驟（選擇欄位顯示在哪一步）。 */
export type Step =
  | 'class'
  | 'background'
  | 'race'
  | 'abilities'
  | 'proficiencies'
  | 'languages'
  | 'levels'
  | 'spells'
  | 'equipment'

export type OriginType = 'race' | 'background' | 'class' | 'subclass' | 'feat' | 'optionalfeature' | 'rule'

/** 某個東西是從哪裡來的（顯示「侏儒狡黠｜種族：侏儒｜XPHB p.191」用）。 */
export interface Origin {
  type: OriginType
  /** 顯示名稱，例如「侍僧」「法师 3 级」 */
  name: string
  entry?: Entry
  /** 取得時的角色等級 */
  level: number
  /** 依 2024 相容規則處理的 2014 條目 */
  compat?: boolean
}

export type SlotType =
  | ProfType
  | 'mixed'
  | 'ability'
  | 'abilityWeighted'
  | 'alternative'
  | 'feat'
  | 'subclass'
  | 'version'
  | 'defense'
  | 'size'
  | 'optionalfeature'
  | 'spell'
  | 'toggle'
  | 'equipment'

export interface ChoiceOption {
  value: string
  label: string
  /** 對應的條目（有的話顯示來源徽章與說明） */
  entry?: Entry
  /** 不能選的原因（例如「已熟練」「不符先決條件」） */
  disabled?: string
  /** 附註（例如「TCE 可選規則」） */
  note?: string
  /** 分組標題（例如語言的「標準」「稀有」）；有的話畫面依組顯示 */
  group?: string
  /** 預設不列出、要打開欄位的 restrictedToggle 才顯示（例如稀有語言需 DM 同意） */
  restricted?: boolean
}

export interface ChoiceSlot {
  key: string
  type: SlotType
  label: string
  origin: Origin
  step: Step
  /** 要選幾個 */
  count: number
  /** 屬性加值欄位：每個位置（或每個選擇）的加值，例如 abilityWeighted 的 [2, 1]、「選 2 項各 +1」的 [1, 1] */
  weights?: number[]
  /** 屬性加值欄位：加值的上限（一般 20，傳奇恩惠 30） */
  abilityMax?: number
  /** 有 restricted 選項時，畫面上「顯示這些選項」開關的文字 */
  restrictedToggle?: string
  options: ChoiceOption[]
  /** 目前有效的選擇（已去掉不在選項中的舊值） */
  selected: string[]
  /** 已選滿 */
  done: boolean
  warnings: string[]
}

export interface ProfGrant {
  type: ProfType
  value: string
  origin: Origin
  /** 由選擇欄位得到的 */
  slotKey?: string
}

export interface AbilityGrant {
  ability: Ability
  amount: number
  origin: Origin
  /** 這個加值最多能把屬性提到多少（一般 20，傳奇恩惠 30） */
  max: number
}

export interface DefenseGrant {
  type: 'resist' | 'immune' | 'vulnerable' | 'conditionImmune'
  value: string
  origin: Origin
}

export interface SpellGrant {
  key: string
  spellId?: string
  /** 由選擇欄位得到的法術 */
  slotKey?: string
  origin: Origin
  /** 施法屬性：固定值、`inherit`（沿用職業）、或尚未選擇（undefined） */
  ability?: Ability | 'inherit'
  /**
   * known：習得（戲法、種族與專長給的法術）；prepared：永遠準備；innate：天生施法；expanded：擴充職業清單；
   * spellbook：在法術書裡（未必準備）；class：職業選的已準備／已知法術（佔職業的數量上限）
   */
  mode: 'known' | 'prepared' | 'innate' | 'expanded' | 'spellbook' | 'class'
  /** 不耗法術位的施展次數 */
  uses?: { n: number | 'pb'; per: 'long' | 'short' | 'will' }
}

export type FeatureCategory = 'class' | 'subclass' | 'race' | 'background' | 'feat' | 'optionalfeature'

export interface Feature {
  key: string
  entry: Entry
  category: FeatureCategory
  origin: Origin
  /** 這個特性底下的選擇欄位（角卡上顯示「未選擇」用） */
  slotKeys: string[]
}

export interface ClassInfo {
  entry: Entry
  level: number
  subclass?: Entry
  /** 是起始職業 */
  primary: boolean
}

export interface Build {
  slots: ChoiceSlot[]
  features: Feature[]
  profs: ProfGrant[]
  abilityBonuses: AbilityGrant[]
  defenses: DefenseGrant[]
  senses: { type: string; range: number; origin: Origin }[]
  speeds: { mode: string; value: number; origin: Origin }[]
  size: { value: string; origin: Origin } | null
  creatureTypes: string[]
  feats: { entry: Entry; origin: Origin; key: string }[]
  spells: SpellGrant[]
  classes: ClassInfo[]
  race?: Entry
  background?: Entry
  notes: { text: string; origin?: Origin }[]
  /** 已選、但目前書目下已被重印取代的條目（不自動移除，只警示；M6 審卡報告也會列出） */
  legacyPicks: LegacyPick[]
}

export interface LegacyPick {
  entry: Entry
  /** 取代它的新版 */
  newer: Entry
  /** 在哪裡選的：選擇欄位 key，或 race／background／class:<id> */
  where: string
}

// ---------------------------------------------------------------------------
// 內部工具
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any

interface Ctx {
  c: Character
  data: RulesData
  out: Build
  /** 已處理過的專長 key，避免循環 */
  seen: Set<string>
}

const ALL_ABILITIES: string[] = [...ABILITIES]

function abilityLabel(a: string): string {
  return isAbility(a) ? `${ABILITY_NAME[a].zh} (${ABILITY_NAME[a].abbr})` : a
}

/** 新增選擇欄位，回傳目前有效的選擇。 */
function addSlot(
  ctx: Ctx,
  s: Omit<ChoiceSlot, 'selected' | 'done' | 'warnings'> & { warnings?: string[] },
): string[] {
  const raw = ctx.c.choices[s.key] ?? []
  const valid = new Set(s.options.map((o) => o.value))
  const warnings = [...(s.warnings ?? [])]
  let selected: string[]
  if (s.type === 'abilityWeighted') {
    // 位置有意義（第 i 個位置得到 weights[i]），空位以 '' 表示
    selected = Array.from({ length: s.count }, (_, i) => (valid.has(raw[i] ?? '') ? raw[i]! : ''))
  } else {
    selected = raw.filter((v) => valid.has(v)).slice(0, s.count)
  }
  const stale = raw.filter((v) => v && !valid.has(v))
  if (stale.length) warnings.push(`先前的選擇目前不可用（可能是書目或其他選擇改了）：${stale.join('、')}`)
  const filled = selected.filter(Boolean).length
  const slot: ChoiceSlot = { ...s, selected, done: filled >= s.count || filled >= s.options.length, warnings }
  ctx.out.slots.push(slot)
  return selected.filter(Boolean)
}

/** 陣列有多個元素 = 多種方案擇一。只有一個就直接用。 */
function pickAlternative(
  ctx: Ctx,
  key: string,
  list: Json[],
  label: string,
  labelOf: (alt: Json, i: number) => string,
  origin: Origin,
  step: Step,
): Json | undefined {
  if (list.length <= 1) return list[0]
  const [sel] = addSlot(ctx, {
    key: `${key}:alt`,
    type: 'alternative',
    label,
    origin,
    step,
    count: 1,
    options: list.map((alt, i) => ({ value: String(i), label: labelOf(alt, i) })),
  })
  return sel === undefined ? undefined : list[Number(sel)]
}

function entryOption(e: Entry, disabled?: string): ChoiceOption {
  return {
    value: e.id,
    label: e.engName && e.engName !== e.name ? `${e.name} (${e.engName})` : e.name,
    entry: e,
    ...(disabled ? { disabled } : {}),
    ...(e.tceOptional ? { note: 'TCE 可選規則' } : {}),
  }
}

// ---------------------------------------------------------------------------
// 熟練（技能、工具、語言、武器、護甲、豁免、專精）
// ---------------------------------------------------------------------------

const TOOL_CATEGORY: Record<string, string> = {
  anyArtisansTool: 'AT',
  "artisan's tools": 'AT',
  anyMusicalInstrument: 'INS',
  'musical instrument': 'INS',
  anyGamingSet: 'GS',
  'gaming set': 'GS',
}

function profOptions(ctx: Ctx, type: ProfType, token: string): ChoiceOption[] | undefined {
  const { data } = ctx
  const opt = (value: string): ChoiceOption => ({ value, label: profLabel(data, type, value) })
  switch (type) {
    case 'skill':
    case 'expertise':
      if (['any', 'anySkill', '任意技能'].includes(token)) return skillList(data).map((s) => opt(s.key))
      return undefined
    case 'tool': {
      const cat = TOOL_CATEGORY[token]
      const tools = toolList(data)
      if (cat) return tools.filter((t) => toolType(t) === cat).map((t) => opt(t.engName!.toLowerCase()))
      if (['any', 'anyTool', '任意工具'].includes(token)) return tools.map((t) => opt(t.engName!.toLowerCase()))
      return undefined
    }
    case 'language': {
      const langs = languageList(data)
      if (token === 'anyStandard') {
        // 2024 規則的「標準語言表」只有 XPHB 那張；沒啟用 XPHB 時才退回所有標準語言
        const std = langs.filter((l) => l.type === 'standard')
        const x = std.filter((l) => l.source === 'XPHB')
        return (x.length ? x : std).map((l) => opt(languageKey(l)))
      }
      if (token === 'anyExotic' || token === 'anyRare')
        return langs.filter((l) => l.type !== 'standard').map((l) => opt(languageKey(l)))
      if (['any', 'anyLanguage', 'other', '任意语言'].includes(token)) return langs.map((l) => opt(languageKey(l)))
      return undefined
    }
    case 'save':
      if (token === 'any') return ALL_ABILITIES.map(opt)
      return undefined
    default:
      return undefined
  }
}

/** 資料裡的值（英文鍵或中文名）→ 存檔用的鍵。 */
function normalizeProf(ctx: Ctx, type: ProfType, v: string): string {
  const { data } = ctx
  switch (type) {
    case 'skill':
    case 'expertise':
      return normalizeSkill(data, v) ?? v.toLowerCase()
    case 'tool': {
      const t = toolList(data).find((x) => x.name === v)
      return t ? t.engName!.toLowerCase() : v.toLowerCase()
    }
    case 'language': {
      const l = languageList(data).find((x) => x.name === v)
      return l ? languageKey(l) : v.toLowerCase()
    }
    case 'weapon':
      return v === '简易' ? 'simple' : v === '军用' ? 'martial' : v.toLowerCase()
    default:
      return v.toLowerCase()
  }
}

function grantProf(ctx: Ctx, type: ProfType, value: string, origin: Origin, slotKey?: string) {
  ctx.out.profs.push({ type, value, origin, ...(slotKey ? { slotKey } : {}) })
}

const PROF_LABEL: Record<ProfType, string> = {
  skill: '技能熟練',
  tool: '工具熟練',
  language: '語言',
  weapon: '武器熟練',
  armor: '護甲訓練',
  save: '豁免熟練',
  expertise: '專精',
}

const PROF_STEP: Record<ProfType, Step> = {
  skill: 'proficiencies',
  tool: 'proficiencies',
  language: 'languages',
  weapon: 'proficiencies',
  armor: 'proficiencies',
  save: 'proficiencies',
  expertise: 'proficiencies',
}

/** 武器篩選字串（type=军用武器|property=轻型）→ 顯示文字與符合的基礎武器。 */
function weaponFilter(ctx: Ctx, filter: string): { label: string; items: Entry[] } {
  const parts = Object.fromEntries(filter.split('|').map((p) => p.split('=') as [string, string]))
  const cat = parts.type?.includes('军用') ? 'martial' : parts.type?.includes('简易') ? 'simple' : undefined
  const label = `${parts.type ?? '武器'}${parts.property ? `（${parts.property.replace(/;/g, '或')}）` : ''}`
  const items = ctx.data
    .list('item')
    .filter((it) => it.isBaseItem && it.weapon && it.edition === '2024' && (!cat || it.weaponCategory === cat))
  return { label, items }
}

function describeProfAlt(ctx: Ctx, type: ProfType, alt: Json): string {
  const parts: string[] = []
  for (const [k, v] of Object.entries<Json>(alt ?? {})) {
    if (v === true) parts.push(profLabel(ctx.data, type, normalizeProf(ctx, type, k)))
    else if (k === 'choose') parts.push(`從 ${(v.from ?? []).length} 項選 ${v.count ?? 1}`)
    else if (typeof v === 'number') parts.push(`${k} ×${v}`)
  }
  return parts.join('、') || JSON.stringify(alt)
}

/** 處理一個熟練欄位（陣列 = 方案擇一）。 */
function processProfField(ctx: Ctx, type: ProfType, list: Json[], prefix: string, origin: Origin, step?: Step) {
  const st = step ?? PROF_STEP[type]
  const key = `${prefix}:${type}`
  const alt = pickAlternative(
    ctx,
    key,
    list,
    `${PROF_LABEL[type]}：選擇一種方案`,
    (a) => describeProfAlt(ctx, type, a),
    origin,
    st,
  )
  if (!alt) return
  let n = 0
  for (const [k, v] of Object.entries<Json>(alt)) {
    if (v === true) {
      if (type === 'weapon' && k === 'all') continue
      grantProf(ctx, type, normalizeProf(ctx, type, k), origin)
    } else if (k === 'all' && type === 'weapon' && v?.fromFilter) {
      grantProf(ctx, type, `filter:${weaponFilter(ctx, v.fromFilter).label}`, origin)
    } else if (k === 'choose') {
      const slotKey = `${key}:${n++}`
      let options: ChoiceOption[] = []
      if (v.fromFilter && type === 'weapon') {
        options = weaponFilter(ctx, v.fromFilter).items.map((it) => ({
          value: `${it.name}|${it.source}`.toLowerCase(),
          label: profLabel(ctx.data, 'weapon', `${it.name}|${it.source}`),
          entry: it,
        }))
      } else {
        for (const f of v.from ?? []) {
          const cat = profOptions(ctx, type, f)
          if (cat) options.push(...cat)
          else {
            const value = normalizeProf(ctx, type, f)
            options.push({ value, label: profLabel(ctx.data, type, value) })
          }
        }
      }
      const count = v.count ?? 1
      const sel = addSlot(ctx, {
        key: slotKey,
        type,
        label: `${PROF_LABEL[type]}（選 ${count}）`,
        origin,
        step: st,
        count,
        options: dedupeOptions(options),
      })
      for (const s of sel) grantProf(ctx, type, s, origin, slotKey)
    } else if (typeof v === 'number') {
      const options = profOptions(ctx, type, k)
      if (!options) {
        ctx.out.notes.push({ text: `無法辨識的${PROF_LABEL[type]}選項「${k}」×${v}，請手動處理`, origin })
        continue
      }
      const slotKey = `${key}:${n++}`
      const sel = addSlot(ctx, {
        key: slotKey,
        type,
        label: `${PROF_LABEL[type]}（選 ${v}）`,
        origin,
        step: st,
        count: v,
        options,
      })
      for (const s of sel) grantProf(ctx, type, s, origin, slotKey)
    }
  }
}

function dedupeOptions(options: ChoiceOption[]): ChoiceOption[] {
  const seen = new Set<string>()
  return options.filter((o) => (seen.has(o.value) ? false : (seen.add(o.value), true)))
}

/** skillToolLanguageProficiencies：技能、工具、語言混在一起選。值存成「type:key」。 */
function processMixedProf(ctx: Ctx, list: Json[], prefix: string, origin: Origin) {
  const key = `${prefix}:mixed`
  const alt = pickAlternative(ctx, key, list, '技能／工具／語言：選擇一種方案', (_a, i) => `方案 ${i + 1}`, origin, 'proficiencies')
  if (!alt) return
  const typeOf: Record<string, ProfType> = {
    任意技能: 'skill',
    任意工具: 'tool',
    任意语言: 'language',
    anySkill: 'skill',
    anyTool: 'tool',
    anyLanguage: 'language',
  }
  const tokenOf: Record<ProfType, string> = {
    skill: 'any',
    tool: 'any',
    language: 'any',
    weapon: '',
    armor: '',
    save: '',
    expertise: '',
  }
  let n = 0
  const add = (types: ProfType[], count: number) => {
    const options: ChoiceOption[] = []
    for (const t of types) {
      for (const o of profOptions(ctx, t, tokenOf[t]) ?? []) {
        options.push({ value: `${t}:${o.value}`, label: `${PROF_LABEL[t]}：${o.label}` })
      }
    }
    const slotKey = `${key}:${n++}`
    const sel = addSlot(ctx, {
      key: slotKey,
      type: 'mixed',
      label: `技能／工具／語言（選 ${count}）`,
      origin,
      step: 'proficiencies',
      count,
      options,
    })
    for (const s of sel) {
      const [t, v] = s.split(/:(.*)/s) as [ProfType, string]
      grantProf(ctx, t, v, origin, slotKey)
    }
  }
  for (const [k, v] of Object.entries<Json>(alt)) {
    if (k === 'choose') {
      for (const c of [].concat(v) as Json[]) {
        add(
          (c.from ?? []).map((f: string) => typeOf[f]).filter(Boolean),
          c.count ?? 1,
        )
      }
    } else if (typeof v === 'number' && typeOf[k]) add([typeOf[k]!], v)
  }
}

// ---------------------------------------------------------------------------
// 屬性加值
// ---------------------------------------------------------------------------

function describeAbilityAlt(alt: Json): string {
  const parts: string[] = []
  for (const [k, v] of Object.entries<Json>(alt ?? {})) {
    if (isAbility(k)) parts.push(`${abilityLabel(k)} +${v}`)
    else if (k === 'choose') {
      if (v.weighted) parts.push(v.weighted.weights.map((w: number) => `+${w}`).join(' / '))
      else {
        const count = v.count ?? 1
        const amount = v.amount ?? 1
        parts.push(count > 1 ? `${count} 項各 +${amount}` : `一項 +${amount}`)
      }
    }
  }
  return parts.join('、')
}

function processAbility(ctx: Ctx, list: Json[], prefix: string, origin: Origin, step: Step) {
  const key = `${prefix}:ability`
  const alt = pickAlternative(ctx, key, list, '屬性值提升：選擇一種方式', describeAbilityAlt, origin, step)
  if (!alt) return
  const max = Number(alt.max ?? 20)
  for (const [k, v] of Object.entries<Json>(alt)) {
    if (isAbility(k)) ctx.out.abilityBonuses.push({ ability: k, amount: Number(v), origin, max })
    else if (k === 'choose') {
      const from: string[] = (v.weighted?.from ?? v.from ?? ALL_ABILITIES).filter(isAbility)
      const options = from.map((a) => ({ value: a, label: abilityLabel(a) }))
      if (v.weighted) {
        const weights: number[] = v.weighted.weights
        const sel = addSlot(ctx, {
          key: `${key}:w`,
          type: 'abilityWeighted',
          label: `屬性值提升（${weights.map((w) => `+${w}`).join(' / ')}，不可重複）`,
          origin,
          step,
          count: weights.length,
          weights,
          abilityMax: max,
          options,
        })
        const raw = ctx.out.slots[ctx.out.slots.length - 1]!.selected
        raw.forEach((a, i) => {
          if (a && isAbility(a)) ctx.out.abilityBonuses.push({ ability: a, amount: weights[i] ?? 0, origin, max })
        })
        if (new Set(sel).size !== sel.length) ctx.out.slots[ctx.out.slots.length - 1]!.warnings.push('同一項屬性不能選兩次')
      } else {
        const count = v.count ?? 1
        const amount = v.amount ?? 1
        const sel = addSlot(ctx, {
          key: `${key}:c`,
          type: 'ability',
          label: count > 1 ? `屬性值提升（選 ${count} 項，各 +${amount}）` : `屬性值提升（選 1 項 +${amount}）`,
          origin,
          step,
          count,
          weights: Array<number>(count).fill(amount),
          abilityMax: max,
          options,
        })
        for (const a of sel) if (isAbility(a)) ctx.out.abilityBonuses.push({ ability: a, amount, origin, max })
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 抗性、感官、速度、體型
// ---------------------------------------------------------------------------

const DEFENSE_LABEL = { resist: '傷害抗性', immune: '傷害免疫', vulnerable: '傷害易傷', conditionImmune: '狀態免疫' }

function processDefense(ctx: Ctx, type: DefenseGrant['type'], list: Json[], prefix: string, origin: Origin, step: Step) {
  let n = 0
  for (const item of list) {
    if (typeof item === 'string') ctx.out.defenses.push({ type, value: item, origin })
    else if (item?.choose) {
      const count = item.choose.count ?? 1
      const sel = addSlot(ctx, {
        key: `${prefix}:${type}:${n++}`,
        type: 'defense',
        label: `${DEFENSE_LABEL[type]}（選 ${count}）`,
        origin,
        step,
        count,
        options: (item.choose.from ?? []).map((v: string) => ({ value: v, label: v })),
      })
      for (const v of sel) ctx.out.defenses.push({ type, value: v, origin })
    }
  }
}

const SIZE_LABEL: Record<string, string> = {
  T: '微型 (Tiny)',
  S: '小型 (Small)',
  M: '中型 (Medium)',
  L: '大型 (Large)',
  H: '巨型 (Huge)',
  G: '超巨型 (Gargantuan)',
}
export const sizeLabel = (s: string) => SIZE_LABEL[s] ?? s

function processSensesSpeed(ctx: Ctx, e: Entry, origin: Origin) {
  if (typeof e.darkvision === 'number') ctx.out.senses.push({ type: 'darkvision', range: e.darkvision, origin })
  if (typeof e.blindsight === 'number') ctx.out.senses.push({ type: 'blindsight', range: e.blindsight, origin })
  for (const s of (e.senses as Json[] | undefined) ?? []) {
    for (const [k, v] of Object.entries<Json>(s)) if (typeof v === 'number') ctx.out.senses.push({ type: k, range: v, origin })
  }
  const sp = e.speed as Json
  if (typeof sp === 'number') ctx.out.speeds.push({ mode: 'walk', value: sp, origin })
  else if (sp && typeof sp === 'object') {
    const walk = typeof sp.walk === 'number' ? sp.walk : 30
    for (const [mode, v] of Object.entries<Json>(sp)) {
      const value = v === true ? walk : typeof v === 'number' ? v : typeof v?.number === 'number' ? v.number : undefined
      if (value !== undefined) ctx.out.speeds.push({ mode, value, origin })
    }
  }
}

// ---------------------------------------------------------------------------
// 法術（additionalSpells）
// ---------------------------------------------------------------------------

const SPELL_MODE_LABEL: Record<SpellGrant['mode'], string> = {
  known: '習得',
  prepared: '永遠準備',
  innate: '天生施法',
  expanded: '擴充法術表',
  spellbook: '法術書',
  class: '職業',
}

/**
 * additionalSpells：
 *   { ability, known: {等級: [法術]}, prepared: {...}, innate: {等級: {daily: {"1": [...]}, rest: {...}, will: [...]}}, expanded: {...} }
 * 等級鍵 `_` = 一開始就有；數字 = 角色等級（種族、背景、專長）或職業等級（職業、子職）；`s1` = 法術環位（擴充表）。
 * 法術可以是固定的 `名稱|來源` 或 `{choose: "level=0|class=牧师", count}`。
 */
function processSpells(ctx: Ctx, list: Json[], prefix: string, origin: Origin, levelNow: number, step: Step) {
  const key = `${prefix}:spells`
  const alt = pickAlternative(
    ctx,
    key,
    list,
    '法術：選擇一種方案',
    (a, i) => (a.name ? `${a.name}${a.ENG_name ? ` (${a.ENG_name})` : ''}` : `方案 ${i + 1}`),
    origin,
    step,
  )
  if (!alt) return

  let ability: Ability | 'inherit' | undefined
  if (typeof alt.ability === 'string') ability = alt.ability === 'inherit' ? 'inherit' : isAbility(alt.ability) ? alt.ability : undefined
  else if (alt.ability?.choose) {
    const [a] = addSlot(ctx, {
      key: `${key}:ability`,
      type: 'ability',
      label: '施法屬性',
      origin,
      step,
      count: 1,
      options: (alt.ability.choose as string[]).map((a) => ({ value: a, label: abilityLabel(a) })),
    })
    if (a && isAbility(a)) ability = a
  }

  let n = 0
  const addList = (items: Json[], mode: SpellGrant['mode'], uses?: SpellGrant['uses']) => {
    for (const it of items) {
      const gkey = `${key}:${n++}`
      if (typeof it === 'string') {
        const sp = lookupRef(ctx.data, 'spell', it)
        if (!sp) {
          ctx.out.notes.push({ text: `找不到法術「${it}」（可能該書未啟用）`, origin })
          continue
        }
        ctx.out.spells.push({ key: gkey, spellId: sp.id, origin, ...(ability ? { ability } : {}), mode, ...(uses ? { uses } : {}) })
      } else if (it?.choose && mode !== 'expanded') {
        const count = it.count ?? 1
        const options = spellsByFilter(ctx.data, String(it.choose)).map((sp) => entryOption(sp))
        const sel = addSlot(ctx, {
          key: gkey,
          type: 'spell',
          label: `${SPELL_MODE_LABEL[mode]}法術（選 ${count}）`,
          origin,
          step: 'spells',
          count,
          options,
        })
        sel.forEach((id, i) =>
          ctx.out.spells.push({
            key: `${gkey}:${i}`,
            spellId: id,
            slotKey: gkey,
            origin,
            ...(ability ? { ability } : {}),
            mode,
            ...(uses ? { uses } : {}),
          }),
        )
      }
    }
  }

  for (const mode of ['known', 'prepared', 'innate', 'expanded'] as const) {
    const byLevel = alt[mode]
    if (!byLevel || typeof byLevel !== 'object') continue
    for (const [lv, val] of Object.entries<Json>(byLevel)) {
      const min = lv === '_' || lv.startsWith('s') ? 1 : Number(lv)
      if (!(min <= levelNow)) continue
      if (Array.isArray(val)) addList(val, mode)
      else if (val && typeof val === 'object') {
        if (Array.isArray(val.will)) addList(val.will, mode, { n: 1, per: 'will' })
        if (Array.isArray(val.ritual)) addList(val.ritual, mode)
        for (const per of ['daily', 'rest'] as const) {
          for (const [times, items] of Object.entries<Json>(val[per] ?? {})) {
            const nTimes = times === 'pb' ? 'pb' : Number.parseInt(times, 10)
            addList([].concat(items), mode, { n: nTimes, per: per === 'daily' ? 'long' : 'short' })
          }
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 專長
// ---------------------------------------------------------------------------

/** 先決條件文字；`ok` 為 false 表示確定不符合。無法自動判斷的只回傳文字。 */
/**
 * 先決條件。`scores` 有給時（建角最後的檢查）才判斷屬性；種族、專長、施法、護甲熟練依目前已收集到的內容判斷。
 * 判斷不了的條件（戰役限定、特定特性等）只顯示文字，不擋選。
 */
export function checkPrerequisite(
  ctx: { data: RulesData; out: Build },
  e: Entry,
  level: number,
  scores?: Record<Ability, number>,
): { ok: boolean; text: string } {
  const alts = e.prerequisite as Json[] | undefined
  if (!alts?.length) return { ok: true, text: '' }
  const texts: string[] = []
  let anyOk = false
  for (const p of alts) {
    const parts: string[] = []
    let ok = true
    if (typeof p.level === 'number') {
      parts.push(`${p.level} 級以上`)
      if (level < p.level) ok = false
    }
    if (Array.isArray(p.ability)) {
      parts.push(
        p.ability.map((o: Json) => Object.entries(o).map(([a, v]) => `${abilityLabel(a)} ${v}+`).join('、')).join(' 或 '),
      )
      // 陣列中任一物件達到即可；物件內全部達到
      if (scores && !p.ability.some((o: Json) => Object.entries(o).every(([a, v]) => isAbility(a) && scores[a] >= Number(v)))) ok = false
    }
    if (p.spellcasting || p.spellcasting2020) {
      parts.push('能施放法術')
      const caster = ctx.out.classes.some((i) => i.entry.casterProgression || i.subclass?.casterProgression)
      if (scores && !caster) ok = false
    }
    if (Array.isArray(p.race)) {
      parts.push(`種族：${p.race.map((r: Json) => r.name).join('、')}`)
      const raceNames = [ctx.out.race?.name, ctx.out.race?.versionOf?.split('|')[1]].filter(Boolean).join(' ')
      const raceEng = (ctx.out.race?.engName ?? '').toLowerCase()
      if (scores && ctx.out.race && !p.race.some((r: Json) => raceNames.includes(r.name) || (r.ENG_name && raceEng.includes(String(r.ENG_name).toLowerCase())))) ok = false
    }
    if (Array.isArray(p.feat)) {
      parts.push(`專長：${p.feat.map((f: string) => f.split('|')[0]).join('、')}`)
      const owned = new Set(ctx.out.feats.map((f) => f.entry.name.split(/[；;]/)[0]))
      if (scores && !p.feat.some((f: string) => owned.has(f.split('|')[0]!.split(/[；;]/)[0]!))) ok = false
    }
    if (p.otherSummary?.entrySummary) parts.push(String(p.otherSummary.entrySummary))
    if (p.other) parts.push(String(p.other))
    if (Array.isArray(p.proficiency)) {
      const armor = p.proficiency.map((x: Json) => x.armor).filter(Boolean) as string[]
      parts.push(armor.length ? `${armor.map((a) => profLabel(ctx.data, 'armor', a)).join('、')}訓練` : '需要特定熟練')
      const has = new Set(ctx.out.profs.filter((x) => x.type === 'armor').map((x) => x.value))
      if (scores && armor.length && !armor.every((a) => has.has(a))) ok = false
    }
    if (Array.isArray(p.feature)) parts.push(`特性：${p.feature.join('、')}`)
    texts.push(parts.join('，'))
    if (ok) anyOk = true
  }
  return { ok: anyOk, text: texts.filter(Boolean).join('；或 ') }
}

function featOptions(ctx: Ctx, categories: string[] | null, level: number): ChoiceOption[] {
  return ctx.data
    .list('feat')
    .filter((f) => canPick(ctx.data, f) && (!categories || categories.includes(String(f.category))))
    .map((f) => {
      const pre = checkPrerequisite(ctx, f, level)
      const opt = entryOption(f, pre.ok ? undefined : `不符先決條件：${pre.text}`)
      if (pre.text && pre.ok) opt.note = `先決條件：${pre.text}`
      return opt
    })
    // 屬性值提升專長排最前面（最常選），其餘依名稱
    .sort((a, b) => Number(isAsi(b.entry!)) - Number(isAsi(a.entry!)) || a.label.localeCompare(b.label, 'zh'))
}

const FEAT_CATEGORY_LABEL: Record<string, string> = {
  G: '通用專長',
  O: '起源專長',
  FS: '戰鬥風格專長',
  'FS:P': '戰鬥風格專長',
  'FS:R': '戰鬥風格專長',
  EB: '傳奇恩惠',
  D: '龍紋專長',
}

function addFeatSlot(
  ctx: Ctx,
  key: string,
  categories: string[] | null,
  count: number,
  origin: Origin,
  step: Step,
  label?: string,
) {
  const catLabel = categories?.map((c) => FEAT_CATEGORY_LABEL[c] ?? c).filter((v, i, a) => a.indexOf(v) === i).join('／')
  const sel = addSlot(ctx, {
    key,
    type: 'feat',
    label: label ?? `${catLabel ?? '專長'}${count > 1 ? `（選 ${count}）` : ''}`,
    origin,
    step,
    count,
    options: featOptions(ctx, categories, origin.level),
  })
  for (const id of sel) {
    const f = ctx.data.get(id)
    if (f) processFeat(ctx, f, `${key}>${f.id}`, origin, step)
  }
}

function processFeatsField(ctx: Ctx, list: Json[], prefix: string, origin: Origin, step: Step) {
  const key = `${prefix}:feat`
  const alt = pickAlternative(ctx, key, list, '專長：選擇一種方案', (_a, i) => `方案 ${i + 1}`, origin, step)
  if (!alt) return
  let n = 0
  for (const [k, v] of Object.entries<Json>(alt)) {
    if (v === true) {
      const f = lookupRef(ctx.data, 'feat', k)
      if (f) processFeat(ctx, f, `${key}>${f.id}`, origin, step)
      else ctx.out.notes.push({ text: `找不到專長「${k}」（可能該書未啟用）`, origin })
    } else if (k === 'anyFromCategory') {
      addFeatSlot(ctx, `${key}:${n++}`, v.category, v.count ?? 1, origin, step)
    } else if (k === 'any') {
      addFeatSlot(ctx, `${key}:${n++}`, null, Number(v), origin, step)
    }
  }
}

/** 專長：先列為特性，再處理它的結構化欄位。 */
function processFeat(ctx: Ctx, feat: Entry, key: string, parent: Origin, step: Step) {
  if (ctx.seen.has(key)) return
  ctx.seen.add(key)
  const origin: Origin = { type: 'feat', name: feat.name, entry: feat, level: parent.level }
  // 專長有多個版本（例如魔法學徒的牧師／德魯伊／法師版）時，先選版本
  let e = feat
  if (feat.versions?.length) {
    const [vid] = addSlot(ctx, {
      key: `${key}:version`,
      type: 'version',
      label: '選擇版本',
      origin,
      step,
      count: 1,
      options: feat.versions.map((v) => entryOption(v)),
    })
    e = (vid && feat.versions.find((v) => v.id === vid)) || feat
  }
  ctx.out.feats.push({ entry: e, origin: { ...origin, entry: e }, key })
  const before = ctx.out.slots.length
  processEntity(ctx, e, key, { ...origin, entry: e, name: e.name }, step, parent.level)
  ctx.out.features.push({
    key,
    entry: e,
    category: 'feat',
    origin: parent,
    slotKeys: ctx.out.slots.slice(before - (feat.versions?.length ? 1 : 0)).map((s) => s.key),
  })
}

// ---------------------------------------------------------------------------
// 一般條目（種族、背景、專長共用）
// ---------------------------------------------------------------------------

interface EntityOpts {
  /** 舊版種族：依 2024 規則忽略屬性加值與語言 */
  legacyRace?: boolean
  /** 舊版背景：忽略語言 */
  legacyBackground?: boolean
}

function processEntity(ctx: Ctx, e: Entry, prefix: string, origin: Origin, step: Step, levelNow: number, opts: EntityOpts = {}) {
  if (Array.isArray(e.ability) && !opts.legacyRace) processAbility(ctx, e.ability, prefix, origin, step === 'race' || step === 'background' ? 'abilities' : step)
  const profFields: [string, ProfType][] = [
    ['skillProficiencies', 'skill'],
    ['toolProficiencies', 'tool'],
    ['languageProficiencies', 'language'],
    ['weaponProficiencies', 'weapon'],
    ['armorProficiencies', 'armor'],
    ['savingThrowProficiencies', 'save'],
    ['expertise', 'expertise'],
  ]
  for (const [field, type] of profFields) {
    const v = e[field]
    if (!Array.isArray(v)) continue
    // 2014 種族／背景的語言：照給，但來源標示「2014 版」，讓玩家與 DM 一眼看出（使用者 2026-10-23 決定）
    if (type === 'language' && (opts.legacyRace || opts.legacyBackground)) {
      processProfField(ctx, type, v, prefix, { ...origin, name: `${origin.name}（2014 版）`, compat: true })
      continue
    }
    // 專長、種族的熟練選擇就顯示在該條目的步驟，避免玩家得到處找
    // 升級時得到的（例如 8 級選的專長）就顯示在升級步驟；其餘依類型放到熟練／語言步驟
    processProfField(ctx, type, v, prefix, origin, step === 'levels' ? 'levels' : undefined)
  }
  if (Array.isArray(e.skillToolLanguageProficiencies)) processMixedProf(ctx, e.skillToolLanguageProficiencies, prefix, origin)
  for (const t of ['resist', 'immune', 'vulnerable', 'conditionImmune'] as const) {
    const v = e[t]
    if (Array.isArray(v)) processDefense(ctx, t, v, prefix, origin, step)
  }
  if (Array.isArray(e.feats)) processFeatsField(ctx, e.feats, prefix, origin, step)
  if (Array.isArray(e.additionalSpells)) processSpells(ctx, e.additionalSpells, prefix, origin, levelNow, step)
  if (e.kind === 'feat') processSensesSpeed(ctx, { ...e, speed: undefined } as Entry, origin)
}

// ---------------------------------------------------------------------------
// 種族、背景
// ---------------------------------------------------------------------------

function processRace(ctx: Ctx) {
  const { c, data, out } = ctx
  if (!c.raceId) return
  const race = data.get(c.raceId)
  if (!race) {
    out.notes.push({ text: `找不到種族「${c.raceId}」（可能該書未啟用或資料已更新）` })
    return
  }
  const legacy = race.edition === '2014'
  const baseOrigin: Origin = { type: 'race', name: race.name, entry: race, level: 1, ...(legacy ? { compat: true } : {}) }
  let e = race
  if (race.versions?.length) {
    const [vid] = addSlot(ctx, {
      key: `${race.id}:version`,
      type: 'version',
      label: '譜系／版本',
      origin: baseOrigin,
      step: 'race',
      count: 1,
      options: race.versions.map((v) => entryOption(v)),
    })
    e = (vid && race.versions.find((v) => v.id === vid)) || race
  }
  out.race = e
  const origin: Origin = { ...baseOrigin, entry: e }
  if (legacy && Array.isArray(race.ability)) {
    out.notes.push({ text: '依 2024 規則，2014 版種族的屬性加值不採用（改由背景提供）', origin })
  }
  if (legacy && Array.isArray(race.languageProficiencies)) {
    out.notes.push({ text: '2014 版種族的語言照給，並標示為「2014 版」（2024 規則另有通用語＋兩種標準語言）', origin })
  }

  // 體型
  const sizes = ((e.size as string[] | undefined) ?? ['M']).filter(Boolean)
  if (sizes.length > 1) {
    const [s] = addSlot(ctx, {
      key: `${race.id}:size`,
      type: 'size',
      label: '體型',
      origin,
      step: 'race',
      count: 1,
      options: sizes.map((s) => ({ value: s, label: sizeLabel(s) })),
    })
    out.size = s ? { value: s, origin } : null
  } else out.size = { value: sizes[0] ?? 'M', origin }
  out.creatureTypes = ((e.creatureTypes as string[] | undefined) ?? ['类人生物']).map(String)
  processSensesSpeed(ctx, e, origin)

  const before = out.slots.length
  processEntity(ctx, e, race.id, origin, 'race', c.levels.length || 1, { legacyRace: legacy })
  const slotKeys = out.slots.slice(before).map((s) => s.key)
  if (race.versions?.length) slotKeys.unshift(`${race.id}:version`)
  for (const [i, t] of namedEntries(e).entries()) {
    out.features.push({ key: `${race.id}:trait:${i}`, entry: t, category: 'race', origin, slotKeys: i === 0 ? slotKeys : [] })
  }

  // 2014 版種族的亞種（例如高等精靈）：亞種的特質、感官、速度、法術疊加在種族上
  const subraces = data
    .list('subrace')
    .filter((s) => s.raceName === race.name && s.raceSource === race.source && canPick(data, s))
  if (subraces.length) {
    const [sid] = addSlot(ctx, {
      key: `${race.id}:subrace`,
      type: 'version',
      label: '亞種',
      origin,
      step: 'race',
      count: 1,
      options: subraces.map((s) => entryOption(s)),
    })
    const sub = sid ? data.get(sid) : undefined
    if (sub) {
      const subOrigin: Origin = { ...origin, name: `${race.name}（${sub.name}）`, entry: sub }
      processSensesSpeed(ctx, sub, subOrigin)
      const b2 = out.slots.length
      processEntity(ctx, sub, sub.id, subOrigin, 'race', c.levels.length || 1, { legacyRace: legacy })
      for (const [i, t] of namedEntries(sub).entries()) {
        out.features.push({
          key: `${sub.id}:trait:${i}`,
          entry: t,
          category: 'race',
          origin: subOrigin,
          slotKeys: i === 0 ? [`${race.id}:subrace`, ...out.slots.slice(b2).map((s) => s.key)] : [],
        })
      }
    }
  }
}

/** 條目的具名段落（種族特質）→ 當成獨立的特性條目，沿用母條目的來源與頁碼。 */
function namedEntries(e: Entry): Entry[] {
  return ((e.entries ?? []) as Json[])
    .filter((x) => x && typeof x === 'object' && x.name)
    .map((x, i) => ({
      id: `${e.id}#${i}`,
      kind: e.kind,
      name: String(x.name),
      ...(x.ENG_name ? { engName: String(x.ENG_name) } : {}),
      source: e.source,
      ...(e.page !== undefined ? { page: e.page } : {}),
      edition: e.edition,
      entries: x.entries ?? [],
    }))
}

/** 2014 背景依 2024 規則補上的屬性加值與起源專長。 */
const LEGACY_BG_ABILITY = [
  { choose: { weighted: { from: ALL_ABILITIES, weights: [2, 1] } } },
  { choose: { weighted: { from: ALL_ABILITIES, weights: [1, 1, 1] } } },
]

function processBackground(ctx: Ctx) {
  const { c, data, out } = ctx
  if (!c.backgroundId) return
  const bg = data.get(c.backgroundId)
  if (!bg) {
    out.notes.push({ text: `找不到背景「${c.backgroundId}」（可能該書未啟用或資料已更新）` })
    return
  }
  out.background = bg
  const legacy = bg.edition === '2014'
  const origin: Origin = { type: 'background', name: bg.name, entry: bg, level: 1, ...(legacy ? { compat: true } : {}) }
  let e = bg
  if (legacy) {
    e = { ...bg }
    if (!Array.isArray(bg.ability)) {
      e.ability = LEGACY_BG_ABILITY
      out.notes.push({ text: '2014 版背景沒有屬性加值：依 2024 規則改為任選 +2/+1 或 +1/+1/+1', origin })
    }
    if (!Array.isArray(bg.feats)) {
      e.feats = [{ anyFromCategory: { category: ['O'], count: 1 } }]
      out.notes.push({ text: '2014 版背景沒有起源專長：依 2024 規則任選一個起源專長', origin })
    }
    if (Array.isArray(bg.languageProficiencies)) {
      out.notes.push({ text: '2014 版背景的語言照給，並標示為「2014 版」（2024 規則另有通用語＋兩種標準語言）', origin })
    }
  }
  const before = out.slots.length
  const featureIndex = out.features.length
  processEntity(ctx, e, bg.id, origin, 'background', 1, { legacyBackground: legacy })
  out.features.splice(featureIndex, 0, {
    key: bg.id,
    entry: bg,
    category: 'background',
    origin,
    slotKeys: out.slots.slice(before).map((s) => s.key),
  })
}

/** 排序用：2024 核心規則書（XPHB）的語言表排前面，其他書照資料順序 */
const sourceRank = (e: Entry) => (e.source === 'XPHB' ? 0 : 1)
const languageOrder = (l: Entry) => LANGUAGE_TYPES.indexOf(languageType(l)) * 2 + sourceRank(l)

/**
 * 2024 規則：每個角色會通用語，再選兩種標準語言。
 * 選項列出目前書目的全部語言，依資料的 type 分組；標準語言以外（稀有、異國、秘密、沒有 type 的「其他」）
 * 預設不列出，需 DM 同意才打開。
 */
function processBaseLanguages(ctx: Ctx) {
  const origin: Origin = { type: 'rule', name: '2024 角色起源：語言', level: 1 }
  grantProf(ctx, 'language', 'common', origin)
  const options: ChoiceOption[] = languageList(ctx.data)
    .filter((l) => languageKey(l) !== 'common')
    .sort((a, b) => languageOrder(a) - languageOrder(b))
    .map((l) => ({
      value: languageKey(l),
      label: profLabel(ctx.data, 'language', languageKey(l)),
      entry: l,
      group: LANGUAGE_TYPE_LABEL[languageType(l)],
      ...(languageType(l) === 'standard' ? {} : { restricted: true }),
    }))
  const sel = addSlot(ctx, {
    key: 'base:languages',
    type: 'language',
    label: '標準語言（選 2）',
    origin,
    step: 'languages',
    count: 2,
    options,
    restrictedToggle: '顯示稀有與其他語言（需 DM 同意）',
  })
  for (const v of sel) grantProf(ctx, 'language', v, origin, 'base:languages')
}

// ---------------------------------------------------------------------------
// 職業
// ---------------------------------------------------------------------------

function classOrigin(cls: Entry, classLevel: number, charLevel: number): Origin {
  return { type: 'class', name: `${cls.name} ${classLevel} 级`, entry: cls, level: charLevel }
}

/** optionalfeatureProgression：陣列（索引 = 等級-1，值 = 累計數量）或 {等級: 累計數量}。 */
function progressionAt(prog: Json, level: number): number {
  if (Array.isArray(prog)) return Number(prog[level - 1] ?? 0)
  let n = 0
  for (const [lv, v] of Object.entries<Json>(prog ?? {})) if (Number(lv) <= level) n = Math.max(n, Number(v))
  return n
}

function processOptionalFeatureProgression(ctx: Ctx, holder: Entry, classLevel: number, keyBase: string, origin: Origin) {
  for (const ofp of (holder.optionalfeatureProgression as Json[] | undefined) ?? []) {
    const delta = progressionAt(ofp.progression, classLevel) - progressionAt(ofp.progression, classLevel - 1)
    if (delta <= 0) continue
    const types: string[] = ofp.featureType ?? []
    const options = ctx.data
      .list('optionalfeature')
      .filter((o) => canPick(ctx.data, o) && ((o.featureType as string[] | undefined) ?? []).some((t) => types.includes(t)))
      .map((o) => {
        const pre = checkPrerequisite(ctx, o, origin.level)
        const opt = entryOption(o)
        if (pre.text) opt.note = `先決條件：${pre.text}`
        return opt
      })
      .sort((a, b) => a.label.localeCompare(b.label, 'zh'))
    const key = `${keyBase}:of:${ofp.name}`
    const sel = addSlot(ctx, {
      key,
      type: 'optionalfeature',
      label: `${ofp.name}${ofp.ENG_name ? ` (${ofp.ENG_name})` : ''}（選 ${delta}）`,
      origin,
      step: 'levels',
      count: delta,
      options,
    })
    for (const id of sel) {
      const o = ctx.data.get(id)
      if (!o) continue
      const of: Origin = { type: 'optionalfeature', name: o.name, entry: o, level: origin.level }
      const before = ctx.out.slots.length
      processEntity(ctx, o, `${key}>${o.id}`, of, 'levels', origin.level)
      ctx.out.features.push({
        key: `${key}>${o.id}`,
        entry: o,
        category: 'optionalfeature',
        origin,
        slotKeys: ctx.out.slots.slice(before).map((s) => s.key),
      })
    }
  }
}

/** 特性內文中以 refClassFeature／refSubclassFeature 參照的同級小特性。 */
function referencedFeatures(ctx: Ctx, e: Entry): Entry[] {
  const out: Entry[] = []
  const walk = (v: Json) => {
    if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') {
      if (v.type === 'refSubclassFeature' && v.subclassFeature) {
        const f = ctx.data.get(subclassFeatureRef(v.subclassFeature).id)
        if (f) out.push(f)
      } else if (v.type === 'refClassFeature' && v.classFeature) {
        const f = ctx.data.get(classFeatureRef(v.classFeature).id)
        if (f) out.push(f)
      } else walk(v.entries ?? v.items)
    }
  }
  walk(e.entries)
  return out
}

const COUNT_WORD: Record<string, number> = { 一: 1, 两: 2, 二: 2, 三: 3, 四: 4 }

/**
 * 職業特性的「專精」沒有結構化欄位，只寫在內文（例如遊蕩者、吟遊詩人的專精、法師的學者）。
 * 依 CLAUDE.md §6 不做人工對照表，改從原文推斷：內文有 {@variantrule 专精} 且提到技能，
 * 就產生一個專精選擇欄位；數量取第一個「兩項／一項…技能」的數字，找不到就是 1。
 */
export function inferExpertiseCount(f: Entry): number {
  const text = JSON.stringify(f.entries ?? [])
  if (!text.includes('{@variantrule 专精') || !text.includes('技能')) return 0
  const m = /([一两二三四])[项个][^。"]{0,30}?(技能|专精)/.exec(text)
  return m ? (COUNT_WORD[m[1]!] ?? 1) : 1
}

function addClassFeature(ctx: Ctx, f: Entry, category: 'class' | 'subclass', origin: Origin, slotKeys: string[]) {
  const n = inferExpertiseCount(f)
  if (n > 0) {
    const key = `${f.id}:expertise`
    const sel = addSlot(ctx, {
      key,
      type: 'expertise',
      label: `專精（選 ${n}；依「${f.name}」原文自動推斷，請依原文限制選擇）`,
      origin,
      step: origin.level === 1 ? 'class' : 'levels',
      count: n,
      options: skillList(ctx.data).map((s) => ({ value: s.key, label: profLabel(ctx.data, 'skill', s.key) })),
    })
    for (const v of sel) grantProf(ctx, 'expertise', v, origin, key)
    slotKeys = [...slotKeys, key]
  }
  ctx.out.features.push({ key: f.id, entry: f, category, origin, slotKeys })
  // 特性本身就是一種語言（德魯伊語、盜賊黑話）：資料沒有結構化欄位，但特性與語言的英文名相同 →
  // 自動學會，不佔語言選擇名額。
  const lang = f.engName ? languageList(ctx.data).find((l) => l.engName === f.engName) : undefined
  if (lang) grantProf(ctx, 'language', languageKey(lang), origin)
  // 子職的「標題特性」底下常用參照列出同級的小特性（例如塑能學者、強效戲法），各自列成特性
  for (const sub of referencedFeatures(ctx, f)) {
    ctx.out.features.push({ key: sub.id, entry: sub, category, origin, slotKeys: [] })
  }
}

const isAsi = (f: Entry) => f.engName === 'Ability Score Improvement'

function processClasses(ctx: Ctx) {
  const { c, data, out } = ctx
  const counts = new Map<string, number>()
  const infos = new Map<string, ClassInfo>()

  c.levels.forEach((lv, i) => {
    const charLevel = i + 1
    const cls = data.get(lv.classId)
    if (!cls) {
      if (!counts.has(lv.classId)) out.notes.push({ text: `找不到職業「${lv.classId}」（可能該書未啟用或資料已更新）` })
      counts.set(lv.classId, (counts.get(lv.classId) ?? 0) + 1)
      return
    }
    const L = (counts.get(cls.id) ?? 0) + 1
    counts.set(cls.id, L)
    let info = infos.get(cls.id)
    if (!info) {
      info = { entry: cls, level: 0, primary: i === 0 }
      infos.set(cls.id, info)
      out.classes.push(info)
    }
    info.level = L
    const origin = classOrigin(cls, L, charLevel)

    // 1. 起始熟練（起始職業）或兼職熟練
    if (L === 1) {
      const profOrigin: Origin = { ...origin, name: info.primary ? `${cls.name}（起始職業）` : `${cls.name}（兼職）` }
      const sp = (info.primary ? cls.startingProficiencies : (cls.multiclassing as Json)?.proficienciesGained) as Json
      const prefix = info.primary ? `${cls.id}` : `${cls.id}:mc`
      if (info.primary) for (const a of (cls.proficiency as string[] | undefined) ?? []) grantProf(ctx, 'save', a, profOrigin)
      if (sp) {
        if (Array.isArray(sp.skills)) processProfField(ctx, 'skill', sp.skills, prefix, profOrigin, 'class')
        if (Array.isArray(sp.toolProficiencies)) processProfField(ctx, 'tool', sp.toolProficiencies, prefix, profOrigin, 'class')
        if (Array.isArray(sp.armorProficiencies)) processProfField(ctx, 'armor', sp.armorProficiencies, prefix, profOrigin, 'class')
        if (Array.isArray(sp.weaponProficiencies)) processProfField(ctx, 'weapon', sp.weaponProficiencies, prefix, profOrigin, 'class')
        else for (const w of (sp.weapons as string[] | undefined) ?? []) grantProf(ctx, 'weapon', normalizeProf(ctx, 'weapon', w), profOrigin)
      }
    }

    // 2. 這一級的職業特性
    const refs = ((cls.classFeatures as Json[] | undefined) ?? []).map(classFeatureRef).filter((r) => r.level === L)
    for (const ref of refs) {
      const f = data.get(ref.id)
      if (!f) continue
      if (f.tceOptional) {
        if (!data.tceOptional) continue
        const key = `${cls.id}:tce:${f.id}`
        const [yes] = addSlot(ctx, {
          key,
          type: 'toggle',
          label: `TCE 可選規則：採用「${f.name}」？`,
          origin,
          step: 'levels',
          count: 1,
          options: [{ value: 'yes', label: '採用', note: 'TCE 可選規則' }],
        })
        if (yes) addClassFeature(ctx, f, 'class', origin, [key])
        continue
      }
      const before = out.slots.length
      // 第一次取得子職特性的等級：選子職（之後的等級不會重複產生欄位）
      if (ref.gainSubclassFeature) addSubclassSlot(ctx, cls, info, origin)
      if (isAsi(f)) addFeatSlot(ctx, `${cls.id}:${L}:asi`, ['G'], 1, origin, 'levels', '屬性值提升或通用專長')
      addClassFeature(ctx, f, 'class', origin, out.slots.slice(before).map((s) => s.key))
    }
    // 子職特性
    if (info.subclass) {
      const sc = info.subclass
      const scOrigin: Origin = { type: 'subclass', name: `${sc.name} ${L} 级`, entry: sc, level: charLevel }
      for (const r of ((sc.subclassFeatures as Json[] | undefined) ?? []).map(subclassFeatureRef)) {
        if (r.level !== L) continue
        const f = data.get(r.id)
        if (f && (!f.tceOptional || data.tceOptional)) addClassFeature(ctx, f, 'subclass', scOrigin, [])
      }
      processOptionalFeatureProgression(ctx, sc, L, `${sc.id}:${L}`, scOrigin)
    }

    // 3. 專長進程（戰鬥風格、傳奇恩惠）與可選特性進程（魔能祈喚、超魔…）
    for (const fp of (cls.featProgression as Json[] | undefined) ?? []) {
      const n = Number(fp.progression?.[L] ?? 0)
      if (n > 0) addFeatSlot(ctx, `${cls.id}:${L}:fp:${fp.name}`, fp.category ?? null, n, origin, 'levels', `${fp.name}${fp.ENG_name ? ` (${fp.ENG_name})` : ''}`)
    }
    processOptionalFeatureProgression(ctx, cls, L, `${cls.id}:${L}`, origin)
  })

  // 職業與子職本身的額外法術（例如遊俠的獵人印記、塑能師的塑能學者）：依最終職業等級，只處理一次
  for (const info of out.classes) {
    const cls = info.entry
    if (Array.isArray(cls.additionalSpells)) {
      processSpells(ctx, cls.additionalSpells, cls.id, classOrigin(cls, info.level, c.levels.length), info.level, 'levels')
    }
    const sc = info.subclass
    if (sc && Array.isArray(sc.additionalSpells)) {
      const scOrigin: Origin = { type: 'subclass', name: sc.name, entry: sc, level: c.levels.length }
      processSpells(ctx, sc.additionalSpells, sc.id, scOrigin, info.level, 'levels')
    }
  }
}

function addSubclassSlot(ctx: Ctx, cls: Entry, info: ClassInfo, origin: Origin) {
  const key = `${cls.id}:subclass`
  if (ctx.out.slots.some((s) => s.key === key)) return
  const options = ctx.data
    .list('subclass')
    .filter((s) => s.className === cls.name && s.classSource === cls.source && canPick(ctx.data, s))
    .map((s) => entryOption(s))
    .sort((a, b) => a.label.localeCompare(b.label, 'zh'))
  const [id] = addSlot(ctx, {
    key,
    type: 'subclass',
    label: String(cls.subclassTitle ?? '子職'),
    origin,
    step: origin.level === 1 ? 'class' : 'levels',
    count: 1,
    options,
  })
  const sc = id ? ctx.data.get(id) : undefined
  if (sc) info.subclass = sc
}

// ---------------------------------------------------------------------------
// 職業法術：戲法、法術書、準備／已知法術
// ---------------------------------------------------------------------------

function processClassSpells(ctx: Ctx) {
  const { c, data, out } = ctx
  const scores = abilityScores(c, out)
  const mods = Object.fromEntries(ABILITIES.map((a) => [a, scores[a].mod])) as Record<Ability, number>
  for (const cc of classCastings(out.classes, mods, data)) {
    const cls = cc.info.entry
    const origin: Origin = { type: cc.from === cls ? 'class' : 'subclass', name: cc.from.name, entry: cc.from, level: c.levels.length }
    const opts = (min: number, max: number) => classSpellList(data, cc.listName, min, max).map((sp) => entryOption(sp))
    const grant = (slotKey: string, ids: string[], mode: SpellGrant['mode']) =>
      ids.forEach((id, i) => out.spells.push({ key: `${slotKey}:${i}`, spellId: id, slotKey, origin, ...(cc.ability ? { ability: cc.ability } : {}), mode }))

    if (cc.cantrips > 0) {
      const key = `${cls.id}:cantrips`
      grant(key, addSlot(ctx, { key, type: 'spell', label: `${cc.from.name}戲法（選 ${cc.cantrips}）`, origin, step: 'spells', count: cc.cantrips, options: opts(0, 0) }), 'known')
    }
    if (cc.maxSpellLevel < 1) continue
    if (cc.spellbook !== undefined) {
      // 法術書：子職免費加入法術書的法術（例如塑能學者）也算在書裡，可以準備
      const free = out.spells.filter(
        (g) => g.origin.type === 'subclass' && g.origin.entry?.id === cc.info.subclass?.id && g.mode === 'known' && g.spellId && Number(data.get(g.spellId)?.level) > 0,
      )
      for (const g of free) g.mode = 'spellbook'
      const key = `${cls.id}:spellbook`
      const book = addSlot(ctx, {
        key,
        type: 'spell',
        label: `法術書（共 ${cc.spellbook} 道，1–${cc.maxSpellLevel} 環）`,
        origin,
        step: 'spells',
        count: cc.spellbook,
        options: opts(1, cc.maxSpellLevel),
      })
      const prepKey = `${cls.id}:prepared`
      const inBook = [...book, ...free.map((g) => g.spellId!)]
      const prepared = addSlot(ctx, {
        key: prepKey,
        type: 'spell',
        label: `準備法術（從法術書選 ${cc.prepared ?? 0}）`,
        origin,
        step: 'spells',
        count: cc.prepared ?? 0,
        options: [...new Set(inBook)].map((id) => data.get(id)).filter((e): e is Entry => !!e).map((e) => entryOption(e)),
      })
      grant(key, book.filter((id) => !prepared.includes(id)), 'spellbook')
      grant(prepKey, prepared, 'class')
      for (const g of free) if (prepared.includes(g.spellId!)) g.mode = 'class'
    } else if (cc.known !== undefined || cc.prepared !== undefined) {
      const n = cc.known ?? cc.prepared ?? 0
      const key = `${cls.id}:${cc.known !== undefined ? 'known' : 'prepared'}`
      const label = cc.known !== undefined ? '已知法術' : '準備法術'
      grant(key, addSlot(ctx, { key, type: 'spell', label: `${cc.from.name}${label}（選 ${n}，1–${cc.maxSpellLevel} 環）`, origin, step: 'spells', count: n, options: opts(1, cc.maxSpellLevel) }), 'class')
    }
  }
}

// ---------------------------------------------------------------------------
// 起始裝備：起始職業與背景的 A/B 選項組
// ---------------------------------------------------------------------------

function processStartingEquipment(ctx: Ctx) {
  const { out, c } = ctx
  const primary = out.classes.find((i) => i.primary)?.entry
  for (const e of [primary, out.background]) {
    if (!e) continue
    const origin: Origin = { type: e.kind === 'class' ? 'class' : 'background', name: e.name, entry: e, level: 1 }
    const gold = goldAlternative(e)
    // 2014 職業選了「改拿金幣」就不必選裝備組
    if (gold && c.choices[`${e.id}:equip:gold`]?.length) continue
    for (const set of startingSets(ctx.data, e)) {
      if (set.options.length < 2) continue
      addSlot(ctx, {
        key: `${e.id}:equip:${set.index}`,
        type: 'equipment',
        label: `起始裝備（${e.name}）`,
        origin,
        step: 'equipment',
        count: 1,
        options: set.options.map((o) => ({ value: o.value, label: o.label })),
      })
    }
  }
}

// ---------------------------------------------------------------------------
// 重複熟練
// ---------------------------------------------------------------------------

/**
 * 2024 規則：同一項熟練從兩個來源取得時，改選其他同類項目。
 *   - 兩個固定來源重複 → 產生「改選」選擇欄位
 *   - 玩家自己選的重複 → 在該選擇欄位上警告
 */
function resolveDuplicates(ctx: Ctx) {
  const { out } = ctx
  for (const type of ['skill', 'tool', 'language', 'save'] as const) {
    const byValue = new Map<string, ProfGrant[]>()
    for (const p of out.profs) if (p.type === type) byValue.set(p.value, [...(byValue.get(p.value) ?? []), p])
    for (const [value, grants] of byValue) {
      if (grants.length < 2) continue
      const label = profLabel(ctx.data, type, value)
      const fixed = grants.filter((g) => !g.slotKey)
      // 玩家選的重複：每個選擇欄位都警告
      for (const g of grants.filter((g) => g.slotKey)) {
        const others = grants.filter((x) => x !== g).map((x) => x.origin.name)
        out.slots.find((s) => s.key === g.slotKey)?.warnings.push(`「${label}」已由 ${others.join('、')} 提供，請改選其他項`)
      }
      if (type === 'save') continue
      // 固定來源重複：第二個起各給一次改選
      for (const g of fixed.slice(1)) {
        const owned = new Set(out.profs.filter((p) => p.type === type).map((p) => p.value))
        const key = `dup:${type}:${value}:${g.origin.entry?.id ?? g.origin.name}`
        const options = (profOptions(ctx, type, 'any') ?? []).map((o) =>
          owned.has(o.value) ? { ...o, disabled: '已熟練' } : o,
        )
        const sel = addSlot(ctx, {
          key,
          type,
          label: `「${label}」重複（${fixed[0]!.origin.name} 與 ${g.origin.name}）：改選其他一項`,
          origin: g.origin,
          step: PROF_STEP[type],
          count: 1,
          options,
        })
        for (const v of sel) grantProf(ctx, type, v, g.origin, key)
      }
    }
  }
  // 選項標示「已熟練」（不擋選，因為可能是玩家想換掉另一邊）
  for (const s of out.slots) {
    if (!['skill', 'tool', 'language'].includes(s.type)) continue
    const elsewhere = new Map<string, string>()
    for (const p of out.profs) if (p.type === s.type && p.slotKey !== s.key) elsewhere.set(p.value, p.origin.name)
    for (const o of s.options) {
      const from = elsewhere.get(o.value)
      if (from && !o.disabled) o.note = `已由 ${from} 提供`
    }
  }
}

/**
 * 最後檢查（需要最終屬性值的東西）：專長的先決條件、兼職條件。
 * 用的是套用手動覆寫後的屬性值，所以覆寫屬性也會連動到這裡。
 */
function resolveScoreChecks(ctx: Ctx) {
  const { c, out } = ctx
  const final = abilityScores(c, out)
  const scores = Object.fromEntries(ABILITIES.map((a) => [a, final[a].score])) as Record<Ability, number>
  for (const s of out.slots) {
    if (s.type !== 'feat') continue
    for (const o of s.options) {
      if (!o.entry) continue
      const pre = checkPrerequisite(ctx, o.entry, s.origin.level, scores)
      if (pre.ok) {
        if (o.disabled?.startsWith('不符先決條件')) delete o.disabled
        continue
      }
      if (s.selected.includes(o.value)) s.warnings.push(`「${o.entry.name}」不符先決條件：${pre.text}`)
      else o.disabled = `不符先決條件：${pre.text}`
    }
  }
  const current = out.classes.map((i) => i.entry)
  for (const info of out.classes) {
    if (info.primary) continue
    const check = canMulticlass(info.entry, current, scores)
    if (!check.ok) out.notes.push({ text: `兼職${info.entry.name}的條件不符：${check.reasons.join('；')}`, origin: classOrigin(info.entry, info.level, c.levels.length) })
  }
}

/** 專精：選項只能是已熟練的技能（要等所有熟練都收集完才知道）。 */
function resolveExpertiseOptions(ctx: Ctx) {
  const proficient = new Set(ctx.out.profs.filter((p) => p.type === 'skill').map((p) => p.value))
  for (const s of ctx.out.slots) {
    if (s.type !== 'expertise') continue
    for (const o of s.options) if (!proficient.has(o.value)) o.disabled = '需要先熟練此技能'
  }
}

// ---------------------------------------------------------------------------
// 進入點
// ---------------------------------------------------------------------------

export function buildCharacter(c: Character, data: RulesData): Build {
  const out: Build = {
    slots: [],
    features: [],
    profs: [],
    abilityBonuses: [],
    defenses: [],
    senses: [],
    speeds: [],
    size: null,
    creatureTypes: [],
    feats: [],
    spells: [],
    classes: [],
    notes: [],
    legacyPicks: [],
  }
  const ctx: Ctx = { c, data, out, seen: new Set() }
  processClasses(ctx)
  processBackground(ctx)
  processRace(ctx)
  processBaseLanguages(ctx)
  processClassSpells(ctx)
  processStartingEquipment(ctx)
  resolveDuplicates(ctx)
  resolveExpertiseOptions(ctx)
  resolveScoreChecks(ctx)
  resolveLegacyPicks(ctx)
  return out
}

/** 找出已選但已被重印取代的條目（種族、背景、職業、子職，以及所有選擇欄位裡的條目）。 */
function resolveLegacyPicks(ctx: Ctx) {
  const by = ctx.data.supersededBy
  if (!by) return
  const out = ctx.out
  const check = (e: Entry | undefined, where: string) => {
    if (!e) return
    // 版本條目（例如侏儒的血系）本身沒有 reprintedAs，看母條目
    const base = e.versionOf ? (ctx.data.get(e.versionOf) ?? e) : e
    const newer = by(base)
    if (newer && !out.legacyPicks.some((p) => p.entry.id === base.id)) out.legacyPicks.push({ entry: base, newer, where })
  }
  check(out.race, 'race')
  check(out.background, 'background')
  for (const ci of out.classes) {
    check(ci.entry, `class:${ci.entry.id}`)
    check(ci.subclass, `${ci.entry.id}:subclass`)
  }
  for (const slot of out.slots) {
    for (const v of slot.selected) check(slot.options.find((o) => o.value === v)?.entry, slot.key)
  }
}

/** 某一步還沒選完的欄位。 */
export function pendingSlots(b: Build, step?: Step): ChoiceSlot[] {
  return b.slots.filter((s) => (!step || s.step === step) && (!s.done || s.warnings.length > 0))
}

/** 給 UI 用：把「名稱|來源」參照轉 id 的捷徑。 */
export { refToId }
