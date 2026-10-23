/**
 * 法術：職業的戲法數、準備法術數、法術書（純函式），以及角卡法術列的顯示資料。
 *
 * 職業欄位（實測，見 docs/data-notes.md §12d）：
 *   cantripProgression[等級-1]           戲法數
 *   preparedSpellsProgression[等級-1]    2024 準備法術數
 *   preparedSpells: "<$level$> / 2 + <$int_mod$>"  2014 準備法術數公式
 *   spellsKnownProgression[等級-1]       已知法術數（2014 吟遊詩人、術士…）
 *   spellsKnownProgressionFixed[等級-1]  法術書每級新增的法術數（法師）
 */
import type { Entry } from '../data/types.ts'
import { parseTags } from '../data/tags.ts'
import { ABILITY_NAME, formatMod, isAbility, type Ability } from './abilities.ts'
import type { Build, ClassInfo, SpellGrant } from './build.ts'
import { spellOnClassList, type RulesData } from './data.ts'
import { casterParts } from './multiclass.ts'

export interface ClassCasting {
  info: ClassInfo
  /** 提供施法的條目（職業，或奧法騎士這類子職） */
  from: Entry
  /** 法術清單用的職業名（中文） */
  listName: string
  ability?: Ability
  maxSpellLevel: number
  cantrips: number
  prepared?: number
  known?: number
  /** 法術書內的法術數（法師） */
  spellbook?: number
}

const at = (arr: unknown, level: number) => (Array.isArray(arr) ? Number(arr[Math.min(level, arr.length) - 1] ?? 0) : undefined)

/** 2014 公式：「<$level$> / 2 + <$int_mod$>」，最少 1。 */
export function evalPreparedFormula(formula: string, level: number, mods: Record<Ability, number>): number {
  const expr = formula
    .replace(/<\$level\$>/g, String(level))
    .replace(/<\$(\w+)_mod\$>/g, (_m, a: string) => String(isAbility(a) ? mods[a] : 0))
    .replace(/\+\s*-/g, '-')
    .replace(/-\s*-/g, '+')
  // 只允許數字與 + - * / ( ) 空白，再由左至右計算（除法無條件捨去）
  if (!/^[\d\s+\-*/()]+$/.test(expr)) return 1
  const tokens = expr.match(/\d+|[+\-*/]/g) ?? []
  let total = Number(tokens[0] ?? 0)
  for (let i = 1; i < tokens.length; i += 2) {
    const n = Number(tokens[i + 1] ?? 0)
    const op = tokens[i]
    total = op === '+' ? total + n : op === '-' ? total - n : op === '*' ? total * n : Math.floor(total / n)
  }
  return Math.max(1, total)
}

/** 這個職業自己能施展的最高環位（兼職時各職業的法術仍以「單職業」的進度決定能學幾環）。 */
function maxLevelOf(from: Entry, level: number, progression: string): number {
  const groups = ((from.classTableGroups ?? from.subclassTableGroups) as { rowsSpellProgression?: number[][]; colLabels?: string[]; rows?: unknown[][] }[] | undefined) ?? []
  for (const g of groups) {
    const row = g.rowsSpellProgression?.[level - 1]
    if (row) {
      let m = 0
      row.forEach((n, i) => n > 0 && (m = i + 1))
      return m
    }
  }
  if (progression === 'pact') {
    for (const g of groups) {
      const li = (g.colLabels ?? []).findIndex((l) => String(l).includes('环阶'))
      if (li >= 0) return Number(g.rows?.[level - 1]?.[li] ?? 0)
    }
  }
  return 0
}

/**
 * 子職施法者用哪張職業法術清單：資料沒有專用欄位，但子職特性內文會用
 * `{@filter 术士法术列表|spells|class=术士}` 指向清單（奧法騎士、詭術師→法師；AU 秘術武者→術士）。
 * 取第一個指向法術的 filter 的 class=；找不到才退回法師。
 */
export function subclassSpellList(data: RulesData | undefined, sc: Entry): string {
  if (!data) return '法师'
  // 「施法」常是標題特性內以 refSubclassFeature 參照的小特性，所以直接掃這個子職的所有特性
  const feats = data
    .list('subclassFeature')
    .filter((f) => f.subclassShortName === sc.shortName && f.subclassSource === sc.source && f.className === sc.className && f.classSource === sc.classSource)
    .sort((a, b) => Number(a.level) - Number(b.level))
  for (const f of feats) {
    const m = /\{@filter [^|}]*\|spells\|[^}]*?class=([^|}]+)/.exec(JSON.stringify(f?.entries ?? []))
    if (m) return m[1]!.split(';')[0]!
  }
  return '法师'
}

export function classCastings(classes: ClassInfo[], mods: Record<Ability, number>, data?: RulesData): ClassCasting[] {
  return casterParts(classes).map((p) => {
    const L = p.info.level
    const from = p.from
    const cls = p.info.entry
    const listName = from === cls ? cls.name : subclassSpellList(data, from)
    const prepared =
      at(from.preparedSpellsProgression, L) ??
      (typeof from.preparedSpells === 'string' && p.ability ? evalPreparedFormula(from.preparedSpells, L, mods) : undefined)
    const fixed = from.spellsKnownProgressionFixed as number[] | undefined
    const spellbook = fixed ? fixed.slice(0, L).reduce((a, b) => a + b, 0) : undefined
    return {
      info: p.info,
      from,
      listName,
      ...(p.ability ? { ability: p.ability } : {}),
      maxSpellLevel: maxLevelOf(from, L, p.progression),
      cantrips: at(from.cantripProgression, L) ?? 0,
      ...(prepared !== undefined ? { prepared } : {}),
      ...(at(from.spellsKnownProgression, L) !== undefined ? { known: at(from.spellsKnownProgression, L)! } : {}),
      ...(spellbook !== undefined ? { spellbook } : {}),
    }
  })
}

/** 某職業清單上、指定環位範圍內、目前書目可選的法術。 */
export function classSpellList(data: RulesData, className: string, minLevel: number, maxLevel: number): Entry[] {
  return data
    .list('spell')
    .filter(
      (sp) =>
        data.visible(sp) &&
        Number(sp.level) >= minLevel &&
        Number(sp.level) <= maxLevel &&
        spellOnClassList(data, sp, className),
    )
    .sort((a, b) => Number(a.level) - Number(b.level) || (a.engName ?? '').localeCompare(b.engName ?? ''))
}

// ---------------------------------------------------------------------------
// 顯示：施法時間、射程、成分、持續時間、傷害
// ---------------------------------------------------------------------------

const UNIT: Record<string, string> = {
  action: '动作',
  bonus: '附赠动作',
  reaction: '反应',
  minute: '分钟',
  hour: '小时',
  round: '轮',
  day: '天',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any

export function castingTime(sp: Entry): string {
  return ((sp.time as Json[]) ?? [])
    .map((t) => `${t.number ?? 1} ${UNIT[t.unit] ?? t.unit}`)
    .join(' 或 ')
}

export function rangeText(sp: Entry): string {
  const r = sp.range as Json
  if (!r) return ''
  const d = r.distance ?? {}
  const dist =
    d.type === 'touch' ? '触碰' : d.type === 'self' ? '自身' : d.type === 'sight' ? '视线' : d.type === 'unlimited' ? '无限' : d.amount ? `${d.amount} 呎` : d.type
  if (r.type === 'point') return dist
  const AREA: Record<string, string> = { cone: '锥状', cube: '立方', line: '线状', sphere: '球状', emanation: '散发', radius: '半径', cylinder: '圆柱' }
  return `自身（${d.amount ?? ''} 呎${AREA[r.type] ?? r.type}）`
}

export function componentsText(sp: Entry): string {
  const c = (sp.components as Json) ?? {}
  const parts = [c.v && 'V', c.s && 'S', c.m && 'M'].filter(Boolean)
  return parts.join('/')
}

export function materialText(sp: Entry): string | undefined {
  const m = (sp.components as Json)?.m
  return typeof m === 'string' ? m : m?.text
}

export function durationText(sp: Entry): { text: string; concentration: boolean } {
  const ds = (sp.duration as Json[]) ?? []
  let concentration = false
  const text = ds
    .map((d) => {
      if (d.concentration) concentration = true
      if (d.type === 'instant') return '立即'
      if (d.type === 'permanent') return '直到被解除'
      if (d.type === 'special') return '特殊'
      if (d.type === 'timed') return `${d.duration?.amount ?? ''} ${UNIT[d.duration?.type] ?? d.duration?.type}`
      return d.type
    })
    .join(' 或 ')
  return { text, concentration }
}

export const isRitual = (sp: Entry) => !!(sp.meta as Json)?.ritual

/** 「4d6」+ n ×「1d6」→「(4+n)d6」；骰面不同就串起來。 */
export function addDice(base: string, step: string, n: number): string {
  if (n <= 0 || !step) return base
  const b = /^(\d+)d(\d+)(.*)$/.exec(base.replace(/\s/g, ''))
  const s = /^(\d+)d(\d+)$/.exec(step.replace(/\s/g, ''))
  if (b && s && b[2] === s[2]) return `${Number(b[1]) + n * Number(s[1])}d${b[2]}${b[3]}`
  return `${base} + ${n}×${step}`
}

function firstTag(entries: unknown, tag: string): string[] | undefined {
  let found: string[] | undefined
  const walk = (v: unknown) => {
    if (found) return
    if (typeof v === 'string') {
      for (const n of parseTags(v)) if (typeof n !== 'string' && n.tag === tag) return void (found ??= n.args)
    } else if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') walk((v as Json).entries ?? (v as Json).items)
  }
  walk(entries)
  return found
}

/** 基礎傷害骰：戲法依角色等級升階（scalingLevelDice），其餘取內文第一個 {@damage}。 */
export function baseDamage(sp: Entry, charLevel: number): string | undefined {
  const sc = sp.scalingLevelDice as Json
  const scales = Array.isArray(sc) ? sc[0] : sc
  if (scales?.scaling) {
    let dice: string | undefined
    for (const [lv, d] of Object.entries<string>(scales.scaling)) if (Number(lv) <= charLevel) dice = d
    if (dice) return dice
  }
  return firstTag(sp.entries, 'damage')?.[0]?.replace(/\s/g, '')
}

/** 升環：{@scaledamage 2d8|1-9|1d8} → 每高一環加 1d8。 */
export function upcastStep(sp: Entry): string | undefined {
  return firstTag(sp.entriesHigherLevel, 'scaledamage')?.[2]?.replace(/\s/g, '')
}

const SAVE_ABILITY: Record<string, Ability> = {
  strength: 'str',
  dexterity: 'dex',
  constitution: 'con',
  intelligence: 'int',
  wisdom: 'wis',
  charisma: 'cha',
}

export interface SpellRow {
  key: string
  spell: Entry
  level: number
  /** 來源特性顯示名稱，例如「法师」「魔法学徒；牧师」「侏儒」 */
  sourceLabel: string
  grant: SpellGrant
  ability?: Ability
  time: string
  range: string
  /** 「+9」或「体质 17」或「—」 */
  hitDc: string
  attackBonus?: number
  dc?: number
  saveAbility?: Ability
  damage?: string
  upcastStep?: string
  components: string
  material?: string
  duration: string
  concentration: boolean
  ritual: boolean
  /** 不耗法術位的次數，例如「1/长休」 */
  usesText?: string
  /** 永遠準備（不佔準備數） */
  alwaysPrepared: boolean
  /** 只在法術書內、沒準備（儀式可施展） */
  bookOnly: boolean
}

const PER: Record<string, string> = { long: '长休', short: '短休' }

/**
 * 角色所有法術的顯示列。
 * @param mods 屬性調整值；@param pb 熟練加值
 */
export function spellRows(
  b: Pick<Build, 'spells' | 'classes'>,
  data: RulesData,
  mods: Record<Ability, number>,
  pb: number,
  charLevel: number,
): SpellRow[] {
  const castings = classCastings(b.classes, mods, data)
  const classAbility = castings[0]?.ability
  const rows: SpellRow[] = []
  for (const g of b.spells) {
    if (!g.spellId || g.mode === 'expanded') continue
    const sp = data.get(g.spellId)
    if (!sp) continue
    let ability: Ability | undefined = g.ability === 'inherit' ? classAbility : g.ability
    // 職業、子職的法術用該職業的施法屬性
    if (!ability && (g.origin.type === 'class' || g.origin.type === 'subclass')) {
      const cc = castings.find((x) => x.info.entry.id === g.origin.entry?.id || x.info.subclass?.id === g.origin.entry?.id)
      ability = cc?.ability ?? classAbility
    }
    const mod = ability ? mods[ability] : 0
    const attack = (sp.spellAttack as string[] | undefined)?.length ? pb + mod : undefined
    const saveAb = SAVE_ABILITY[String((sp.savingThrow as string[] | undefined)?.[0])]
    const dc = saveAb ? 8 + pb + mod : undefined
    const dur = durationText(sp)
    const uses = g.uses
    rows.push({
      key: g.key,
      spell: sp,
      level: Number(sp.level),
      sourceLabel: g.origin.name.replace(/ \d+ 级$/, '').replace(/（.*）$/, ''),
      grant: g,
      ...(ability ? { ability } : {}),
      time: castingTime(sp),
      range: rangeText(sp),
      hitDc: attack !== undefined ? formatMod(attack) : dc !== undefined ? `${ABILITY_NAME[saveAb!].zh} ${dc}` : '—',
      ...(attack !== undefined ? { attackBonus: attack } : {}),
      ...(dc !== undefined ? { dc, saveAbility: saveAb } : {}),
      ...(baseDamage(sp, charLevel) ? { damage: baseDamage(sp, charLevel)! } : {}),
      ...(upcastStep(sp) ? { upcastStep: upcastStep(sp)! } : {}),
      components: componentsText(sp),
      ...(materialText(sp) ? { material: materialText(sp)! } : {}),
      duration: dur.text,
      concentration: dur.concentration,
      ritual: isRitual(sp),
      ...(uses
        ? { usesText: uses.per === 'will' ? '随意' : `${uses.n === 'pb' ? pb : uses.n}/${PER[uses.per]}` }
        : {}),
      // 種族、專長、背景給的法術不需要準備；職業選的才佔準備數
      alwaysPrepared:
        g.mode === 'prepared' || g.mode === 'innate' || (g.mode === 'known' && g.origin.type !== 'class' && g.origin.type !== 'subclass'),
      bookOnly: g.mode === 'spellbook',
    })
  }
  return rows.sort((a, b) => a.level - b.level || (a.spell.engName ?? '').localeCompare(b.spell.engName ?? ''))
}

/** 單一施法職業的法術 DC 與攻擊加值（角卡頂部顯示用）。 */
export function spellcastingStats(castings: ClassCasting[], mods: Record<Ability, number>, pb: number) {
  return castings
    .filter((c) => c.ability)
    .map((c) => ({ casting: c, ability: c.ability!, dc: 8 + pb + mods[c.ability!], attack: pb + mods[c.ability!], mod: mods[c.ability!] }))
}

