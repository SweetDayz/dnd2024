/**
 * 法術的「取得方式」（Grant）解析：把 5etools 的 `additionalSpells` 轉成 GrantTemplate（純函式，不查資料）。
 *
 * 一個 GrantTemplate ＝「宿主在某個等級時，用某種方式取得一道（或選 N 道）法術」。
 * 同一道法術可以有多筆 Grant（例如寻获魔宠同時來自死灵师的免費抄寫與魔宠密友的永遠準備），
 * 規則引擎分開計算，UI 再合併顯示（見 docs/tasks/M9.md §1）。
 *
 * 資料形狀（實測見 docs/data-notes.md §23b）：
 *   [ { name?, ENG_name?, ability?, resourceName?,
 *       known|prepared|innate|expanded: { 等級鍵: 清單 | { daily|rest|resource: {次數: 清單}, will|ritual: 清單 } | { 等級鍵: ... } } } ]
 *   外層陣列多個元素＝互斥方案（玩家選一個）。
 *   等級鍵：`_` 立即；`"3"` 宿主等級；`"s6"` 能施展 6 環法術時。可以兩層（`{"1": {"_": [...]}}`）。
 *   清單元素：`"名稱|來源#c"`、`{choose: "篩選字串", count?}`、`{choose: {from: [...], count}}`、`{all: "篩選字串"}`（擴充清單）。
 */
import { isAbility, type Ability } from '../abilities.ts'
import type { OriginType } from '../build.ts'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any

/** 取得方式（M9.md §1.1） */
export type GrantKind = 'cantrip' | 'known' | 'spellbook' | 'prepared' | 'always' | 'innate' | 'arcanum' | 'expanded'

/** 施放方式（M9.md §1.3），以徽章顯示 */
export type CastMode =
  | { type: 'slot' }
  | { type: 'pact' }
  /** 免費 N/長休；each＝列出的每道法術各 N 次；n 可以是熟練加值或屬性調整值 */
  | { type: 'daily'; n: number | 'pb' | Ability; each?: boolean }
  | { type: 'rest'; n: number | 'pb' | Ability; each?: boolean }
  | { type: 'resource'; n: number; name: string }
  | { type: 'will' }
  /** 只能以儀式施放（兽心道途、链之魔契） */
  | { type: 'ritualOnly' }
  /** 法術書內的儀式法術不必準備就能以儀式施放（2024 法師） */
  | { type: 'ritual' }
  /** 2024 種族、專長給的天生法術：也可以用法術位施放 */
  | { type: 'slotAlso' }

/** 施法屬性：固定、承接專長所選的屬性加值、玩家從清單選；undefined＝沿用宿主職業 */
export type AbilitySpec = Ability | 'inherit' | { choose: Ability[] } | undefined

/** 這道（或這組）法術怎麼決定 */
export type SpellPick =
  /** 固定：`名稱|來源`；cantrip 為 `#c` 標記 */
  | { ref: string; cantrip: boolean }
  /** 從篩選結果選 count 道 */
  | { filter: string; count: number }
  /** 從固定清單選 count 道 */
  | { from: string[]; count: number }
  /** 擴充清單：整份篩選結果加進可選範圍 */
  | { all: string }

/** 宿主（給法術的條目）的施法制度 */
export type HostCasting = 'spellbook' | 'known' | 'prepared' | 'none'

export interface HostInfo {
  type: OriginType
  /** 條目的 edition（'2014'／'2024'）；種族、專長的天生法術是否也能用法術位看這個 */
  edition?: string
  /** 宿主職業的施法制度（職業、子職才有意義；其他宿主為 none） */
  casting: HostCasting
  /** 宿主職業是魔契師（法術位為契約法術位） */
  pact?: boolean
  /** 職業、子職＝職業等級；種族、專長、背景＝角色等級 */
  level: number
  /** 宿主職業目前能施展的最高環位（`s6` 等級鍵用） */
  maxSpellLevel?: number
}

export interface GrantTemplate {
  /** 第幾個互斥方案（只有一個方案時都是 0） */
  option: number
  /** 原始區段：known／prepared／innate／expanded */
  section: 'known' | 'prepared' | 'innate' | 'expanded'
  kind: GrantKind
  /** 不占名額（子職的免費法術書、額外已知、額外戲法） */
  free?: boolean
  pick: SpellPick
  castModes: CastMode[]
  ability: AbilitySpec
  /** 宿主等級達到才取得 */
  minLevel: number
  /** 能施展這個環位才取得（`s6`） */
  minSpellLevel?: number
  /** 原始等級鍵（顯示、除錯用），例如「3」「s6」「1/_」 */
  levelKey: string
}

export interface ParsedAdditionalSpells {
  /** 互斥方案的名稱（只有一個方案時為空陣列） */
  options: { name?: string; engName?: string }[]
  templates: GrantTemplate[]
}

// ---------------------------------------------------------------------------
// 1.2 known 的語意依宿主決定
// ---------------------------------------------------------------------------

/**
 * `additionalSpells.known` 的實際意義（M9.md §1.2）：
 *   法師子職        → 免費加入法術書（戲法則是免費戲法）
 *   已知法術制子職  → 額外已知法術，不占已知數
 *   準備制子職      → 戲法：額外戲法；一環以上：永遠準備
 *   種族、專長、背景、祈喚 → 戲法：直接學會；一環以上：永遠準備（用該來源的屬性施放）
 */
export function resolveKnownSemantics(host: Pick<HostInfo, 'type' | 'casting'>, cantrip: boolean): { kind: GrantKind; free?: boolean } {
  const classHost = host.type === 'class' || host.type === 'subclass'
  if (cantrip) return classHost ? { kind: 'cantrip', free: true } : { kind: 'cantrip' }
  if (classHost && host.casting === 'spellbook') return { kind: 'spellbook', free: true }
  if (classHost && host.casting === 'known') return { kind: 'known', free: true }
  return { kind: 'always' }
}

// ---------------------------------------------------------------------------
// 屬性、施放方式
// ---------------------------------------------------------------------------

export function parseAbility(v: Json): AbilitySpec {
  if (v === 'inherit') return 'inherit'
  if (typeof v === 'string' && isAbility(v)) return v
  if (Array.isArray(v?.choose)) return { choose: (v.choose as string[]).filter(isAbility) }
  return undefined
}

/** 次數鍵：「1」「1e」「pb」「int」 */
function parseTimes(key: string): { n: number | 'pb' | Ability; each?: boolean } {
  const each = key.endsWith('e')
  const k = each ? key.slice(0, -1) : key
  const n = k === 'pb' ? 'pb' : isAbility(k) ? k : Number.parseInt(k, 10) || 1
  return each ? { n, each } : { n }
}

/** 職業、子職取得的法術預設用法術位（魔契師是契約法術位） */
function slotMode(host: HostInfo): CastMode[] {
  if (host.type !== 'class' && host.type !== 'subclass') return []
  if (host.casting === 'none') return []
  return [host.pact ? { type: 'pact' } : { type: 'slot' }]
}

// ---------------------------------------------------------------------------
// 主要解析
// ---------------------------------------------------------------------------

/** 等級鍵 → 最低宿主等級／最低可施展環位 */
function gate(key: string): { minLevel: number; minSpellLevel?: number } {
  if (key === '_') return { minLevel: 0 }
  if (/^s\d$/.test(key)) return { minLevel: 0, minSpellLevel: Number(key.slice(1)) }
  return { minLevel: Number(key) || 0 }
}

const isLevelKey = (k: string) => k === '_' || /^s?\d+$/.test(k)

function parsePick(it: Json): SpellPick | undefined {
  if (typeof it === 'string') {
    const cantrip = /#c$/i.test(it)
    return { ref: it.replace(/#c$/i, ''), cantrip }
  }
  if (typeof it?.all === 'string') return { all: it.all }
  if (typeof it?.choose === 'string') return { filter: it.choose, count: Number(it.count ?? 1) }
  if (Array.isArray(it?.choose?.from)) return { from: it.choose.from, count: Number(it.choose.count ?? it.count ?? 1) }
  if (Array.isArray(it?.from)) return { from: it.from, count: Number(it.count ?? 1) }
  return undefined
}

/** 這個選擇只能選戲法（`#c`、篩選字串只有 level=0、清單全是 `#c`） */
export function pickIsCantrip(p: SpellPick): boolean {
  if ('ref' in p) return p.cantrip
  if ('filter' in p) {
    const m = /(?:^|\|)level=([^|]+)/.exec(p.filter)
    return !!m && m[1]!.split(';').every((l) => l.trim() === '0')
  }
  if ('from' in p) return p.from.length > 0 && p.from.every((r) => /#c$/i.test(r))
  return false
}

/**
 * 解析整個 `additionalSpells` 陣列。回傳所有等級的 template；用 `templateActive` 依宿主目前等級篩選。
 * 2024 種族、專長的天生一環以上法術加上「也可用法術位」（M9.md §1.3）。
 */
export function parseAdditionalSpells(list: Json[] | undefined, host: HostInfo): ParsedAdditionalSpells {
  const arr = Array.isArray(list) ? list : []
  const options = arr.length > 1 ? arr.map((a) => ({ ...(a?.name ? { name: String(a.name) } : {}), ...(a?.ENG_name ? { engName: String(a.ENG_name) } : {}) })) : []
  const templates: GrantTemplate[] = []
  arr.forEach((alt, option) => {
    if (!alt || typeof alt !== 'object') return
    const ability = parseAbility(alt.ability)
    const resourceName = String(alt.resourceName ?? '')
    const featLike = host.type !== 'class' && host.type !== 'subclass'
    const slotAlso = featLike && host.edition === '2024'

    for (const section of ['known', 'prepared', 'innate', 'expanded'] as const) {
      const byLevel = alt[section]
      if (!byLevel || typeof byLevel !== 'object') continue

      const push = (it: Json, levelKey: string, g: ReturnType<typeof gate>, extra: CastMode[], ritualOnly = false) => {
        const pick = parsePick(it)
        if (!pick) return
        let kind: GrantKind
        let free: boolean | undefined
        if (section === 'expanded') kind = 'expanded'
        else if (section === 'prepared') kind = 'always'
        else if (section === 'innate') kind = pickIsCantrip(pick) ? 'cantrip' : 'innate'
        else ({ kind, free } = resolveKnownSemantics(host, pickIsCantrip(pick)))
        const modes: CastMode[] = []
        if (ritualOnly) modes.push({ type: 'ritualOnly' })
        else if (kind !== 'expanded' && kind !== 'cantrip') {
          // 職業給的永遠準備／法術書／已知：用法術位；有次數的天生法術：次數＋（2024 種族專長）也可用法術位
          if (!featLike && section !== 'innate') modes.push(...slotMode(host))
          modes.push(...extra)
          if (slotAlso && extra.length && !extra.some((m) => m.type === 'will')) modes.push({ type: 'slotAlso' })
        }
        templates.push({
          option,
          section,
          kind,
          ...(free ? { free } : {}),
          pick,
          castModes: modes,
          ability,
          minLevel: g.minLevel,
          ...(g.minSpellLevel !== undefined ? { minSpellLevel: g.minSpellLevel } : {}),
          levelKey,
        })
      }

      const walk = (val: Json, levelKey: string, g: ReturnType<typeof gate>) => {
        if (Array.isArray(val)) return val.forEach((it) => push(it, levelKey, g, []))
        if (!val || typeof val !== 'object') return
        for (const [k, v] of Object.entries<Json>(val)) {
          if (isLevelKey(k)) {
            // 兩層等級鍵：外層角色等級、內層 `_`
            const inner = gate(k)
            walk(v, `${levelKey}/${k}`, {
              minLevel: Math.max(g.minLevel, inner.minLevel),
              ...((inner.minSpellLevel ?? g.minSpellLevel) !== undefined ? { minSpellLevel: inner.minSpellLevel ?? g.minSpellLevel } : {}),
            })
          } else if (k === 'will') [].concat(v).forEach((it) => push(it, levelKey, g, [{ type: 'will' }]))
          else if (k === 'ritual') [].concat(v).forEach((it) => push(it, levelKey, g, [], true))
          else if (k === 'daily' || k === 'rest') {
            for (const [times, items] of Object.entries<Json>(v ?? {})) {
              const t = parseTimes(times)
              ;[].concat(items).forEach((it) => push(it, levelKey, g, [{ type: k, ...t }]))
            }
          } else if (k === 'resource') {
            for (const [cost, items] of Object.entries<Json>(v ?? {})) {
              ;[].concat(items).forEach((it) => push(it, levelKey, g, [{ type: 'resource', n: Number(cost) || 1, name: resourceName }]))
            }
          }
        }
      }

      for (const [lv, val] of Object.entries<Json>(byLevel)) walk(val, lv, gate(lv))
    }
  })
  return { options, templates }
}

/** 宿主目前等級是否已取得這個 template */
export function templateActive(t: Pick<GrantTemplate, 'minLevel' | 'minSpellLevel'>, host: Pick<HostInfo, 'level' | 'maxSpellLevel'>): boolean {
  if (host.level < t.minLevel) return false
  if (t.minSpellLevel !== undefined && (host.maxSpellLevel ?? 0) < t.minSpellLevel) return false
  return true
}

// ---------------------------------------------------------------------------
// 秘法奧義（魔契師 11/13/15/17 級各一道 6～9 環）
// ---------------------------------------------------------------------------

/**
 * `spellsKnownProgressionFixedByLevel: {"11": {"6": 1}, ...}` → 每一環一個 template（選 1 道該環的職業法術）。
 * 秘法奧義不用契約法術位，每道 1/長休。
 */
export function arcanumTemplates(cls: { spellsKnownProgressionFixedByLevel?: unknown; name?: string }, level: number): GrantTemplate[] {
  const by = cls.spellsKnownProgressionFixedByLevel as Record<string, Record<string, number>> | undefined
  if (!by) return []
  const out: GrantTemplate[] = []
  for (const [lv, spells] of Object.entries(by)) {
    if (Number(lv) > level) continue
    for (const [spellLevel, count] of Object.entries(spells)) {
      out.push({
        option: 0,
        section: 'known',
        kind: 'arcanum',
        pick: { filter: `level=${spellLevel}|class=${cls.name ?? ''}`, count },
        castModes: [{ type: 'daily', n: 1 }],
        ability: undefined,
        minLevel: Number(lv),
        levelKey: lv,
      })
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// 顯示
// ---------------------------------------------------------------------------

export const GRANT_KIND_LABEL: Record<GrantKind, string> = {
  cantrip: '戲法',
  known: '已知法術',
  spellbook: '法術書',
  prepared: '準備法術',
  always: '永遠準備',
  innate: '天生施法',
  arcanum: '秘法奧義',
  expanded: '擴充清單',
}

const PER_LABEL = { daily: '長休', rest: '短休' } as const

/** 施放方式徽章文字：「免費 1/長休」「消耗 功力 2 點」「隨意施放」 */
export function castModeLabel(m: CastMode, ctx?: { pb?: number; mods?: Record<Ability, number> }): string {
  switch (m.type) {
    case 'slot':
      return '法術位'
    case 'pact':
      return '契約法術位'
    case 'daily':
    case 'rest': {
      const n =
        m.n === 'pb' ? (ctx?.pb !== undefined ? String(ctx.pb) : '熟練加值') : isAbility(m.n) ? (ctx?.mods ? String(Math.max(1, ctx.mods[m.n])) : `${m.n} 調整值`) : String(m.n)
      return `免費 ${n}/${PER_LABEL[m.type]}${m.each ? '（各）' : ''}`
    }
    case 'resource':
      return `消耗 ${m.name || '資源'} ${m.n} 點`
    case 'will':
      return '隨意施放'
    case 'ritualOnly':
      return '只能以儀式施放'
    case 'ritual':
      return '儀式施放'
    case 'slotAlso':
      return '也可用法術位'
  }
}
