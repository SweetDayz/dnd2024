/**
 * 兼職與施法者等級、法術位（純函式）。
 *
 * 兼職條件：
 *   - 2014 職業有 `multiclassing.requirements`：`{str: 13, cha: 13}`（全部要達到）或 `{or: [{str: 13, dex: 13}]}`（任一）。
 *   - 2024 職業的 `multiclassing` 多半是空的，依 2024 PHB：目前所有職業與新職業的「主要屬性」都要 13 以上。
 *     `primaryAbility` 是陣列＝擇一；物件內多個鍵＝都要（例如聖武士力量＋魅力）。
 *
 * 施法者等級（2024 PHB 兼職規則）：全施法者算全部等級；聖武士、遊俠、奇械師算一半（無條件進位，資料標記為
 * `artificer`）；2014 的 `1/2` 無條件捨去；奧法騎士、詭術師等子職算三分之一（捨去）；魔契師的契約魔法另計。
 */
import type { Entry } from '../data/types.ts'
import { ABILITY_NAME, isAbility, type Ability } from './abilities.ts'
import type { ClassInfo } from './build.ts'

type Req = { all: Partial<Record<Ability, number>> }[]

/** 某職業的兼職條件：外層陣列擇一，內層全部達到。 */
export function multiclassRequirement(cls: Entry): Req {
  const r = (cls.multiclassing as { requirements?: Record<string, unknown> } | undefined)?.requirements
  if (r) {
    if (Array.isArray(r.or)) {
      // {or: [{str: 13, dex: 13}]}：物件內任一項達到即可
      return (r.or as Record<string, number>[]).flatMap((o) =>
        Object.entries(o).filter(([k]) => isAbility(k)).map(([k, v]) => ({ all: { [k]: v } })),
      )
    }
    const all = Object.fromEntries(Object.entries(r).filter(([k]) => isAbility(k))) as Partial<Record<Ability, number>>
    return Object.keys(all).length ? [{ all }] : []
  }
  const pa = (cls.primaryAbility as Record<string, boolean>[] | undefined) ?? []
  return pa.map((o) => ({ all: Object.fromEntries(Object.keys(o).filter(isAbility).map((k) => [k, 13])) }))
}

/** 條件文字；給了目前屬性值就附上「（目前 16 ✓）」，方便一眼看出差多少。 */
export function requirementText(req: Req, scores?: Record<Ability, number>): string {
  if (!req.length) return '無'
  return req
    .map((alt) =>
      Object.entries(alt.all)
        .map(([a, v]) => {
          const cur = scores?.[a as Ability]
          const now = cur === undefined ? '' : `（目前 ${cur} ${cur >= (v ?? 0) ? '✓' : '✗'}）`
          return `${ABILITY_NAME[a as Ability].zh} ${v}+${now}`
        })
        .join(' 且 '),
    )
    .join(' 或 ')
}

export function meetsRequirement(req: Req, scores: Record<Ability, number>): boolean {
  if (!req.length) return true
  return req.some((alt) => Object.entries(alt.all).every(([a, v]) => scores[a as Ability] >= (v ?? 0)))
}

/** 能否兼職進新職業：新職業與目前所有職業的條件都要達到。 */
export function canMulticlass(
  newClass: Entry,
  current: Entry[],
  scores: Record<Ability, number>,
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = []
  for (const cls of [newClass, ...current.filter((c) => c.id !== newClass.id)]) {
    const req = multiclassRequirement(cls)
    if (!meetsRequirement(req, scores)) reasons.push(`${cls.name}需要 ${requirementText(req, scores)}`)
  }
  return { ok: reasons.length === 0, reasons }
}

// ---------------------------------------------------------------------------
// 施法者等級與法術位
// ---------------------------------------------------------------------------

/** 兼職施法者法術位表（2024 PHB；與全施法者職業表相同）。第 i 列 = 施法者等級 i+1。 */
export const MULTICLASS_SLOTS: readonly (readonly number[])[] = [
  [2, 0, 0, 0, 0, 0, 0, 0, 0],
  [3, 0, 0, 0, 0, 0, 0, 0, 0],
  [4, 2, 0, 0, 0, 0, 0, 0, 0],
  [4, 3, 0, 0, 0, 0, 0, 0, 0],
  [4, 3, 2, 0, 0, 0, 0, 0, 0],
  [4, 3, 3, 0, 0, 0, 0, 0, 0],
  [4, 3, 3, 1, 0, 0, 0, 0, 0],
  [4, 3, 3, 2, 0, 0, 0, 0, 0],
  [4, 3, 3, 3, 1, 0, 0, 0, 0],
  [4, 3, 3, 3, 2, 0, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
]

export type CasterProgression = 'full' | 'artificer' | '1/2' | '1/3' | 'pact'

export interface CasterPart {
  info: ClassInfo
  progression: CasterProgression
  /** 對兼職施法者等級的貢獻 */
  contribution: number
  /** 施法屬性 */
  ability?: Ability
  /** 提供施法的條目（職業或子職，例如奧法騎士） */
  from: Entry
}

export function casterParts(classes: ClassInfo[]): CasterPart[] {
  const parts: CasterPart[] = []
  for (const info of classes) {
    const from = info.subclass?.casterProgression ? info.subclass : info.entry
    const p = from.casterProgression as CasterProgression | undefined
    if (!p) continue
    const L = info.level
    const contribution =
      p === 'full' ? L : p === 'artificer' ? Math.ceil(L / 2) : p === '1/2' ? Math.floor(L / 2) : p === '1/3' ? Math.floor(L / 3) : 0
    const ab = String(from.spellcastingAbility ?? info.entry.spellcastingAbility ?? '')
    parts.push({ info, progression: p, contribution, ...(isAbility(ab) ? { ability: ab } : {}), from })
  }
  return parts
}

/** 職業／子職自己的法術位表（rowsSpellProgression），第 level 列。 */
function ownSlots(e: Entry, level: number): number[] | undefined {
  const groups = ((e.classTableGroups ?? e.subclassTableGroups) as { rowsSpellProgression?: number[][] }[] | undefined) ?? []
  for (const g of groups) if (g.rowsSpellProgression) return [...(g.rowsSpellProgression[level - 1] ?? [])]
  return undefined
}

/** 契約魔法：職業表中「法术位」「法术位环阶」兩欄。 */
function pactSlots(e: Entry, level: number): { count: number; level: number } | undefined {
  for (const g of (e.classTableGroups as { colLabels?: string[]; rows?: unknown[][] }[] | undefined) ?? []) {
    const labels = (g.colLabels ?? []).map(String)
    const ci = labels.findIndex((l) => l.includes('法术位') && !l.includes('环'))
    const li = labels.findIndex((l) => l.includes('法术位环') || l.includes('环阶'))
    if (ci >= 0 && li >= 0) {
      const row = g.rows?.[level - 1]
      if (row) return { count: Number(row[ci]), level: Number(row[li]) }
    }
  }
  return undefined
}

export interface SpellSlots {
  /** 1–9 環的法術位數量 */
  slots: number[]
  casterLevel: number
  /** 使用兼職表（兩個以上施法職業） */
  multiclass: boolean
  pact?: { count: number; level: number; className: string }
  parts: CasterPart[]
}

export function spellSlots(classes: ClassInfo[]): SpellSlots {
  const parts = casterParts(classes)
  const normal = parts.filter((p) => p.progression !== 'pact')
  const casterLevel = normal.reduce((s, p) => s + p.contribution, 0)
  let slots = [0, 0, 0, 0, 0, 0, 0, 0, 0]
  if (normal.length === 1) {
    // 單一施法職業：用該職業（或子職）自己的表，例如 2014 聖武士 1 級沒有法術位
    const p = normal[0]!
    slots = ownSlots(p.from, p.info.level) ?? [...(MULTICLASS_SLOTS[casterLevel - 1] ?? slots)]
  } else if (casterLevel > 0) slots = [...MULTICLASS_SLOTS[casterLevel - 1]!]
  const pactPart = parts.find((p) => p.progression === 'pact')
  const pact = pactPart ? pactSlots(pactPart.info.entry, pactPart.info.level) : undefined
  return {
    slots,
    casterLevel,
    multiclass: normal.length > 1,
    ...(pact && pactPart ? { pact: { ...pact, className: pactPart.info.entry.name } } : {}),
    parts,
  }
}
