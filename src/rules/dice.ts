/**
 * 擲骰工具。亂數來源可注入，測試時就能用固定序列。
 */

/** 回傳 [0, 1) 的亂數，與 Math.random 相同介面。 */
export type Rng = () => number

export const defaultRng: Rng = () => Math.random()

export function rollDie(faces: number, rng: Rng = defaultRng): number {
  return 1 + Math.floor(rng() * faces)
}

export function rollDice(count: number, faces: number, rng: Rng = defaultRng): number[] {
  return Array.from({ length: count }, () => rollDie(faces, rng))
}

export interface DiceExpr {
  count: number
  faces: number
  /** 乘數，例如起始金幣「5d4 × 10」 */
  multiplier: number
  bonus: number
}

/** 解析「4d4」「5d4 × 10」「2d8+1」這類算式；不認得就回傳 undefined。 */
export function parseDice(text: string): DiceExpr | undefined {
  const m = /^\s*(\d+)\s*d\s*(\d+)\s*(?:([+-])\s*(\d+))?\s*(?:[×x*]\s*(\d+))?\s*$/i.exec(text)
  if (!m) return undefined
  return {
    count: Number(m[1]),
    faces: Number(m[2]),
    bonus: m[3] ? Number(`${m[3]}${m[4]}`) : 0,
    multiplier: m[5] ? Number(m[5]) : 1,
  }
}

export function rollExpr(expr: DiceExpr, rng: Rng = defaultRng): { dice: number[]; total: number } {
  const dice = rollDice(expr.count, expr.faces, rng)
  const total = (dice.reduce((a, b) => a + b, 0) + expr.bonus) * expr.multiplier
  return { dice, total }
}

/** 給測試用：依序回傳指定骰面（1 起算）的假亂數。 */
export function fixedRng(faces: number, values: number[]): Rng {
  let i = 0
  return () => {
    const v = values[i++ % values.length]!
    return (v - 1) / faces + 1e-9
  }
}
