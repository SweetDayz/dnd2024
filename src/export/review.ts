/**
 * 審卡報告的資料模型（M6-1）。
 *
 * 和 sheetData.ts 一樣：只「整理」規則引擎已經算好的結果（build、sheet、法術列、效果、abilityBreakdown），
 * 不重新計算任何數值。輸出是純資料，由 reviewHtml.ts 排成 HTML；拆開是為了讓兩層都能在 Vitest 直接測。
 *
 * 所有文字在這一層就先把 `{@tag}` 轉成純文字（plain），渲染層只負責 HTML escape。
 */
import { stripTags } from '@/data/tags'
import { formatSource, sourceAbbr, sourceTooltip } from '@/data/sourceDisplay'
import type { Entry, SourceInfo } from '@/data/types'
import { ABILITIES, ABILITY_NAME, formatMod } from '@/rules/abilities'
import { METHOD_LABEL, abilityBreakdown, originText } from '@/rules/abilityBreakdown'
import type { ChoiceSlot, Origin } from '@/rules/build'
import { exportCharacter, type RollRecord } from '@/rules/character'
import { effectFieldLabel } from '@/rules/effects'
import { spellDcAttack } from '@/rules/spells'
import { dateStamp, safeFileName, type ExportInput } from './sheetData'

/** 來源徽章：文字（例如 PHB24 p.165）與 tooltip（書名） */
export interface Badge {
  text: string
  title: string
}

/** 一個列出的項目：文字、來源徽章、附註 */
export interface Item {
  text: string
  src?: Badge
  note?: string
}

export type WarningKind = '手動覆寫' | '未完成的選擇' | '失效的選擇' | '超過載重' | '稀有語言' | 'TCE 可選規則' | '重印舊版' | '2014 相容規則' | '屬性值'

export interface ReviewWarning {
  kind: WarningKind
  text: string
  src?: Badge
}

export interface RollLine {
  label: string
  dice: string
  total: number
  at: string
  /** 同一個擲骰項目的最後一次（採用的那次） */
  used: boolean
}

export interface AbilityRow {
  name: string
  base: string
  bonuses: Item[]
  score: number
  mod: string
  note: string
}

export interface LevelRow {
  level: number
  className: string
  features: Item[]
  choices: { label: string; values: Item[]; done: boolean }[]
  hp: string
  hpRolls: RollLine[]
}

export interface SpellGroup {
  label: string
  ability: string
  dc: string
  attack: string
  rows: { level: string; name: string; src: Badge; note: string }[]
}

export interface ReviewModel {
  /** 頁面標題 */
  title: string
  name: string
  fileName: string
  exportedAt: string
  warnings: ReviewWarning[]
  summary: [string, string][]
  books: { abbr: string; code: string; name: string; engName: string }[]
  settings: [string, string][]
  abilities: { method: string; pool: string; rolls: RollLine[]; rows: AbilityRow[]; notes: string[] }
  levels: LevelRow[]
  profs: { category: string; items: Item[] }[]
  spells: SpellGroup[]
  equipment: { picks: Item[]; goldRolls: RollLine[]; items: Item[]; currency: string }
  effects: { title: string; text: string; origin: string; fields: string; src: Badge }[]
  /** 角色存檔 JSON（嵌入 HTML，讓網站的「匯入」可以直接吃審卡報告） */
  characterJson: string
}

/** 去掉 {@tag}，只留顯示文字 */
const plain = (s: unknown) => stripTags(String(s ?? ''))

const nameWithEng = (e: Pick<Entry, 'name' | 'engName'> | undefined) =>
  e ? plain(e.engName && !e.name.includes(e.engName) ? `${e.name} ${e.engName}` : e.name) : ''

const OVERRIDE_LABEL: Record<string, string> = {
  profBonus: '熟練加值',
  initiative: '先攻',
  passivePerception: '被動感知',
  passiveInsight: '被動洞悉',
  passiveInvestigation: '被動調查',
  hpMax: 'HP 上限',
  ac: 'AC',
  speed: '速度',
}

const COINS = [
  ['pp', 'PP'],
  ['gp', 'GP'],
  ['ep', 'EP'],
  ['sp', 'SP'],
  ['cp', 'CP'],
] as const

const SLOT_LEVEL_TYPES = new Set(['ability', 'abilityWeighted'])

export function reviewFileName(name: string, level: number, date: Date): string {
  return `${safeFileName(name)}_Lv${level}_審卡_${dateStamp(date)}.html`
}

export function buildReviewModel(x: ExportInput): ReviewModel {
  const { character: c, build: b, sheet: s } = x
  const books = new Map(x.sources.map((v) => [v.source, v]))
  const badge = (e?: Pick<Entry, 'source' | 'page'>): Badge | undefined =>
    e ? { text: formatSource(e.source, e.page), title: sourceTooltip(e.source, books.get(e.source), e.page) } : undefined
  const originBadge = (o: Origin) => badge(o.entry)
  const name = plain(c.name.trim() || '（未命名）')

  // ---- 選擇欄位的已選值（逐級表、裝備、TCE 警示共用）
  const slotValues = (slot: ChoiceSlot): Item[] =>
    slot.selected.flatMap((v, i) => {
      if (!v) return []
      const o = slot.options.find((op) => op.value === v)
      const w = SLOT_LEVEL_TYPES.has(slot.type) ? slot.weights?.[slot.type === 'abilityWeighted' ? i : 0] : undefined
      return [
        {
          text: `${w ? `+${w} ` : ''}${plain(o?.label ?? v)}`,
          src: badge(o?.entry),
          note: o?.entry?.tceOptional ? 'TCE 可選規則' : o?.note ? plain(o.note) : undefined,
        },
      ]
    })

  // ---- 擲骰紀錄：同一個 label 的最後一次是採用的那次
  const rollLines = (kind: string, match: (r: RollRecord) => boolean = () => true): RollLine[] => {
    const list = c.rollLog.filter((r) => r.kind === kind && match(r))
    return list.map((r, i) => ({
      label: plain(r.label),
      dice: r.dice.join('、'),
      total: r.total,
      at: r.at,
      used: !list.slice(i + 1).some((n) => n.label === r.label),
    }))
  }

  // ---- 警示區
  const warnings: ReviewWarning[] = []
  const warn = (w: ReviewWarning) => {
    if (!warnings.some((o) => o.kind === w.kind && o.text === w.text)) warnings.push(w)
  }
  for (const [key, o] of Object.entries(s.overridden)) {
    const [k, v = ''] = key.split(':')
    const label =
      k === 'ability' ? `${ABILITY_NAME[v as keyof typeof ABILITY_NAME]?.zh ?? v}屬性值`
      : k === 'save' ? `${ABILITY_NAME[v as keyof typeof ABILITY_NAME]?.zh ?? v}豁免`
      : k === 'skill' ? `技能：${s.skills.find((sk) => sk.key === v)?.name ?? v}`
      : (OVERRIDE_LABEL[key] ?? key)
    warn({ kind: '手動覆寫', text: `${label}：自動計算 ${o.computed}，手動改為 ${o.value}` })
  }
  for (const slot of b.slots) {
    if (slot.done) continue
    const n = slot.selected.filter(Boolean).length
    warn({
      kind: '未完成的選擇',
      text: `${slot.origin.level} 級・${originText(slot.origin)}・${plain(slot.label)}（已選 ${n}／${slot.count}）`,
      src: originBadge(slot.origin),
    })
  }
  for (const slot of b.slots) {
    if (!slot.stale) continue
    warn({
      kind: '失效的選擇',
      text: `${originText(slot.origin)}・${plain(slot.label)}：存檔中的「${slot.stale.join('、')}」目前不是合法選項，已視為未選擇`,
      src: originBadge(slot.origin),
    })
  }
  // 一般語言選擇裡選了稀有（或其他）語言：2024 規則要 DM 同意
  for (const slot of b.slots) {
    if (slot.type !== 'language' || !slot.restrictedToggle) continue
    for (const v of slot.selected) {
      const o = slot.options.find((x) => x.value === v)
      if (o?.restricted) warn({ kind: '稀有語言', text: `${plain(o.label)}（${o.group ?? '稀有'}）：一般語言選擇預設只能選標準語言，需 DM 同意`, src: badge(o.entry) })
    }
  }
  const tce = (e: Entry | undefined, where: string) => {
    if (e?.tceOptional) warn({ kind: 'TCE 可選規則', text: `${nameWithEng(e)}（${where}）`, src: badge(e) })
  }
  tce(b.race, '種族')
  tce(b.background, '背景')
  for (const f of b.features) tce(f.entry, originText(f.origin))
  for (const slot of b.slots) {
    for (const v of slot.selected) tce(slot.options.find((o) => o.value === v)?.entry, `${originText(slot.origin)}・${plain(slot.label)}`)
  }
  for (const p of b.legacyPicks) {
    warn({
      kind: '重印舊版',
      text: `${nameWithEng(p.entry)} ${formatSource(p.entry.source, p.entry.page)} 已有新版：${nameWithEng(p.newer)} ${formatSource(p.newer.source, p.newer.page)}`,
      src: badge(p.entry),
    })
  }
  const compatOrigins = [...b.features.map((f) => f.origin), ...b.slots.map((v) => v.origin), ...b.profs.map((p) => p.origin)]
  for (const o of compatOrigins) {
    if (o.compat) warn({ kind: '2014 相容規則', text: `${originText(o)}：2014 版條目，依 2024 PHB 相容規則處理`, src: originBadge(o) })
  }
  const enc = s.encumbrance
  if (enc.over) {
    warn({
      kind: '超過載重',
      text: `總重 ${enc.total} 磅（物品 ${enc.carried}＋錢幣 ${enc.coins}）超過載重 ${enc.capacity} 磅${enc.overDragLift ? `，也超過拖拽／抬起／推動上限 ${enc.dragLift} 磅` : ''}；依 XPHB「载重」速度至多 5 呎`,
      src: badge({ source: 'XPHB', page: 362 }),
    })
  }
  const breakdown = abilityBreakdown(c, b)
  for (const w of breakdown.warnings) warn({ kind: '屬性值', text: w })
  for (const a of ABILITIES) {
    for (const w of breakdown.abilities[a].warnings) {
      if (!w.startsWith('已手動覆寫')) warn({ kind: '屬性值', text: `${ABILITY_NAME[a].zh}：${w}` })
    }
  }

  // ---- 摘要
  const ov = (k: string, v: string) => (s.overridden[k] ? `${v}（手動覆寫）` : v)
  const walk = s.speeds.find((v) => v.mode === 'walk')?.value ?? 30
  const classLine = b.classes
    .map((i) => `${nameWithEng(i.entry)} ${i.level} 級${i.subclass ? `（${nameWithEng(i.subclass)}）` : ''}`)
    .join('／')
  const summary: [string, string][] = [
    ['名稱', name],
    ['種族', b.race ? `${nameWithEng(b.race)}　${formatSource(b.race.source, b.race.page)}` : '（未選）'],
    ['背景', b.background ? `${nameWithEng(b.background)}　${formatSource(b.background.source, b.background.page)}` : '（未選）'],
    ['職業與等級', classLine || '（未選）'],
    ['總等級', String(s.level)],
    ['AC', ov('ac', String(s.ac.value))],
    ['HP 上限', ov('hpMax', String(s.hp.max))],
    ['速度', ov('speed', `${walk} 呎`)],
    ['熟練加值', ov('profBonus', formatMod(s.profBonus))],
    ['先攻', ov('initiative', formatMod(s.initiative))],
    ['被動感知', ov('passivePerception', String(s.passive.perception))],
  ]
  for (const cst of x.casting) {
    summary.push([`${plain(cst.casting.from.name)}法術 DC／攻擊`, `${cst.dc}／${formatMod(cst.attack)}（${ABILITY_NAME[cst.ability].zh}）`])
  }

  // ---- 書目與設定
  const bookRows = x.filter.enabled.map((code) => {
    const info: SourceInfo | undefined = books.get(code)
    return { abbr: sourceAbbr(code), code, name: info?.name ?? '', engName: info?.engName ?? '' }
  })
  const meta = x.meta
  const settings: [string, string][] = [
    ['書目群組', x.filter.groupLabel ?? '自訂'],
    ['TCE 可選規則', x.filter.tceOptional ? '開' : '關'],
    ['顯示已被重印取代的版本', x.filter.showLegacy ? '開' : '關'],
    ['上游資料', meta ? `${meta.repo}（分支 ${meta.branch}）` : '（未知）'],
    ['上游資料 commit', meta?.commit ?? '（未知）'],
    ['網站版本', x.appVersion],
    ['匯出時間', x.exportedAt.toLocaleString('zh-TW', { hour12: false })],
  ]

  // ---- 屬性值明細
  const abilityRows: AbilityRow[] = ABILITIES.map((a) => {
    const line = breakdown.abilities[a]
    return {
      name: `${ABILITY_NAME[a].zh} ${ABILITY_NAME[a].abbr}`,
      base: line.base === null ? '—' : String(line.base),
      bonuses: line.bonuses.map((v) => ({
        text: `+${v.applied}${v.applied < v.amount ? `（原 +${v.amount}）` : ''} ${v.source}`,
        src: originBadge(v.origin),
      })),
      score: line.score,
      mod: formatMod(line.mod),
      note: line.override !== undefined ? `手動覆寫（自動計算 ${line.computed}）` : '',
    }
  })

  // ---- 逐級選擇表
  const classSeen = new Map<string, number>()
  const levels: LevelRow[] = c.levels.map((lv, i) => {
    const level = i + 1
    const n = (classSeen.get(lv.classId) ?? 0) + 1
    classSeen.set(lv.classId, n)
    const hp = s.hp.levels[i]
    const hpText = !hp
      ? ''
      : `d${hp.die} ${hp.mode === 'max' ? '最大值' : hp.mode === 'average' ? '取平均' : '擲骰'} ${hp.value}${formatMod(s.hp.conMod)}（體質）`
    return {
      level,
      className: `${nameWithEng(x.data.get(lv.classId)) || lv.classId} ${n} 級`,
      features: b.features
        .filter((f) => f.origin.level === level)
        .map((f) => ({
          text: plain(f.entry.name),
          src: badge(f.entry),
          // 職業與子職特性看「職業」欄就知道來源；種族、背景、專長才另外標示
          note: f.category === 'class' ? undefined : originText(f.origin),
        })),
      choices: b.slots
        .filter((v) => v.origin.level === level)
        .map((v) => ({ label: `${originText(v.origin)}・${plain(v.label)}`, values: slotValues(v), done: v.done })),
      hp: hpText,
      hpRolls: rollLines('hp', (r) => r.label.startsWith(`第 ${level} 級`)),
    }
  })

  // ---- 熟練、專精與語言
  const srcItems = (label: string, origins: Origin[], note?: string): Item => ({
    text: plain(label),
    src: origins.map(originBadge).find(Boolean),
    note: [note, origins.map(originText).join('、')].filter(Boolean).join('；'),
  })
  const profs = [
    {
      category: '豁免',
      items: ABILITIES.filter((a) => s.saves[a].proficient).map((a) => srcItems(`${ABILITY_NAME[a].zh}豁免`, s.saves[a].sources)),
    },
    {
      category: '技能',
      items: s.skills
        .filter((sk) => sk.prof > 0)
        .map((sk) =>
          srcItems(`${sk.name} ${sk.engName}`, sk.prof === 2 ? [...sk.profSources, ...sk.expertiseSources] : sk.profSources, sk.prof === 2 ? '專精' : '熟練'),
        ),
    },
    { category: '護甲', items: s.profs.armor.map((p) => srcItems(p.label, p.sources)) },
    { category: '武器', items: s.profs.weapon.map((p) => srcItems(p.label, p.sources)) },
    { category: '工具', items: s.profs.tool.map((p) => srcItems(p.label, p.sources)) },
    { category: '語言', items: s.profs.language.map((p) => srcItems(p.label, p.sources, p.legacy ? '2014 版' : undefined)) },
  ]

  // ---- 法術：依來源分組
  const groups = new Map<string, SpellGroup>()
  for (const r of x.spells) {
    let g = groups.get(r.sourceLabel)
    if (!g) {
      const cst = x.casting.find((v) => plain(v.casting.from.name) === r.sourceLabel)
      const ability = cst?.ability ?? r.ability
      const st = cst ?? (ability ? spellDcAttack(s.abilities[ability].mod, s.profBonus) : undefined)
      g = {
        label: plain(r.sourceLabel),
        ability: ability ? ABILITY_NAME[ability].zh : '—',
        dc: st ? String(st.dc) : '—',
        attack: st ? formatMod(st.attack) : '—',
        rows: [],
      }
      groups.set(r.sourceLabel, g)
    }
    g.rows.push({
      level: r.level === 0 ? '戲法' : `${r.level} 環`,
      name: nameWithEng(r.spell),
      src: badge(r.spell)!,
      note: [
        r.bookOnly ? '只在法術書' : r.alwaysPrepared && r.level > 0 ? '永遠準備' : r.level > 0 ? '已準備' : '',
        r.usesText ?? '',
        r.ritual ? '儀式' : '',
        r.concentration ? '專注' : '',
        r.hitDc !== '—' ? plain(r.hitDc) : '',
      ]
        .filter(Boolean)
        .join('；'),
    })
  }

  // ---- 裝備與起始金額
  const equipSlots = b.slots.filter((v) => v.type === 'equipment')
  const equipment = {
    picks: equipSlots.map((v) => ({
      text: `${plain(v.label)}：${slotValues(v).map((i) => i.text).join('、') || '未選擇'}`,
      src: originBadge(v.origin),
    })),
    goldRolls: rollLines('gold'),
    items: c.inventory.map((i) => {
      const it = i.itemId ? x.data.get(i.itemId) : undefined
      return {
        text: `${plain(i.name ?? it?.name ?? '（自訂物品）')}${it?.engName ? ` ${it.engName}` : ''}${i.qty !== 1 ? ` ×${i.qty}` : ''}`,
        src: badge(it),
        note: [i.equipped ? '裝備中' : '', i.attuned ? '已同調' : '', i.itemId ? '' : '自訂'].filter(Boolean).join('、'),
      }
    }),
    currency: COINS.filter(([k]) => c.currency[k]).map(([k, l]) => `${c.currency[k]} ${l}`).join('、') || '無',
  }

  // ---- 效果清單
  const effects = x.effects.map((e) => ({
    title: plain(e.title),
    text: plain(e.text),
    origin: originText(e.feature.origin),
    fields: e.fields
      .map((f) => (f.startsWith('skill:') ? `技能：${s.skills.find((sk) => sk.key === f.slice(6))?.name ?? f.slice(6)}` : effectFieldLabel(f)))
      .join('、'),
    src: badge(e.feature.entry)!,
  }))

  return {
    title: `${name}・審卡報告`,
    name,
    fileName: reviewFileName(c.name, s.level, x.exportedAt),
    exportedAt: x.exportedAt.toLocaleString('zh-TW', { hour12: false }),
    warnings,
    summary,
    books: bookRows,
    settings,
    abilities: {
      method: METHOD_LABEL[c.abilityMethod],
      pool: c.abilityMethod === 'roll' && c.rolledPool.length ? c.rolledPool.join('、') : '',
      rolls: c.abilityMethod === 'roll' ? rollLines('ability') : [],
      rows: abilityRows,
      notes: breakdown.pending.map((p) => `尚未分配：${originText(p.origin)}・${plain(p.label)}${p.amount ? `（+${p.amount}）` : ''}`),
    },
    levels,
    profs,
    spells: [...groups.values()],
    equipment,
    effects,
    characterJson: exportCharacter(c),
  }
}
