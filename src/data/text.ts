/**
 * 5etools entries → 純文字（給 xlsx 匯出等不能顯示 HTML 的地方用）。
 *
 * 對應 src/components/entries/EntryBlock.vue 的版面，但輸出成多行字串：
 * 段落一行一段、小標題接「：」、清單項目前面加「・」、表格每列以「｜」分隔。
 * 所有 {@tag} 都經過 stripTags，不會殘留標籤語法。
 */
import { stripTags } from './tags.ts'

type E = Record<string, unknown>

const ABILITY: Record<string, string> = { str: '力量', dex: '敏捷', con: '体质', int: '智力', wis: '感知', cha: '魅力' }

function cell(c: unknown): string {
  if (c && typeof c === 'object' && (c as E).type === 'cell') {
    const o = c as { roll?: { exact?: number; min?: number; max?: number }; entry?: unknown }
    if (o.roll) return o.roll.exact !== undefined ? String(o.roll.exact) : `${o.roll.min}–${o.roll.max}`
    return inline(o.entry)
  }
  return inline(c)
}

/** 單行：多段落以空格接起來 */
function inline(v: unknown): string {
  return lines(v).join(' ')
}

function lines(v: unknown): string[] {
  if (v === undefined || v === null) return []
  if (typeof v === 'string') return [stripTags(v)]
  if (typeof v === 'number') return [String(v)]
  if (Array.isArray(v)) return v.flatMap(lines)
  if (typeof v !== 'object') return []
  const e = v as E
  const name = typeof e.name === 'string' ? stripTags(e.name) : ''
  switch (e.type) {
    case 'list':
      return ((e.items as unknown[]) ?? []).map((it) => `・${inline(it)}`)
    case 'item':
    case 'itemSub':
    case 'itemSpell': {
      const body = inline(e.entry ?? e.entries)
      return [name ? `${name}${/[：:。.]$/.test(name) ? '' : '：'}${body}` : body]
    }
    case 'table': {
      const out: string[] = []
      if (typeof e.caption === 'string') out.push(stripTags(e.caption))
      if (Array.isArray(e.colLabels)) out.push((e.colLabels as unknown[]).map(cell).join('｜'))
      for (const row of (e.rows as unknown[]) ?? []) {
        const cells = Array.isArray(row) ? row : ((row as E)?.row as unknown[]) ?? []
        out.push(cells.map(cell).join('｜'))
      }
      return out
    }
    case 'abilityDc':
      return [`${name}豁免 DC = 8 + 熟练加值 + ${attrs(e)}调整值`]
    case 'abilityAttackMod':
      return [`${name}攻击加值 = 熟练加值 + ${attrs(e)}调整值`]
    case 'dice':
      return [((e.toRoll as E[]) ?? []).map((d) => `${d.number}d${d.faces}${d.modifier ? `+${d.modifier}` : ''}`).join('+')]
    case 'bonus':
    case 'bonusSpeed':
      return [`${Number(e.value) >= 0 ? '+' : ''}${e.value}`]
    case 'link':
      return [String(e.text ?? '')]
    case 'image':
    case 'gallery':
    case 'hr':
      return []
    case 'refClassFeature':
    case 'refSubclassFeature':
    case 'refOptionalfeature': {
      const ref = String(e.classFeature ?? e.subclassFeature ?? e.optionalfeature ?? '')
      return ref ? [`（${ref.split('|')[0]}）`] : []
    }
  }
  // 容器（entries、section、inset、quote、options、inline…）：小標題接第一段
  const body = lines(e.entries ?? e.items ?? e.entry)
  if (name && body.length) return [`${name}${/[：:。.]$/.test(name) ? '' : '：'}${body[0]}`, ...body.slice(1)]
  if (name) return [name]
  return body
}

function attrs(e: E): string {
  return ((e.attributes as string[]) ?? []).map((a) => ABILITY[a] ?? a).join('或')
}

/** entries（字串、陣列或物件）→ 多行純文字 */
export function entriesToText(entries: unknown): string {
  return lines(entries)
    .map((s) => s.trim())
    .filter(Boolean)
    .join('\n')
}
