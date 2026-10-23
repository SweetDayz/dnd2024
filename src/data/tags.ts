/**
 * 5etools 內文標籤 `{@tag 參數|參數|…}` 的解析器（純 TS，不依賴 Vue）。
 *
 *   parseTags('你知晓{@spell 次级幻象|XPHB}戏法')
 *   → ['你知晓', { tag: 'spell', args: ['次级幻象', 'XPHB'], raw: '{@spell 次级幻象|XPHB}' }, '戏法']
 *
 * 標籤可以巢狀（例如 `{@note 注：{@book …}}`），所以用括號配對而不是正規表示式。
 * 再由 describeTag() 把一個標籤轉成「要怎麼顯示」：純文字、樣式文字、或可連結的條目。
 */
import type { EntryKind } from './ids.ts'

export interface TagNode {
  tag: string
  args: string[]
  raw: string
}
export type TextNode = string | TagNode

/** 把字串切成純文字與標籤節點。不成對的 `{@` 會被當成純文字。 */
export function parseTags(text: string): TextNode[] {
  const out: TextNode[] = []
  let buf = ''
  let i = 0
  while (i < text.length) {
    if (text.startsWith('{@', i)) {
      const end = matchBrace(text, i)
      if (end < 0) {
        buf += text.slice(i)
        break
      }
      if (buf) out.push(buf)
      buf = ''
      const raw = text.slice(i, end + 1)
      const inner = raw.slice(2, -1)
      const sp = inner.search(/\s/)
      const tag = sp < 0 ? inner : inner.slice(0, sp)
      const rest = sp < 0 ? '' : inner.slice(sp + 1)
      out.push({ tag, args: splitTopLevel(rest), raw })
      i = end + 1
    } else {
      buf += text[i]
      i++
    }
  }
  if (buf) out.push(buf)
  return out
}

/** 從 `{` 的位置找到配對的 `}`；找不到回傳 -1。 */
function matchBrace(text: string, start: number): number {
  let depth = 0
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/** 依最外層的 `|` 切開（巢狀標籤裡的 `|` 不算）。 */
function splitTopLevel(s: string): string[] {
  const parts: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of s) {
    if (ch === '{') depth++
    else if (ch === '}') depth--
    if (ch === '|' && depth === 0) {
      parts.push(cur)
      cur = ''
    } else cur += ch
  }
  parts.push(cur)
  return parts
}

/** 去掉所有標籤、只留顯示文字（用於搜尋、tooltip 摘要）。 */
export function stripTags(text: string): string {
  return parseTags(text)
    .map((n) => {
      if (typeof n === 'string') return n
      const d = describeTag(n)
      return d.type === 'unknown' ? n.args[0] ?? '' : stripTags(d.text)
    })
    .join('')
}

export type StyleName = 'b' | 'i' | 'u' | 's' | 'sup' | 'sub' | 'note' | 'dice' | 'code'

/** 標籤 → 顯示方式。 */
export type TagView =
  /** 可連結到本站資料的條目（有 tooltip） */
  | { type: 'link'; text: string; kind: EntryKind; name: string; source: string; extra?: string[] }
  /** 本站沒有資料、但知道是什麼的參照（怪物、神祇、書本章節…），以樣式文字顯示 */
  | { type: 'ref'; text: string; tag: string }
  /** 樣式：粗體、斜體、骰子… text 本身可能還含有巢狀標籤 */
  | { type: 'style'; text: string; style: StyleName; color?: string }
  /** 不認得的標籤：顯示純文字，並記錄 warning */
  | { type: 'unknown'; text: string; tag: string }

/** 省略來源時的預設（5etools 2014 慣例，XPHB 系列資料一律寫明來源）。 */
const DEFAULT_SOURCE: Record<string, string> = {
  spell: 'PHB',
  item: 'DMG',
  condition: 'PHB',
  disease: 'DMG',
  status: 'PHB',
  skill: 'PHB',
  sense: 'PHB',
  action: 'PHB',
  feat: 'PHB',
  background: 'PHB',
  race: 'PHB',
  class: 'PHB',
  optfeature: 'PHB',
  variantrule: 'DMG',
  language: 'PHB',
  itemProperty: 'PHB',
  itemMastery: 'XPHB',
}

/** 標籤名 → 本站 kind（同名者省略）。 */
const LINK_KIND: Record<string, EntryKind> = {
  spell: 'spell',
  item: 'item',
  condition: 'condition',
  disease: 'disease',
  status: 'status',
  skill: 'skill',
  sense: 'sense',
  action: 'action',
  feat: 'feat',
  background: 'background',
  race: 'race',
  optfeature: 'optionalfeature',
  variantrule: 'variantrule',
  language: 'language',
  itemProperty: 'itemProperty',
  itemMastery: 'itemMastery',
}

/** 本站沒有資料的參照型標籤：顯示文字的位置（第幾個參數，找不到就用第 0 個）。 */
const REF_DISPLAY_INDEX: Record<string, number> = {
  creature: 2,
  deity: 2,
  hazard: 2,
  object: 2,
  vehicle: 2,
  table: 2,
  card: 3,
  deck: 2,
  book: 0,
  adventure: 0,
  filter: 0,
  '5etools': 0,
  quickref: 4,
  reward: 2,
  trap: 2,
  cult: 2,
  boon: 2,
  recipe: 2,
  psionic: 2,
  legroup: 2,
  charoption: 2,
  facility: 2,
}

const STYLE: Record<string, StyleName> = {
  b: 'b',
  bold: 'b',
  i: 'i',
  italic: 'i',
  u: 'u',
  underline: 'u',
  s: 's',
  strike: 's',
  sup: 'sup',
  sub: 'sub',
  note: 'note',
  tip: 'i',
  code: 'code',
  kbd: 'code',
  highlight: 'b',
}

const ATK: Record<string, string> = {
  m: '近战攻击',
  r: '远程攻击',
  mw: '近战武器攻击',
  rw: '远程武器攻击',
  'mw,rw': '近战或远程武器攻击',
  ms: '近战法术攻击',
  rs: '远程法术攻击',
  'ms,rs': '近战或远程法术攻击',
}

const signed = (n: string) => (/^[+-]/.test(n) ? n : `+${n}`)
const pick = (args: string[], i: number) => args[i] || args[0] || ''

export function describeTag(node: TagNode): TagView {
  const { tag, args } = node
  const a0 = args[0] ?? ''

  if (STYLE[tag]) return { type: 'style', style: STYLE[tag], text: tag === 'tip' ? pick(args, 1) : a0 }
  if (tag === 'color') return { type: 'style', style: 'b', text: a0, color: args[1] ? `#${args[1].replace(/^#/, '')}` : undefined }

  switch (tag) {
    case 'dice':
    case 'damage':
    case 'autodice':
      return { type: 'style', style: 'dice', text: args[2] || a0 }
    case 'scaledice':
    case 'scaledamage':
      // {@scaledamage 8d6|3-9|1d6}：顯示每升一環增加的骰子
      return { type: 'style', style: 'dice', text: args[3] || args[2] || a0 }
    case 'd20':
    case 'hit':
      return { type: 'style', style: 'dice', text: args[2] || signed(a0) }
    case 'dc':
      return { type: 'style', style: 'b', text: `DC ${args[1] || a0}` }
    case 'chance':
      return { type: 'style', style: 'dice', text: args[1] || `${a0}%` }
    case 'recharge':
      return { type: 'style', style: 'i', text: a0 ? `（充能 ${a0}–6）` : '（充能 6）' }
    case 'h':
      return { type: 'style', style: 'i', text: '命中：' }
    case 'atk':
      return { type: 'style', style: 'i', text: `${ATK[a0] ?? a0}：` }
    case 'link':
      return { type: 'ref', tag, text: a0 }
    case 'class':
      return { type: 'link', kind: 'class', name: a0, source: args[1] || DEFAULT_SOURCE.class!, text: pick(args, 2) }
    case 'subclass':
      // {@subclass 短名|職業|職業來源|來源|顯示}
      return {
        type: 'link',
        kind: 'subclass',
        name: a0,
        source: args[3] || args[2] || 'PHB',
        extra: [args[1] ?? '', args[2] || 'PHB'],
        text: pick(args, 4),
      }
    case 'classFeature':
      // {@classFeature 名稱|職業|職業來源|等級|來源|顯示}
      return {
        type: 'link',
        kind: 'classFeature',
        name: a0,
        source: args[4] || args[2] || 'PHB',
        extra: [args[1] ?? '', args[2] || 'PHB', args[3] ?? ''],
        text: pick(args, 5),
      }
    case 'subclassFeature':
      // {@subclassFeature 名稱|職業|職業來源|子職短名|子職來源|等級|來源|顯示}
      return {
        type: 'link',
        kind: 'subclassFeature',
        name: a0,
        source: args[6] || args[4] || 'PHB',
        extra: [args[1] ?? '', args[2] || 'PHB', args[3] ?? '', args[4] || 'PHB', args[5] ?? ''],
        text: pick(args, 7),
      }
  }

  const kind = LINK_KIND[tag]
  if (kind) return { type: 'link', kind, name: a0, source: args[1] || DEFAULT_SOURCE[tag] || 'PHB', text: pick(args, 2) }

  const di = REF_DISPLAY_INDEX[tag]
  if (di !== undefined) return { type: 'ref', tag, text: pick(args, di) }

  return { type: 'unknown', tag, text: a0 }
}
