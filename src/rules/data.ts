/**
 * 規則引擎讀資料的介面。
 *
 * 規則引擎是純 TS、不依賴 Vue／Pinia：它只透過 RulesData 這個介面拿資料，
 * app 裡由 catalog＋sourceFilter store 實作（src/composables/useRulesData.ts），
 * 測試裡則直接讀 public/data/*.js 或手寫的小 fixture。
 */
import type { EntryKind } from '../data/ids.ts'
import type { Entry, SpellClassRef } from '../data/types.ts'
import { ABILITY_NAME, isAbility } from './abilities.ts'

export interface RulesData {
  /** 用 id 查條目（不分大小寫；版本條目也查得到） */
  get(id: string): Entry | undefined
  list(kind: EntryKind): Entry[]
  /** 目前書目設定下是否可選（含「隱藏被重印取代的版本」） */
  visible(e: Entry): boolean
  /**
   * 不看重印規則的可選性（書目已啟用、TCE 開關）。選擇欄位用它列出選項，被取代的舊版也放進去，
   * 由畫面決定要不要顯示（全域開關、單一選單暫時顯示、已選的舊版要留著並警示）。省略時等於 visible。
   */
  selectable?(e: Entry): boolean
  /** 取代這筆條目的重印版（第一個來源已啟用的）；沒被取代回傳 undefined。 */
  supersededBy?(e: Entry): Entry | undefined
  /** TCE 可選規則開關 */
  tceOptional: boolean
  /** 某本書目前是否啟用 */
  sourceEnabled(source: string): boolean
}

/** 選項清單用的可選性（見 RulesData.selectable）。 */
export const canPick = (data: RulesData, e: Entry): boolean => (data.selectable ? data.selectable(e) : data.visible(e))

/**
 * 「名稱|來源」參照 → 條目 id。來源省略時用 defaultSource（5etools 慣例是 PHB）。
 * 法術參照常帶 `#c`（戲法）之類的尾巴，一併去掉。
 */
export function refToId(kind: EntryKind, ref: string, defaultSource = 'PHB'): string {
  const [name = '', source = ''] = ref.split('#')[0]!.split('|')
  return `${kind}|${name.trim()}|${source.trim() || defaultSource}`
}

export function lookupRef(data: RulesData, kind: EntryKind, ref: string, defaultSource = 'PHB'): Entry | undefined {
  return data.get(refToId(kind, ref, defaultSource))
}

/**
 * 同一個 RulesData 物件上的查表結果快取（技能、工具、語言清單會被每個選項重複查詢）。
 * RulesData 在書目或資料變動時會整個換新，WeakMap 讓舊的快取自動被回收。
 */
const memo = new WeakMap<RulesData, Map<string, unknown>>()
function cached<T>(data: RulesData, key: string, make: () => T): T {
  let m = memo.get(data)
  if (!m) memo.set(data, (m = new Map()))
  if (!m.has(key)) m.set(key, make())
  return m.get(key) as T
}

// ---------------------------------------------------------------------------
// 技能、工具、語言：資料裡的寫法很雜（英文小寫鍵、簡體中文名、分類代碼），
// 統一轉成「英文小寫鍵」存檔，顯示時再查回中文。
// ---------------------------------------------------------------------------

/** 2024 版的技能（skills.json 有 PHB 與 XPHB 兩份，內容相同，取 XPHB）。 */
export function skillEntries(data: RulesData): Entry[] {
  const all = data.list('skill')
  const x = all.filter((s) => s.source === 'XPHB')
  return x.length ? x : all
}

export interface SkillInfo {
  key: string
  name: string
  engName: string
  ability: string
  entry?: Entry
}

export function skillList(data: RulesData): SkillInfo[] {
  return cached(data, 'skills', () => makeSkillList(data))
}

function makeSkillList(data: RulesData): SkillInfo[] {
  return skillEntries(data)
    .map((s) => ({
      key: (s.engName ?? s.name).toLowerCase(),
      name: s.name,
      engName: s.engName ?? '',
      ability: String(s.ability),
      entry: s,
    }))
    .sort((a, b) => a.engName.localeCompare(b.engName))
}

/** 技能的英文鍵或中文名 → 英文小寫鍵；不認得就回傳 undefined。 */
export function normalizeSkill(data: RulesData, s: string): string | undefined {
  const low = s.toLowerCase()
  for (const sk of skillList(data)) if (sk.key === low || sk.name === s) return sk.key
  return undefined
}

/** 語言：英文小寫鍵 → 條目（取 XPHB 優先）。 */
export function languageList(data: RulesData): Entry[] {
  return cached(data, 'languages', () => makeLanguageList(data))
}

function makeLanguageList(data: RulesData): Entry[] {
  const byKey = new Map<string, Entry>()
  for (const l of data.list('language')) {
    const key = (l.engName ?? l.name).toLowerCase()
    const prev = byKey.get(key)
    if (!prev || (l.source === 'XPHB' && prev.source !== 'XPHB')) byKey.set(key, l)
  }
  return [...byKey.values()].filter((l) => data.visible(l) || l.source === 'XPHB')
}

export const languageKey = (l: Entry) => (l.engName ?? l.name).toLowerCase()

/** 工具類物品的分類代碼（物品 type 的前段）。 */
export const TOOL_TYPES: Record<string, string> = {
  AT: '工匠工具',
  INS: '乐器',
  GS: '游戏套组',
  T: '工具',
}

/** 所有工具（2024 版優先），鍵為英文小寫名。 */
export function toolList(data: RulesData): Entry[] {
  return cached(data, 'tools', () => makeToolList(data))
}

function makeToolList(data: RulesData): Entry[] {
  const byKey = new Map<string, Entry>()
  for (const it of data.list('item')) {
    const type = String(it.type ?? '').split('|')[0]!
    if (!(type in TOOL_TYPES) || !it.engName || it.isItemGroup) continue
    const key = it.engName.toLowerCase()
    const prev = byKey.get(key)
    if (!prev || (it.edition === '2024' && prev.edition !== '2024')) byKey.set(key, it)
  }
  return [...byKey.values()].filter((t) => data.visible(t) || t.edition === '2024')
}

export const toolType = (it: Entry) => String(it.type ?? '').split('|')[0]!

// ---------------------------------------------------------------------------
// 顯示用標籤：中文（英文）
// ---------------------------------------------------------------------------

const WEAPON_LABEL: Record<string, string> = {
  simple: '简易武器 (Simple Weapons)',
  martial: '军用武器 (Martial Weapons)',
  firearms: '火器 (Firearms)',
  improvised: '临时武器 (Improvised Weapons)',
  简易: '简易武器 (Simple Weapons)',
  军用: '军用武器 (Martial Weapons)',
}
const ARMOR_LABEL: Record<string, string> = {
  light: '轻甲 (Light Armor)',
  medium: '中甲 (Medium Armor)',
  heavy: '重甲 (Heavy Armor)',
  shield: '盾牌 (Shields)',
}

export type ProfType = 'skill' | 'tool' | 'language' | 'weapon' | 'armor' | 'save' | 'expertise'

const withEng = (name: string, eng?: string) => (eng && eng !== name ? `${name} (${eng})` : name)

export function profLabel(data: RulesData, type: ProfType, key: string): string {
  switch (type) {
    case 'skill':
    case 'expertise': {
      const s = skillList(data).find((x) => x.key === key)
      return s ? withEng(s.name, s.engName) : key
    }
    case 'save':
      return isAbility(key) ? `${ABILITY_NAME[key].zh} (${ABILITY_NAME[key].en})` : key
    case 'language': {
      const l = languageList(data).find((x) => languageKey(x) === key)
      return l ? withEng(l.name, l.engName) : key
    }
    case 'tool': {
      const t = toolList(data).find((x) => x.engName?.toLowerCase() === key)
      return t ? withEng(t.name, t.engName) : key
    }
    case 'weapon': {
      if (WEAPON_LABEL[key]) return WEAPON_LABEL[key]
      const it = key.includes('|') ? lookupRef(data, 'item', key) : undefined
      return it ? withEng(it.name, it.engName) : key
    }
    case 'armor':
      return ARMOR_LABEL[key] ?? key
  }
}

// ---------------------------------------------------------------------------
// 法術篩選字串：「level=0|class=牧师」「level=1;2|school=V|class=法师」
// ---------------------------------------------------------------------------

export interface SpellFilter {
  levels?: number[]
  classes?: string[]
  schools?: string[]
}

export function parseSpellFilter(s: string): SpellFilter {
  const f: SpellFilter = {}
  for (const part of s.split('|')) {
    const [k = '', v = ''] = part.split('=')
    const vals = v.split(';').filter(Boolean)
    if (k === 'level') f.levels = vals.map(Number)
    else if (k === 'class') f.classes = vals
    else if (k === 'school') f.schools = vals.map((x) => x.toUpperCase())
  }
  return f
}

/** 法術是否在某職業（中文名）的清單上；擴充法術表依書目與 TCE 開關判斷。 */
export function spellOnClassList(data: RulesData, sp: Entry, className: string): boolean {
  return ((sp.classes as SpellClassRef[] | undefined) ?? []).some(
    (c) => c.className === className && (!c.tceOptional || data.tceOptional) && (!c.definedIn || c.definedIn.some((src) => data.sourceEnabled(src))),
  )
}

export function matchSpellFilter(data: RulesData, sp: Entry, f: SpellFilter): boolean {
  if (f.levels && !f.levels.includes(Number(sp.level))) return false
  if (f.schools && !f.schools.includes(String(sp.school))) return false
  if (f.classes && !f.classes.some((c) => spellOnClassList(data, sp, c))) return false
  return true
}

/** 依篩選字串列出目前可選的法術。 */
export function spellsByFilter(data: RulesData, filter: string): Entry[] {
  return cached(data, `spells:${filter}`, () => makeSpellsByFilter(data, filter))
}

function makeSpellsByFilter(data: RulesData, filter: string): Entry[] {
  const f = parseSpellFilter(filter)
  return data.list('spell').filter((sp) => canPick(data, sp) && matchSpellFilter(data, sp, f))
}
