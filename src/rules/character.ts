/**
 * 角色資料模型：**只存玩家的選擇**，所有衍生數值（調整值、AC、HP、法術 DC…）都由規則引擎即時計算。
 *
 * 為什麼這樣設計？
 *   - 書目或資料更新後，同一份存檔重新計算就會得到新結果，不會有「存檔裡的舊數字」。
 *   - 存檔小、容易匯出匯入、容易比對「匯出再匯入是否完全相同」。
 *
 * 選擇大部分放在 `choices`：鍵是規則引擎產生的「選擇欄位」key（見 build.ts），值是選到的值陣列。
 */
import { ABILITIES, type Ability } from './abilities.ts'

export const SCHEMA_VERSION = 1

export type AbilityMethod = 'roll' | 'standard' | 'pointbuy'

/** 一次擲骰的紀錄（重骰時新增一筆，舊的保留）。 */
export interface RollRecord {
  /** 擲什麼：ability、hp、gold、height、weight、table… */
  kind: string
  /** 顯示用說明，例如「第 3 級 HP（d6）」 */
  label: string
  dice: number[]
  total: number
  /** ISO 時間 */
  at: string
}

/** 每升一級的 HP 取法：平均值，或擲骰（roll 為採用的那次結果）。 */
export interface HpChoice {
  mode: 'average' | 'roll'
  roll?: number
}

export interface LevelEntry {
  /** 這一級升的職業 id */
  classId: string
  hp: HpChoice
}

export interface InventoryItem {
  /** 物品欄內的唯一鍵 */
  uid: string
  /** 物品 id；自訂物品為空字串 */
  itemId: string
  /** 自訂名稱（例如「祈禱書」）或自訂物品名稱 */
  name?: string
  qty: number
  equipped: boolean
  /** 放在哪裡：身上或背包 */
  container: 'equipment' | 'backpack'
  /** 已同調（只對需要同調的魔法物品有意義；舊存檔沒有這個欄位，視為 false） */
  attuned?: boolean
  /** 'start'：由「套用起始裝備」產生（重新套用時會被取代） */
  from?: string
}

export interface Currency {
  cp: number
  sp: number
  ep: number
  gp: number
  pp: number
}

export interface Character {
  schemaVersion: number
  id: string
  name: string
  raceId: string | null
  backgroundId: string | null
  /** 第 i 筆 = 角色第 i+1 級；第 1 筆的職業就是起始職業 */
  levels: LevelEntry[]
  abilityMethod: AbilityMethod
  /** 分配好的基礎屬性值（尚未加上背景與專長） */
  baseScores: Record<Ability, number | null>
  /** 4d6 去最低擲出的六個數字（玩家再分配到屬性上） */
  rolledPool: number[]
  /** 選擇欄位 key → 選到的值 */
  choices: Record<string, string[]>
  inventory: InventoryItem[]
  currency: Currency
  /** 手動覆寫：欄位 key → 數值（例如 ac、hpMax、skill:stealth） */
  overrides: Record<string, number>
  /** 角色特徵：陣營、性別、眼睛、身高、體重、個性特質… */
  details: Record<string, string>
  notes: string
  rollLog: RollRecord[]
  createdAt: string
  updatedAt: string
}

export function emptyScores(): Record<Ability, number | null> {
  return Object.fromEntries(ABILITIES.map((a) => [a, null])) as Record<Ability, number | null>
}

let counter = 0
export function newId(prefix = 'c'): string {
  counter = (counter + 1) % 1e6
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

export function newCharacter(now = new Date().toISOString()): Character {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: newId(),
    name: '',
    raceId: null,
    backgroundId: null,
    levels: [],
    abilityMethod: 'standard',
    baseScores: emptyScores(),
    rolledPool: [],
    choices: {},
    inventory: [],
    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    overrides: {},
    details: {},
    notes: '',
    rollLog: [],
    createdAt: now,
    updatedAt: now,
  }
}

/** 各職業的等級：classId → 等級（依第一次取得的順序）。 */
export function classLevels(c: Pick<Character, 'levels'>): Map<string, number> {
  const m = new Map<string, number>()
  for (const l of c.levels) m.set(l.classId, (m.get(l.classId) ?? 0) + 1)
  return m
}

export const totalLevel = (c: Pick<Character, 'levels'>) => c.levels.length

// ---------------------------------------------------------------------------
// 匯出匯入
// ---------------------------------------------------------------------------

export interface ExportFile {
  format: 'dnd2024-character'
  schemaVersion: number
  character: Character
}

export function exportCharacter(c: Character): string {
  const file: ExportFile = { format: 'dnd2024-character', schemaVersion: SCHEMA_VERSION, character: c }
  return JSON.stringify(file, null, 2)
}

export class ImportError extends Error {}

/** 審卡報告（HTML）嵌入存檔用的 `<script type="application/json">` 元素 id */
export const EMBED_ID = 'dnd2024-character'

/** 從審卡報告 HTML 取出嵌入的存檔 JSON；不是 HTML 就原樣回傳 */
function unwrapHtml(text: string): string {
  if (!/^\s*</.test(text)) return text
  const m = new RegExp(String.raw`<script[^>]*\bid="${EMBED_ID}"[^>]*>([\s\S]*?)</script>`, 'i').exec(text)
  if (!m) throw new ImportError('這個 HTML 檔裡沒有角色存檔（只有本站匯出的審卡報告可以匯入）')
  return m[1]!
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/**
 * 匯入 JSON（可以是匯出檔、角色物件本身，或內嵌存檔的審卡報告 HTML）。缺少的欄位補預設值，
 * 版本較新（未知格式）就拒絕，避免默默弄壞資料。
 */
export function importCharacter(json: string): Character {
  const text = unwrapHtml(json)
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new ImportError('不是有效的 JSON 檔')
  }
  const obj = isObj(raw) && raw.format === 'dnd2024-character' ? raw.character : raw
  if (!isObj(obj) || !Array.isArray(obj.levels) || typeof obj.choices !== 'object') {
    throw new ImportError('檔案內容不是角色資料')
  }
  const version = Number(obj.schemaVersion ?? 0)
  if (version > SCHEMA_VERSION) {
    throw new ImportError(`存檔版本 ${version} 比本程式支援的 ${SCHEMA_VERSION} 新，請更新程式`)
  }
  return migrate(obj)
}

/** 舊版存檔升級到目前版本，並補齊缺少的欄位。 */
export function migrate(obj: Record<string, unknown>): Character {
  const base = newCharacter(String(obj.createdAt ?? new Date().toISOString()))
  const c = { ...base, ...obj, schemaVersion: SCHEMA_VERSION } as Character
  c.baseScores = { ...emptyScores(), ...(isObj(obj.baseScores) ? obj.baseScores : {}) } as Character['baseScores']
  c.currency = { ...base.currency, ...(isObj(obj.currency) ? obj.currency : {}) } as Currency
  return c
}
