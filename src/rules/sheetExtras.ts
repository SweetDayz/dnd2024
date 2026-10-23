/**
 * 角卡的輔助計算：手動覆寫、個性懶人表、身高體重擲骰（純函式）。
 */
import type { Entry } from '../data/types.ts'
import { parseDice, rollExpr, type Rng } from './dice.ts'

// ---------------------------------------------------------------------------
// 手動覆寫
// ---------------------------------------------------------------------------

export interface Shown {
  value: number
  computed: number
  overridden: boolean
}

/** 套用手動覆寫：有覆寫就顯示覆寫值，並保留計算值給畫面提示。 */
export function withOverride(overrides: Record<string, number>, key: string, computed: number): Shown {
  const o = overrides[key]
  return typeof o === 'number' && Number.isFinite(o)
    ? { value: o, computed, overridden: true }
    : { value: computed, computed, overridden: false }
}

// ---------------------------------------------------------------------------
// 個性特質、理想、羈絆、缺點（資料有表才提供；2014 背景才有）
// ---------------------------------------------------------------------------

export type TraitField = 'personality' | 'ideals' | 'bonds' | 'flaws'

export const TRAIT_LABEL: Record<TraitField, string> = {
  personality: '個性特質',
  ideals: '理想',
  bonds: '羈絆',
  flaws: '缺點',
}

const TRAIT_PATTERN: [TraitField, RegExp][] = [
  ['personality', /特点|特质|个性|性格/],
  ['ideals', /理念|理想/],
  ['bonds', /牵挂|羁绊|联系/],
  ['flaws', /缺陷|缺点/],
]

export interface TraitTable {
  field: TraitField
  label: string
  faces: number
  rows: { roll: string; text: string }[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any

/** 從背景內文找出 d8 個性、d6 理想…這類表（第一欄標題是 dN，第二欄標題符合關鍵字）。 */
export function traitTables(bg: Entry | undefined): TraitTable[] {
  if (!bg) return []
  const out: TraitTable[] = []
  const walk = (v: Json) => {
    if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') {
      if (v.type === 'table' && Array.isArray(v.colLabels) && v.colLabels.length === 2) {
        const die = /d(\d+)/i.exec(String(v.colLabels[0]))
        const hit = TRAIT_PATTERN.find(([, re]) => re.test(String(v.colLabels[1])))
        if (die && hit && !out.some((t) => t.field === hit[0])) {
          out.push({
            field: hit[0],
            label: String(v.colLabels[1]),
            faces: Number(die[1]),
            rows: (v.rows as Json[][]).map((r) => ({ roll: String(r[0]), text: String(r[1]) })),
          })
        }
      }
      walk(v.entries)
      walk(v.items)
    }
  }
  walk(bg.entries)
  return out
}

// ---------------------------------------------------------------------------
// 身高體重（2014 種族才有 heightAndWeight；2024 種族沒有，讓玩家手填）
// ---------------------------------------------------------------------------

export interface HeightWeight {
  baseHeight: number
  heightMod?: string
  baseWeight: number
  weightMod?: string
}

/** 身高 = 基礎 + 身高骰（吋）；體重 = 基礎 + 身高骰 × 體重骰（磅）。 */
export function rollHeightWeight(hw: HeightWeight, rng?: Rng): { height: number; weight: number; dice: number[] } {
  const h = hw.heightMod ? parseDice(hw.heightMod) : undefined
  const w = hw.weightMod ? parseDice(hw.weightMod) : undefined
  const hr = h ? rollExpr(h, rng) : { dice: [], total: 0 }
  const wr = w ? rollExpr(w, rng) : { dice: [], total: 1 }
  return { height: hw.baseHeight + hr.total, weight: hw.baseWeight + hr.total * wr.total, dice: [...hr.dice, ...wr.dice] }
}

export const inchesToText = (inches: number) => `${Math.floor(inches / 12)} 呎 ${inches % 12} 吋`
