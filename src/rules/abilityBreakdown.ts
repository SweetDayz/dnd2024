/**
 * 屬性值明細（純函式）：每項屬性的基礎值與產生方式、每一筆加值及來源、最終值、調整值、上限檢查，
 * 以及還沒分配的屬性加值。建角精靈的「屬性總覽」與選項預覽都用它。
 *
 * 算法和角卡數值（derive.ts 的 abilityScores）共用 applyAbilityBonuses，兩邊不會算出不同結果。
 */
import {
  ABILITIES,
  ABILITY_NAME,
  POINT_BUY_BUDGET,
  abilityMod,
  applyAbilityBonuses,
  isValidStandardArray,
  pointBuySpent,
  type Ability,
} from './abilities.ts'
import type { Build, Origin, Step } from './build.ts'
import type { AbilityMethod, Character } from './character.ts'

export const METHOD_LABEL: Record<AbilityMethod, string> = { standard: '標準陣列', pointbuy: '點數購買', roll: '4d6', manual: '自填' }

const ORIGIN_LABEL: Record<Origin['type'], string> = {
  race: '種族',
  background: '背景',
  class: '職業',
  subclass: '子職',
  feat: '專長',
  optionalfeature: '可選特性',
  rule: '規則',
}

export interface AbilityBonusLine {
  /** 資料上的加值 */
  amount: number
  /** 實際生效的量（超過上限的部分不生效） */
  applied: number
  /** 這筆加值的上限（一般 20，傳奇恩惠 30） */
  max: number
  /** 來源文字，例如「背景：侍僧」「屬性值提升（ASI）」「背景：侍僧（2014 相容）」 */
  source: string
  origin: Origin
}

export interface AbilityLine {
  ability: Ability
  base: number | null
  /** 基礎值的產生方式 */
  method: AbilityMethod
  bonuses: AbilityBonusLine[]
  /** 自動計算的值 */
  computed: number
  /** 手動覆寫值（有的話） */
  override?: number
  /** 最終值 */
  score: number
  mod: number
  warnings: string[]
  /** 一行明細，例如「14（標準陣列）＋2 背景：侍僧＋1 專長：XXX = 17」 */
  text: string
}

export interface PendingAbilityBonus {
  slotKey: string
  step: Step
  /** 選擇欄位的標題 */
  label: string
  origin: Origin
  /** 尚未分配的加值總量；還沒選「方式」時不知道 */
  amount?: number
}

export interface AbilityBreakdown {
  abilities: Record<Ability, AbilityLine>
  pending: PendingAbilityBonus[]
  /** 不屬於單一屬性的警示（點數購買超支、標準陣列重複等） */
  warnings: string[]
}

/** 屬性加值欄位的 key 結尾：+2/+1 位置、選 N 項、選方式（見 build.ts processAbility） */
const ABILITY_SLOT = /:ability:(w|c|alt)$/

/** 來源文字，例如「背景：侍僧」「屬性值提升（ASI）」「背景：侍僧（2014 相容）」。 */
export function originText(o: Origin): string {
  const asi = o.type === 'feat' && o.entry?.engName === 'Ability Score Improvement'
  const name = asi ? '屬性值提升（ASI）' : `${ORIGIN_LABEL[o.type]}：${o.name}`
  return o.compat ? `${name}（2014 相容）` : name
}

export function abilityBreakdown(
  c: Pick<Character, 'baseScores' | 'abilityMethod'> & Partial<Pick<Character, 'overrides'>>,
  b: Pick<Build, 'abilityBonuses' | 'slots'>,
): AbilityBreakdown {
  const abilities = {} as Record<Ability, AbilityLine>
  for (const a of ABILITIES) {
    const base = c.baseScores[a]
    const grants = b.abilityBonuses.filter((x) => x.ability === a)
    const { total, applied } = applyAbilityBonuses(base ?? 10, grants)
    const bonuses = grants.map((g, i) => ({
      amount: g.amount,
      applied: applied[i]!,
      max: g.max,
      source: originText(g.origin),
      origin: g.origin,
    }))
    const o = c.overrides?.[`ability:${a}`]
    const override = typeof o === 'number' && Number.isFinite(o) ? o : undefined
    const score = override ?? total

    const warnings: string[] = []
    if (base === null) warnings.push('尚未分配基礎值（暫以 10 計算）')
    for (const x of bonuses) {
      if (x.applied < x.amount) warnings.push(`${x.source} 的 +${x.amount} 超過上限 ${x.max}，只生效 +${x.applied}`)
    }
    const cap = Math.max(20, ...grants.map((g) => g.max))
    if (score > cap) warnings.push(`超過上限 ${cap}`)
    if (override !== undefined) warnings.push(`已手動覆寫（自動計算為 ${total}）`)

    const parts = [`${base ?? '—'}（${METHOD_LABEL[c.abilityMethod]}）`]
    for (const x of bonuses) parts.push(`＋${x.applied}${x.applied < x.amount ? `（原 +${x.amount}）` : ''} ${x.source}`)
    let text = `${parts.join('')} = ${total}`
    if (override !== undefined) text += `，手動覆寫為 ${override}`

    abilities[a] = { ability: a, base, method: c.abilityMethod, bonuses, computed: total, override, score, mod: abilityMod(score), warnings, text }
  }

  const pending: PendingAbilityBonus[] = []
  for (const s of b.slots) {
    if (!ABILITY_SLOT.test(s.key) || s.done) continue
    const w = s.weights
    const amount =
      s.key.endsWith(':alt') || !w
        ? undefined
        : s.type === 'abilityWeighted'
          ? w.reduce((sum, x, i) => (s.selected[i] ? sum : sum + x), 0)
          : w.slice(s.selected.filter(Boolean).length).reduce((sum, x) => sum + x, 0)
    pending.push({ slotKey: s.key, step: s.step, label: s.label, origin: s.origin, amount })
  }

  const warnings: string[] = []
  const filled = ABILITIES.every((a) => c.baseScores[a] !== null)
  if (c.abilityMethod === 'pointbuy') {
    const spent = pointBuySpent(c.baseScores)
    if (spent > POINT_BUY_BUDGET) warnings.push(`點數購買超支：${spent}／${POINT_BUY_BUDGET}`)
    const bad = ABILITIES.filter((a) => {
      const v = c.baseScores[a]
      return v !== null && (v < 8 || v > 15)
    })
    if (bad.length) warnings.push(`點數購買的基礎值須在 8–15：${bad.map((a) => ABILITY_NAME[a].zh).join('、')}`)
  }
  if (c.abilityMethod === 'standard' && filled && !isValidStandardArray(c.baseScores)) {
    warnings.push('標準陣列的 15、14、13、12、10、8 每個數字要剛好用一次')
  }
  return { abilities, pending, warnings }
}

/** 預覽：某屬性再加 amount（上限 max）後的值與調整值。給「選哪個屬性加值」的選項用。 */
export function previewBonus(line: Pick<AbilityLine, 'score' | 'mod' | 'override'>, amount: number, max = 20) {
  // 有手動覆寫時，加值不影響最終值
  const score = line.override !== undefined ? line.score : line.score >= max ? line.score : Math.min(max, line.score + amount)
  const mod = abilityMod(score)
  return { score, mod, delta: score - line.score, modChanged: mod !== line.mod }
}
