/**
 * 角卡 → 試算表的表格資料（M3-2）。
 *
 * 這裡只「排版」規則引擎已經算好的結果（build、sheet、法術列、攻擊列、效果），
 * 不重新計算任何數值。輸出是純資料（工作表名稱、欄位、每列的值），
 * 由 xlsx.ts 交給 ExcelJS 寫檔；拆開是為了讓這一層不依賴 ExcelJS、也好測試。
 */
import { formatSource } from '@/data/sourceDisplay'
import { entriesToText } from '@/data/text'
import type { Entry, SourceInfo } from '@/data/types'
import { ABILITIES, ABILITY_NAME, formatMod } from '@/rules/abilities'
import { sizeLabel, type Build, type Feature } from '@/rules/build'
import type { Character, Currency } from '@/rules/character'
import type { RulesData } from '@/rules/data'
import type { Sheet } from '@/rules/derive'
import { effectFieldLabel, type Effect } from '@/rules/effects'
import { itemWeight, standardActions, type AttackRow } from '@/rules/equipment'
import type { SpellRow } from '@/rules/spells'
import { TRAIT_LABEL } from '@/rules/sheetExtras'

export type Cell = string | number

export interface Column {
  header: string
  /** 欄寬（字元數；中文字約佔 2） */
  width: number
  /** 長文字：自動換行 */
  wrap?: boolean
}

export interface SheetTable {
  name: string
  columns: Column[]
  rows: Cell[][]
}

/** 上游資料版本（build-data 輸出的 data/meta.js） */
export interface DataMeta {
  repo: string
  branch: string
  commit: string
  committedAt: string
  builtAt: string
}

export interface ExportInput {
  character: Character
  build: Build
  sheet: Sheet
  data: RulesData
  spells: SpellRow[]
  casting: { casting: { from: Entry }; ability: keyof typeof ABILITY_NAME; dc: number; attack: number }[]
  attacks: AttackRow[]
  effects: Effect[]
  /** 白名單內所有書（查書名用） */
  sources: SourceInfo[]
  filter: { groupLabel?: string; enabled: string[]; showLegacy: boolean; tceOptional: boolean }
  meta?: DataMeta
  appVersion: string
  exportedAt: Date
}

/** 備註欄：除了摘要和關於，每張表最右邊都有 */
const NOTE: Column = { header: '備註', width: 40, wrap: true }
const SOURCE: Column = { header: '來源', width: 26 }

const FEATURE_CAT: Record<Feature['category'], string> = {
  class: '職業',
  subclass: '子職',
  race: '種族',
  background: '背景',
  feat: '專長',
  optionalfeature: '可選特性',
}

function sourceText(sources: Map<string, SourceInfo>, e: Pick<Entry, 'source' | 'page'> | undefined): string {
  if (!e) return ''
  const book = sources.get(e.source)
  return `${formatSource(e.source, e.page)}${book ? `（${book.name}／${book.engName}）` : ''}`
}

/** 5etools 物品價值（cp）→ 文字 */
function valueText(cp: unknown): string {
  const v = Number(cp)
  if (!v) return ''
  if (v >= 100) return `${Math.round(v) / 100} gp`
  if (v >= 10) return `${v / 10} sp`
  return `${v} cp`
}

const SPEED: Record<string, string> = { fly: '飛行', swim: '游泳', climb: '攀爬', burrow: '掘穴' }
const SENSE: Record<string, string> = { darkvision: '黑暗視覺', blindsight: '盲視', tremorsense: '震顫感知', truesight: '真實視覺' }

const yes = (b: boolean | undefined) => (b ? '是' : '')

export function exportTables(x: ExportInput): SheetTable[] {
  const books = new Map(x.sources.map((s) => [s.source, s]))
  const src = (e?: Pick<Entry, 'source' | 'page'>) => sourceText(books, e)
  return [
    summarySheet(x),
    actionsSheet(x, src),
    spellsSheet(x, src),
    itemsSheet(x, src),
    featuresSheet(x, src),
    effectsSheet(x, src),
    backgroundSheet(x, src),
    aboutSheet(x),
  ]
}

function summarySheet({ character: c, build: b, sheet: s, casting }: ExportInput): SheetTable {
  const rows: Cell[][] = []
  const ov = (k: string) => {
    const o = s.overridden[k]
    return o ? `已手動覆寫（自動計算 ${o.computed}）` : ''
  }
  const add = (cat: string, item: string, value: Cell, mod: Cell = '', prof = '', note = '') =>
    rows.push([cat, item, value, mod, prof, note])

  const classLine = b.classes.map((i) => `${i.entry.name} ${i.level}${i.subclass ? `（${i.subclass.name}）` : ''}`).join('／')
  add('基本', '名稱', c.name || '（未命名）')
  add('基本', '種族', b.race ? `${b.race.name}${b.race.engName ? ` ${b.race.engName}` : ''}` : '')
  add('基本', '背景', b.background ? `${b.background.name}${b.background.engName ? ` ${b.background.engName}` : ''}` : '')
  add('基本', '職業與等級', classLine)
  add('基本', '總等級', s.level)
  if (b.size) add('基本', '體型', sizeLabel(b.size.value))

  const walk = s.speeds.find((v) => v.mode === 'walk')?.value ?? 30
  const otherSpeeds = s.speeds.filter((v) => v.mode !== 'walk').map((v) => `${SPEED[v.mode] ?? v.mode} ${v.value} 呎`)
  add('戰鬥', '護甲等級 AC', s.ac.value, '', '', [s.ac.parts.map((p) => `${p.label} ${p.value}`).join(' + '), ov('ac')].filter(Boolean).join('；'))
  add('戰鬥', 'HP 上限', s.hp.max, '', '', [`生命骰 ${s.hitDice.map((d) => `${d.count}d${d.die}`).join('+')}`, ov('hpMax')].filter(Boolean).join('；'))
  add('戰鬥', '速度（呎）', walk, '', '', [otherSpeeds.join('、'), ov('speed')].filter(Boolean).join('；'))
  add('戰鬥', '熟練加值', formatMod(s.profBonus), '', '', ov('profBonus'))
  add('戰鬥', '先攻', formatMod(s.initiative), '', '', ov('initiative'))
  add('感官', '被動感知', s.passive.perception, '', '', ov('passivePerception'))
  add('感官', '被動洞悉', s.passive.insight, '', '', ov('passiveInsight'))
  add('感官', '被動調查', s.passive.investigation, '', '', ov('passiveInvestigation'))
  for (const v of s.senses) add('感官', SENSE[v.type] ?? v.type, `${v.range} 呎`)
  for (const cst of casting) {
    add('施法', `${cst.casting.from.name}法術豁免 DC`, cst.dc, '', '', ABILITY_NAME[cst.ability].zh)
    add('施法', `${cst.casting.from.name}法術攻擊加值`, formatMod(cst.attack), '', '', ABILITY_NAME[cst.ability].zh)
  }

  for (const a of ABILITIES) {
    const ab = s.abilities[a]
    add('屬性', `${ABILITY_NAME[a].zh} ${ABILITY_NAME[a].abbr}`, ab.score, formatMod(ab.mod), '', ov(`ability:${a}`))
  }
  for (const a of ABILITIES) {
    const sv = s.saves[a]
    add('豁免', `${ABILITY_NAME[a].zh}豁免`, '', formatMod(sv.mod), sv.proficient ? '熟練' : '', ov(`save:${a}`))
  }
  for (const sk of s.skills) {
    add('技能', `${sk.name} ${sk.engName}`, '', formatMod(sk.mod), ['', '熟練', '專精'][sk.prof]!, [ABILITY_NAME[sk.ability].zh, ov(`skill:${sk.key}`)].filter(Boolean).join('；'))
  }

  const DEF: Record<string, string> = { resist: '抗性', immune: '免疫', vulnerable: '易傷', conditionImmune: '狀態免疫' }
  for (const d of b.defenses) add('防禦', DEF[d.type] ?? d.type, d.value, '', '', d.origin.name)
  add('熟練', '護甲', s.profs.armor.map((p) => p.label).join('、'))
  add('熟練', '武器', s.profs.weapon.map((p) => p.label).join('、'))
  add('熟練', '工具', s.profs.tool.map((p) => p.label).join('、'))
  add('熟練', '語言', s.profs.language.map((p) => (p.legacy ? `${p.label}【2014 版】` : p.label)).join('、'))

  return {
    name: '摘要',
    columns: [
      { header: '類別', width: 8 },
      { header: '項目', width: 26 },
      { header: '值', width: 34, wrap: true },
      { header: '調整值／加值', width: 12 },
      { header: '熟練', width: 8 },
      { header: '說明', width: 50, wrap: true },
    ],
    rows,
  }
}

type Src = (e?: Pick<Entry, 'source' | 'page'>) => string

function actionsSheet({ attacks, data }: ExportInput, src: Src): SheetTable {
  const rows: Cell[][] = attacks.map((r) => [
    r.name,
    r.engName ?? '',
    r.typeLabel,
    r.range,
    r.hitDc,
    r.damage,
    r.notes.join('、'),
    src(r.entry),
    '',
  ])
  for (const a of standardActions(data)) {
    rows.push([a.name, a.engName ?? '', '標準動作', '', '', '', entriesToText(a.entries), src(a), ''])
  }
  return {
    name: '動作',
    columns: [
      { header: '名稱', width: 18 },
      { header: '英文名', width: 18 },
      { header: '類型', width: 12 },
      { header: '射程', width: 14 },
      { header: '命中或 DC', width: 12 },
      { header: '傷害', width: 22, wrap: true },
      { header: '說明', width: 50, wrap: true },
      SOURCE,
      NOTE,
    ],
    rows,
  }
}

function spellsSheet({ spells }: ExportInput, src: Src): SheetTable {
  const rows: Cell[][] = [...spells]
    .sort((a, b) => a.level - b.level)
    .map((r) => [
      r.level === 0 ? '戲法' : `${r.level} 環`,
      r.spell.name,
      r.spell.engName ?? '',
      r.time,
      r.range,
      r.hitDc,
      r.damage ?? '',
      [
        r.concentration ? `專注 ${r.duration}` : r.duration,
        r.ritual ? '儀式' : '',
        r.components,
        r.material ? `材料：${r.material}` : '',
      ]
        .filter(Boolean)
        .join('；'),
      [r.sourceLabel, r.usesText].filter(Boolean).join('；'),
      r.bookOnly ? '只在法術書' : r.alwaysPrepared && r.level > 0 ? '永遠準備' : r.level > 0 ? '已準備' : '',
      entriesToText([r.spell.entries, r.spell.entriesHigherLevel]),
      src(r.spell),
      '',
    ])
  return {
    name: '法術',
    columns: [
      { header: '環位', width: 7 },
      { header: '名稱', width: 16 },
      { header: '英文名', width: 20 },
      { header: '施法時間', width: 12 },
      { header: '射程', width: 12 },
      { header: '命中或 DC', width: 12 },
      { header: '效果', width: 16 },
      { header: '專注／儀式／材料', width: 30, wrap: true },
      { header: '來源特性', width: 18, wrap: true },
      { header: '準備', width: 10 },
      { header: '內文', width: 60, wrap: true },
      SOURCE,
      NOTE,
    ],
    rows,
  }
}

function itemsSheet({ character: c, data }: ExportInput, src: Src): SheetTable {
  const rows: Cell[][] = c.inventory.map((i) => {
    const it = i.itemId ? data.get(i.itemId) : undefined
    return [
      i.name ?? it?.name ?? '（自訂物品）',
      it?.engName ?? '',
      i.qty,
      itemWeight(data, i) || '',
      i.container === 'equipment' ? '身上' : '背包',
      yes(i.equipped),
      it?.reqAttune ? (i.attuned ? '是' : '否（需同調）') : '',
      valueText(it?.value),
      src(it),
      '',
    ]
  })
  const COINS: [keyof Currency, string][] = [
    ['pp', '白金幣 PP'],
    ['gp', '金幣 GP'],
    ['ep', '琥珀金幣 EP'],
    ['sp', '銀幣 SP'],
    ['cp', '銅幣 CP'],
  ]
  for (const [k, label] of COINS) if (c.currency[k]) rows.push([label, '', c.currency[k], '', '', '', '', '', '', ''])
  return {
    name: '物品',
    columns: [
      { header: '名稱', width: 22 },
      { header: '英文名', width: 22 },
      { header: '數量', width: 6 },
      { header: '重量（磅）', width: 10 },
      { header: '位置', width: 6 },
      { header: '裝備', width: 6 },
      { header: '同調', width: 12 },
      { header: '價值', width: 10 },
      SOURCE,
      NOTE,
    ],
    rows,
  }
}

function featuresSheet({ build: b }: ExportInput, src: Src): SheetTable {
  const picked = (key: string) => {
    const s = b.slots.find((x) => x.key === key)
    if (!s) return ''
    const v = s.selected.filter(Boolean).map((sel) => s.options.find((o) => o.value === sel)?.label ?? sel)
    return `${s.label}：${v.length ? v.join('、') : '未選擇'}`
  }
  const rows: Cell[][] = b.features.map((f) => [
    f.entry.name,
    f.entry.engName ?? '',
    FEATURE_CAT[f.category],
    [f.origin.name, f.origin.compat ? '2024 相容' : '', f.entry.tceOptional ? 'TCE 可選規則' : ''].filter(Boolean).join('；'),
    f.origin.level,
    f.slotKeys.map(picked).join('\n'),
    entriesToText(f.entry.entries),
    src(f.entry),
    '',
  ])
  return {
    name: '特性與特質',
    columns: [
      { header: '名稱', width: 18 },
      { header: '英文名', width: 20 },
      { header: '類別', width: 8 },
      { header: '取自', width: 18, wrap: true },
      { header: '取得等級', width: 8 },
      { header: '選擇', width: 30, wrap: true },
      { header: '內文', width: 70, wrap: true },
      SOURCE,
      NOTE,
    ],
    rows,
  }
}

function effectsSheet({ effects, sheet }: ExportInput, src: Src): SheetTable {
  const label = (f: string) => {
    const sk = f.startsWith('skill:') ? sheet.skills.find((s) => s.key === f.slice(6)) : undefined
    return sk ? `技能：${sk.name}` : effectFieldLabel(f)
  }
  const rows: Cell[][] = effects.map((e) => [
    e.title,
    e.text,
    e.fields.map(label).join('、'),
    e.hits.join('、'),
    `${FEATURE_CAT[e.feature.category]}：${e.feature.origin.name}`,
    src(e.feature.entry),
    '',
  ])
  return {
    name: '效果',
    columns: [
      { header: '效果', width: 22 },
      { header: '段落', width: 70, wrap: true },
      { header: '推斷影響的欄位', width: 20, wrap: true },
      { header: '關鍵字', width: 20, wrap: true },
      { header: '取自', width: 20, wrap: true },
      SOURCE,
      NOTE,
    ],
    rows,
  }
}

function backgroundSheet({ character: c, build: b }: ExportInput, src: Src): SheetTable {
  const d = c.details
  const rows: Cell[][] = []
  const bg = b.background
  rows.push(['背景', bg ? `${bg.name}${bg.engName ? ` ${bg.engName}` : ''}` : '', src(bg), ''])
  const FIELDS: [string, string][] = [
    ['alignment', '陣營'],
    ['gender', '性別'],
    ['age', '年齡'],
    ['height', '身高'],
    ['weight', '體重'],
    ['eyes', '眼睛'],
    ['hair', '頭髮'],
    ['skin', '膚色'],
    ['faith', '信仰'],
    ['personality', TRAIT_LABEL.personality],
    ['ideals', TRAIT_LABEL.ideals],
    ['bonds', TRAIT_LABEL.bonds],
    ['flaws', TRAIT_LABEL.flaws],
    ['appearance', '外貌'],
  ]
  for (const [k, label] of FIELDS) rows.push([label, d[k] ?? '', '', ''])
  rows.push(['筆記', c.notes ?? '', '', ''])
  if (bg?.entries) rows.push(['背景內文', entriesToText(bg.entries), src(bg), ''])
  return {
    name: '背景',
    columns: [{ header: '項目', width: 12 }, { header: '內容', width: 70, wrap: true }, SOURCE, NOTE],
    rows,
  }
}

function aboutSheet({ meta, appVersion, exportedAt, filter, sources }: ExportInput): SheetTable {
  const books = new Map(sources.map((s) => [s.source, s]))
  const rows: Cell[][] = [
    ['匯出時間', exportedAt.toLocaleString('zh-TW', { hour12: false })],
    ['網站版本', appVersion],
    ['上游資料', meta ? `${meta.repo}（分支 ${meta.branch}）` : '（未知）'],
    ['上游資料 commit', meta?.commit ?? '（未知）'],
    ['上游 commit 時間', meta?.committedAt ?? ''],
    ['資料建置時間', meta?.builtAt ?? ''],
    ['書目群組', filter.groupLabel ?? '自訂'],
    ['顯示已被取代的舊版', filter.showLegacy ? '開' : '關'],
    ['TCE 可選規則', filter.tceOptional ? '開' : '關'],
    ['說明', '本檔是匯出當下的快照；之後修改角色需要重新匯出。'],
  ]
  for (const code of filter.enabled) {
    const s = books.get(code)
    rows.push(['啟用書目', s ? `${code}｜${s.name}｜${s.engName}` : code])
  }
  return {
    name: '關於',
    columns: [
      { header: '項目', width: 20 },
      { header: '內容', width: 80, wrap: true },
    ],
    rows,
  }
}

/** 檔名：<角色名>_Lv<總等級>_<YYYY-MM-DD>.xlsx；不合法字元換成底線 */
export function exportFileName(name: string, level: number, date: Date): string {
  const safe = [...(name.trim() || '未命名')]
    .map((ch) => (ch.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(ch) ? '_' : ch))
    .join('')
    .replace(/[. ]+$/, '')
  const pad = (n: number) => String(n).padStart(2, '0')
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  return `${safe || '未命名'}_Lv${level}_${day}.xlsx`
}
