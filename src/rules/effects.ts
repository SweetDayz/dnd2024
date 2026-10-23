/**
 * 效果自動偵測（CLAUDE.md §6）：從角色所有特性、特質、專長的原文中，找出「會影響數值或擲骰」的段落。
 *
 * 不做人工對照表。判斷只靠：
 *   - 內文標籤：{@skill}、{@condition}、{@damage}、{@dice}、{@dc}、{@sense}、{@variantrule 优势} …
 *   - 簡體原文關鍵字：优势、劣势、豁免、抗性、AC、速度、生命值、先攻…
 * 原則是「寧可多列，不要漏列」。能推斷出對應角卡欄位的（例如某段同時提到「智力」和「豁免」），
 * 就附上 fields，角卡在該欄位旁放小圖示連到效果頁。
 */
import type { Entry } from '../data/types.ts'
import { parseTags, stripTags } from '../data/tags.ts'
import { ABILITIES, ABILITY_NAME, type Ability } from './abilities.ts'
import type { Build, Feature } from './build.ts'
import { normalizeSkill, type RulesData } from './data.ts'

export interface Effect {
  key: string
  /** 所屬特性 */
  feature: Feature
  /** 段落標題：特性名，若段落有小標題則接在後面 */
  title: string
  /** 去掉標籤的純文字（列表用） */
  text: string
  /** 原文（展開用，保留標籤） */
  raw: string
  /** 命中的關鍵字／標籤 */
  hits: string[]
  /** 推斷出的角卡欄位，例如 save:int、skill:stealth、ac、speed */
  fields: string[]
}

/** 關鍵字 → 命中時顯示的名稱。全部用簡體比對（資料是簡體）。 */
const KEYWORDS: [RegExp, string][] = [
  [/优势/, '优势'],
  [/劣势/, '劣势'],
  [/豁免/, '豁免'],
  [/抗性/, '抗性'],
  [/免疫/, '免疫'],
  [/易伤/, '易伤'],
  [/\bAC\b|护甲等级/, 'AC'],
  [/速度/, '速度'],
  [/生命值/, '生命值'],
  [/先攻/, '先攻'],
  [/攻击检定/, '攻击检定'],
  [/伤害/, '伤害'],
  [/检定/, '检定'],
  [/加值/, '加值'],
  [/熟练/, '熟练'],
  [/专精/, '专精'],
  [/黑暗视觉|盲视|震颤感知|真实视觉/, '感官'],
  [/被动/, '被动'],
  [/临时生命值/, '临时生命值'],
  [/重骰|重掷/, '重骰'],
  [/英雄激励/, '英雄激励'],
  [/负重|携带量|负载/, '负重'],
]

/** 這些標籤出現就算命中（標籤名 → 顯示名稱）。 */
const TAGS: Record<string, string> = {
  skill: '技能',
  condition: '状态',
  damage: '伤害骰',
  dice: '骰子',
  d20: 'd20',
  dc: 'DC',
  hit: '命中加值',
  sense: '感官',
  chance: '機率',
  scaledamage: '伤害骰',
  scaledice: '骰子',
}
/** {@variantrule X} 中這些規則名稱算命中 */
const RULE_WORDS = /优势|劣势|抗性|免疫|易伤|临时生命值|熟练|专精|豁免|先攻|速度|护甲等级|生命值|重骰|英雄激励/

interface Paragraph {
  heading?: string
  text: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any

/** 攤平 entries：每個字串是一段，記住最近的小標題。 */
function paragraphs(entries: unknown, heading?: string, out: Paragraph[] = []): Paragraph[] {
  if (typeof entries === 'string') out.push({ ...(heading ? { heading } : {}), text: entries })
  else if (Array.isArray(entries)) for (const e of entries) paragraphs(e, heading, out)
  else if (entries && typeof entries === 'object') {
    const o = entries as Json
    const h = typeof o.name === 'string' ? o.name : heading
    if (o.type === 'table') {
      for (const row of o.rows ?? []) paragraphs([].concat(row).filter((c: unknown) => typeof c === 'string').join('｜'), h, out)
    } else {
      paragraphs(o.entries ?? o.entry ?? o.items, h, out)
    }
  }
  return out
}

/** 一段文字命中了哪些關鍵字與標籤。 */
export function detectHits(raw: string): string[] {
  const hits = new Set<string>()
  const plain = stripTags(raw)
  for (const [re, label] of KEYWORDS) if (re.test(plain)) hits.add(label)
  const walk = (s: string) => {
    for (const n of parseTags(s)) {
      if (typeof n === 'string') continue
      if (TAGS[n.tag]) hits.add(TAGS[n.tag]!)
      if (n.tag === 'variantrule' && RULE_WORDS.test(n.args[0] ?? '')) hits.add(n.args[0]!.split(/[[［]/)[0]!.trim())
      for (const a of n.args) if (a.includes('{@')) walk(a)
    }
  }
  walk(raw)
  return [...hits]
}

const abilityIn = (text: string): Ability[] => ABILITIES.filter((a) => text.includes(ABILITY_NAME[a].zh))

/** 從一段文字推斷對應的角卡欄位。推斷不出就回傳空陣列。 */
export function inferFields(raw: string, data?: RulesData): string[] {
  const text = stripTags(raw)
  const f = new Set<string>()
  // 「目標必須進行 X 豁免」是別人的豁免（例如吐息武器的 DC），不是角色自己的豁免欄位
  const targetSave = /必须(进行|通过|成功)/.test(text)
  if (/豁免/.test(text) && !targetSave) {
    const abs = abilityIn(text)
    if (abs.length) for (const a of abs) f.add(`save:${a}`)
    else if (/所有豁免/.test(text) && /优势|劣势|加值/.test(text)) f.add('save:all')
  }
  // 「X 检定具有优势」→ 屬性檢定（不含豁免與攻擊檢定）
  if (/检定/.test(text) && /优势|劣势|加值/.test(text) && !/豁免/.test(text)) {
    for (const a of abilityIn(text.replace(/攻击检定/g, ''))) f.add(`check:${a}`)
  }
  for (const n of parseTags(raw)) {
    if (typeof n === 'string' || n.tag !== 'skill') continue
    const key = data ? normalizeSkill(data, n.args[0] ?? '') : undefined
    if (key) f.add(`skill:${key}`)
  }
  if (/\bAC\b|护甲等级/.test(text)) f.add('ac')
  if (/速度/.test(text)) f.add('speed')
  if (/先攻/.test(text)) f.add('initiative')
  if (/生命值上限|生命值最大值/.test(text)) f.add('hp')
  if (/抗性|免疫|易伤/.test(text)) f.add('defenses')
  if (/黑暗视觉|盲视|震颤感知|真实视觉/.test(text)) f.add('senses')
  if (/被动/.test(text) && /察觉|感知/.test(text)) f.add('passive')
  if (/攻击检定/.test(text) || /伤害/.test(text)) f.add('attacks')
  return [...f]
}

/** 角色所有特性中，會影響數值或擲骰的段落。 */
export function detectEffects(b: Pick<Build, 'features'>, data?: RulesData): Effect[] {
  const out: Effect[] = []
  for (const feature of b.features) {
    paragraphs(feature.entry.entries).forEach((p, i) => {
      const hits = detectHits(p.text)
      if (!hits.length) return
      out.push({
        key: `${feature.key}#${i}`,
        feature,
        title: p.heading && p.heading !== feature.entry.name ? `${feature.entry.name}：${p.heading}` : feature.entry.name,
        text: stripTags(p.text),
        raw: p.text,
        hits,
        fields: inferFields(p.text, data),
      })
    })
  }
  return out
}

/** 某個角卡欄位有哪些效果（例如 save:int 也會收到 save:all）。 */
export function effectsFor(effects: Effect[], field: string): Effect[] {
  const [kind] = field.split(':')
  return effects.filter((e) => e.fields.includes(field) || (kind === 'save' && e.fields.includes('save:all')))
}

/** 給測試與文件用：直接對單一條目做偵測。 */
export function detectEntry(e: Entry, data?: RulesData): Effect[] {
  const feature: Feature = { key: e.id, entry: e, category: 'feat', origin: { type: 'feat', name: e.name, level: 1 }, slotKeys: [] }
  return detectEffects({ features: [feature] }, data)
}

/** 效果欄位的顯示名稱（篩選按鈕用）。 */
export function effectFieldLabel(f: string): string {
  const [k = '', v = ''] = f.split(':')
  const ab = (ABILITIES as readonly string[]).includes(v) ? ABILITY_NAME[v as Ability].zh : v
  if (k === 'save') return v === 'all' ? '所有豁免' : `${ab}豁免`
  if (k === 'check') return `${ab}檢定`
  if (k === 'skill') return `技能：${v}`
  const LABEL: Record<string, string> = {
    ac: 'AC',
    speed: '速度',
    initiative: '先攻',
    hp: 'HP',
    defenses: '抗性與免疫',
    senses: '感官',
    passive: '被動感知',
    attacks: '攻擊與傷害',
  }
  return LABEL[k] ?? f
}
