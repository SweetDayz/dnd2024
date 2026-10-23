/**
 * 數值計算：Build（角色擁有什麼）＋基礎屬性值 → 角卡上的數字。純函式。
 *
 * 只算「結構化欄位算得出來」的東西；敘述文字裡的效果（例如侏儒狡黠的豁免優勢）
 * 交給 effects.ts 列在效果頁，算不到的由玩家手動覆寫（overrides）。
 */
import type { Entry } from '../data/types.ts'
import { ABILITIES, abilityMod, isAbility, proficiencyBonus, type Ability } from './abilities.ts'
import type { Build, Origin, ProfGrant } from './build.ts'
import type { Character } from './character.ts'
import { profLabel, skillList, type ProfType, type RulesData } from './data.ts'
import { armorClass, encumbrance, type ArmorClass, type Encumbrance } from './equipment.ts'
import { spellSlots, type SpellSlots } from './multiclass.ts'

export interface AbilityScore {
  ability: Ability
  base: number | null
  bonuses: { amount: number; origin: Origin }[]
  /** 自動計算的值（未套用手動覆寫） */
  computed: number
  /** 最終值（有覆寫就是覆寫值） */
  score: number
  mod: number
}

export interface SaveRow {
  ability: Ability
  proficient: boolean
  mod: number
  sources: Origin[]
}

export interface SkillRow {
  key: string
  name: string
  engName: string
  ability: Ability
  /** 0 無、1 熟練、2 專精 */
  prof: 0 | 1 | 2
  mod: number
  sources: Origin[]
  entry?: Entry
}

export interface ProfRow {
  value: string
  label: string
  sources: Origin[]
  /** 只來自 2014 版條目（例如 2014 種族的語言），畫面標示「2014 版」 */
  legacy?: boolean
}

export interface HpLevelRow {
  level: number
  className: string
  die: number
  /** 這一級的骰值部分（1 級為最大值，之後為平均或擲骰） */
  value: number
  mode: 'max' | 'average' | 'roll'
}

export interface Sheet {
  level: number
  profBonus: number
  abilities: Record<Ability, AbilityScore>
  saves: Record<Ability, SaveRow>
  skills: SkillRow[]
  initiative: number
  passive: { perception: number; insight: number; investigation: number }
  hp: { max: number; levels: HpLevelRow[]; conMod: number }
  hitDice: { die: number; count: number }[]
  speeds: { mode: string; value: number; origin: Origin }[]
  senses: { type: string; range: number; origin: Origin }[]
  profs: Record<Exclude<ProfType, 'skill' | 'save' | 'expertise'>, ProfRow[]>
  /** 法術位（含兼職施法者等級與契約魔法） */
  spellcasting: SpellSlots
  ac: ArmorClass
  encumbrance: Encumbrance
  /** 套用了手動覆寫的欄位：key → 自動計算值與覆寫值 */
  overridden: Record<string, { computed: number; value: number }>
}

/**
 * 可手動覆寫的欄位。分兩層：
 *   - 輸入層（會連動其他數值）：ability:<屬性>、profBonus
 *   - 結果層（只改自己，但下游會讀到覆寫後的值）：save:<屬性>、skill:<技能>（被動感知等跟著變）、
 *     initiative、passivePerception、passiveInsight、passiveInvestigation、hpMax、ac、speed
 */
export const OVERRIDE_KEYS = ['profBonus', 'initiative', 'passivePerception', 'passiveInsight', 'passiveInvestigation', 'hpMax', 'ac', 'speed'] as const

/**
 * 屬性值：基礎值依序加上各項加值；每項加值有上限（一般 20，傳奇恩惠 30）。
 * 手動覆寫 `ability:<屬性>` 會取代最終值，之後所有依賴它的數值（調整值、豁免、技能、HP、法術 DC、攻擊…）都跟著變。
 */
export function abilityScores(
  c: Pick<Character, 'baseScores'> & Partial<Pick<Character, 'overrides'>>,
  b: Pick<Build, 'abilityBonuses'>,
): Record<Ability, AbilityScore> {
  const out = {} as Record<Ability, AbilityScore>
  for (const a of ABILITIES) {
    const base = c.baseScores[a]
    const bonuses = b.abilityBonuses.filter((x) => x.ability === a)
    let computed = base ?? 10
    // 上限低的先加：一般加值到 20 為止，傳奇恩惠可以再往上到 30
    for (const x of [...bonuses].sort((p, q) => p.max - q.max)) {
      if (computed < x.max) computed = Math.min(x.max, computed + x.amount)
    }
    const o = c.overrides?.[`ability:${a}`]
    const score = typeof o === 'number' && Number.isFinite(o) ? o : computed
    out[a] = {
      ability: a,
      base,
      bonuses: bonuses.map((x) => ({ amount: x.amount, origin: x.origin })),
      computed,
      score,
      mod: abilityMod(score),
    }
  }
  return out
}

function groupProfs(data: RulesData, profs: ProfGrant[], type: ProfType): ProfRow[] {
  const m = new Map<string, ProfRow>()
  for (const p of profs) {
    if (p.type !== type) continue
    const row = m.get(p.value) ?? {
      value: p.value,
      label: p.value.startsWith('filter:') ? p.value.slice(7) : profLabel(data, type, p.value),
      sources: [],
    }
    row.sources.push(p.origin)
    m.set(p.value, row)
  }
  for (const r of m.values()) if (r.sources.every((o) => o.compat)) r.legacy = true
  return [...m.values()]
}

function hitDie(cls: Entry | undefined): number {
  const hd = cls?.hd as { faces?: number } | undefined
  return Number(hd?.faces ?? 8)
}

export function deriveSheet(c: Character, b: Build, data: RulesData): Sheet {
  const overridden: Sheet['overridden'] = {}
  /** 套用某欄位的覆寫並記錄；沒有覆寫就回傳計算值 */
  const ov = (key: string, computed: number): number => {
    const o = c.overrides?.[key]
    if (typeof o !== 'number' || !Number.isFinite(o)) return computed
    overridden[key] = { computed, value: o }
    return o
  }
  const level = Math.max(1, c.levels.length)
  const pb = ov('profBonus', proficiencyBonus(level))
  const abilities = abilityScores(c, b)
  for (const a of ABILITIES) {
    if (abilities[a].score !== abilities[a].computed) overridden[`ability:${a}`] = { computed: abilities[a].computed, value: abilities[a].score }
  }
  const mod = (a: Ability) => abilities[a].mod

  const saves = {} as Record<Ability, SaveRow>
  for (const a of ABILITIES) {
    const sources = b.profs.filter((p) => p.type === 'save' && p.value === a).map((p) => p.origin)
    saves[a] = { ability: a, proficient: sources.length > 0, mod: ov(`save:${a}`, mod(a) + (sources.length ? pb : 0)), sources }
  }

  const skills: SkillRow[] = skillList(data).map((s) => {
    const prof = b.profs.filter((p) => p.type === 'skill' && p.value === s.key)
    const exp = b.profs.filter((p) => p.type === 'expertise' && p.value === s.key)
    const level: 0 | 1 | 2 = prof.length ? (exp.length ? 2 : 1) : 0
    const ability = (isAbility(s.ability) ? s.ability : 'int') as Ability
    return {
      key: s.key,
      name: s.name,
      engName: s.engName,
      ability,
      prof: level,
      mod: ov(`skill:${s.key}`, mod(ability) + level * pb),
      sources: [...prof, ...exp].map((p) => p.origin),
      ...(s.entry ? { entry: s.entry } : {}),
    }
  })
  const skillMod = (k: string) => skills.find((s) => s.key === k)?.mod ?? 0

  // HP：1 級取生命骰最大值，之後每級取平均（d/2+1）或擲骰結果；每級加體質調整值（每級至少 1）
  const conMod = mod('con')
  const counts = new Map<string, number>()
  const hpLevels: HpLevelRow[] = c.levels.map((lv, i) => {
    const cls = data.get(lv.classId)
    const die = hitDie(cls)
    counts.set(lv.classId, (counts.get(lv.classId) ?? 0) + 1)
    if (i === 0) return { level: 1, className: cls?.name ?? '?', die, value: die, mode: 'max' }
    const avg = die / 2 + 1
    const rolled = lv.hp.mode === 'roll' && typeof lv.hp.roll === 'number'
    return { level: i + 1, className: cls?.name ?? '?', die, value: rolled ? lv.hp.roll! : avg, mode: rolled ? 'roll' : 'average' }
  })
  const hpMax = ov('hpMax', hpLevels.reduce((sum, r) => sum + Math.max(1, r.value + conMod), 0))
  const dice = new Map<number, number>()
  for (const r of hpLevels) dice.set(r.die, (dice.get(r.die) ?? 0) + 1)

  // 速度、感官：同一種取最大值
  const maxBy = <T extends { value?: number; range?: number }>(list: T[], keyOf: (x: T) => string, val: (x: T) => number) => {
    const m = new Map<string, T>()
    for (const x of list) {
      const prev = m.get(keyOf(x))
      if (!prev || val(x) > val(prev)) m.set(keyOf(x), x)
    }
    return [...m.values()]
  }
  const speeds = maxBy(b.speeds, (s) => s.mode, (s) => s.value)
  if (!speeds.some((s) => s.mode === 'walk')) speeds.unshift({ mode: 'walk', value: 30, origin: { type: 'rule', name: '預設', level: 1 } })
  const walkIdx = speeds.findIndex((s) => s.mode === 'walk')
  const ac = armorClass(data, c, { abilities, profs: { armor: groupProfs(data, b.profs, 'armor') } })
  // 重甲的力量需求未達：速度 −10 呎（2024 PHB 護甲表規則）
  const heavyPenalty = ac.armor?.strength && abilities.str.score < Number(ac.armor.strength) ? 10 : 0
  if (heavyPenalty) speeds[walkIdx] = { ...speeds[walkIdx]!, value: Math.max(0, speeds[walkIdx]!.value - heavyPenalty) }
  const walkSpeed = ov('speed', speeds[walkIdx]!.value)
  if (walkSpeed !== speeds[walkIdx]!.value) speeds[walkIdx] = { ...speeds[walkIdx]!, value: walkSpeed }

  const profs = {
    tool: groupProfs(data, b.profs, 'tool'),
    language: groupProfs(data, b.profs, 'language'),
    weapon: groupProfs(data, b.profs, 'weapon'),
    armor: groupProfs(data, b.profs, 'armor'),
  }

  return {
    level,
    profBonus: pb,
    abilities,
    saves,
    skills,
    initiative: ov('initiative', mod('dex')),
    passive: {
      perception: ov('passivePerception', 10 + skillMod('perception')),
      insight: ov('passiveInsight', 10 + skillMod('insight')),
      investigation: ov('passiveInvestigation', 10 + skillMod('investigation')),
    },
    hp: { max: hpMax, levels: hpLevels, conMod },
    hitDice: [...dice.entries()].map(([die, count]) => ({ die, count })),
    speeds,
    senses: maxBy(b.senses, (s) => s.type, (s) => s.range),
    profs,
    spellcasting: spellSlots(b.classes),
    ac: { ...ac, value: ov('ac', ac.value) },
    encumbrance: encumbrance(data, c, abilities.str.score, b.size?.value ?? 'M'),
    overridden,
  }
}
