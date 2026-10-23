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

export interface AbilityScore {
  ability: Ability
  base: number | null
  bonuses: { amount: number; origin: Origin }[]
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
}

/** 屬性值：基礎值依序加上各項加值；每項加值有上限（一般 20，傳奇恩惠 30）。 */
export function abilityScores(c: Pick<Character, 'baseScores'>, b: Pick<Build, 'abilityBonuses'>): Record<Ability, AbilityScore> {
  const out = {} as Record<Ability, AbilityScore>
  for (const a of ABILITIES) {
    const base = c.baseScores[a]
    const bonuses = b.abilityBonuses.filter((x) => x.ability === a)
    let score = base ?? 10
    // 上限低的先加：一般加值到 20 為止，傳奇恩惠可以再往上到 30
    for (const x of [...bonuses].sort((p, q) => p.max - q.max)) {
      if (score < x.max) score = Math.min(x.max, score + x.amount)
    }
    out[a] = { ability: a, base, bonuses: bonuses.map((x) => ({ amount: x.amount, origin: x.origin })), score, mod: abilityMod(score) }
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
  return [...m.values()]
}

function hitDie(cls: Entry | undefined): number {
  const hd = cls?.hd as { faces?: number } | undefined
  return Number(hd?.faces ?? 8)
}

export function deriveSheet(c: Character, b: Build, data: RulesData): Sheet {
  const level = Math.max(1, c.levels.length)
  const pb = proficiencyBonus(level)
  const abilities = abilityScores(c, b)
  const mod = (a: Ability) => abilities[a].mod

  const saves = {} as Record<Ability, SaveRow>
  for (const a of ABILITIES) {
    const sources = b.profs.filter((p) => p.type === 'save' && p.value === a).map((p) => p.origin)
    saves[a] = { ability: a, proficient: sources.length > 0, mod: mod(a) + (sources.length ? pb : 0), sources }
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
      mod: mod(ability) + level * pb,
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
  const hpMax = hpLevels.reduce((sum, r) => sum + Math.max(1, r.value + conMod), 0)
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

  return {
    level,
    profBonus: pb,
    abilities,
    saves,
    skills,
    initiative: mod('dex'),
    passive: {
      perception: 10 + skillMod('perception'),
      insight: 10 + skillMod('insight'),
      investigation: 10 + skillMod('investigation'),
    },
    hp: { max: hpMax, levels: hpLevels, conMod },
    hitDice: [...dice.entries()].map(([die, count]) => ({ die, count })),
    speeds,
    senses: maxBy(b.senses, (s) => s.type, (s) => s.range),
    profs: {
      tool: groupProfs(data, b.profs, 'tool'),
      language: groupProfs(data, b.profs, 'language'),
      weapon: groupProfs(data, b.profs, 'weapon'),
      armor: groupProfs(data, b.profs, 'armor'),
    },
  }
}
