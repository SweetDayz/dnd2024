/**
 * 條目摘要（給 tooltip 用）：取內文第一段純文字，去掉標籤後截斷。
 */
import { stripTags } from './tags.ts'
import type { Entry } from './types.ts'

const SCHOOL: Record<string, string> = {
  A: '防护',
  C: '咒法',
  D: '预言',
  E: '惑控',
  V: '塑能',
  I: '幻术',
  N: '死灵',
  T: '变化',
}

export function schoolName(code: unknown): string {
  return SCHOOL[String(code)] ?? String(code ?? '')
}

export function spellLevelText(level: unknown): string {
  return level === 0 ? '戏法' : `${level}环`
}

/** 深度優先找第一個字串。 */
function firstText(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    for (const v of value) {
      const t = firstText(v)
      if (t) return t
    }
    return undefined
  }
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>
    return firstText(o.entries) ?? firstText(o.entry) ?? firstText(o.items)
  }
  return undefined
}

export function summarize(entry: Entry, max = 140): string {
  const prefix = entry.kind === 'spell' ? `${spellLevelText(entry.level)}${schoolName(entry.school)}。` : ''
  const text = stripTags(firstText(entry.entries) ?? '').trim()
  const body = text.length > max ? `${text.slice(0, max)}…` : text
  return prefix + body
}
