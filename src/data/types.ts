/**
 * 建置後資料（public/data/*.js）的型別。建置腳本與 app 共用，不可 import Vue。
 */

import type { EntryKind } from './ids.ts'

export type Edition = '2014' | '2024'

/** 一本書或一本冒險的資訊（來源對照表的一列）。 */
export interface SourceInfo {
  /** 代碼，例如 XPHB */
  source: string
  /** 中文名（簡體，來自上游） */
  name: string
  /** 英文名 */
  engName: string
  /** 出版日期 YYYY-MM-DD */
  published: string
  type: 'book' | 'adventure'
  /** 上游的分類：core、supplement、setting、setting-alt… */
  group: string
  edition: Edition
}

/** 所有建置後條目的共同欄位。其餘欄位沿用 5etools 原樣（例如 spell 的 level、school）。 */
export interface Entry {
  /** 統一 id，見 src/data/ids.ts */
  id: string
  kind: EntryKind
  /** 中文名（簡體） */
  name: string
  /** 英文原名 */
  engName?: string
  /** 來源代碼（已統一大小寫，例如 XPHB） */
  source: string
  page?: number
  edition: Edition
  /** 取代此條目的重印版 id（只列出建置後實際存在的條目） */
  reprintedAs?: string[]
  /** 屬於 TCE 可選規則（可選職業特性、定制血統等），預設隱藏 */
  tceOptional?: boolean
  /** 同一條目的幾種版本（例如侏儒的血系、魔法學徒的法術列表），由 `_versions` 展開，每個都是完整條目 */
  versions?: Entry[]
  /** 版本條目：母條目的 id */
  versionOf?: string
  entries?: unknown[]
  [field: string]: unknown
}

/** 法術對應的職業。 */
export interface SpellClassRef {
  className: string
  classSource: string
  /** 由其他書擴充進該職業清單時，列出擴充的書（例如 ["TCE"]）；原生清單則無此欄 */
  definedIn?: string[]
  /** 擴充來源含 TCE → 屬於 TCE 可選規則 */
  tceOptional?: boolean
}

/** 一個資料檔（public/data/<file>.js）的內容：kind → 條目陣列。 */
export type DataFile = Partial<Record<EntryKind, Entry[]>>

/** 資料檔名稱與其包含的類別。 */
export const DATA_FILES = {
  races: ['race', 'subrace'],
  backgrounds: ['background'],
  feats: ['feat'],
  optionalfeatures: ['optionalfeature'],
  items: ['item'],
  spells: ['spell'],
  classes: ['class', 'subclass', 'classFeature', 'subclassFeature'],
  rules: ['language', 'skill', 'condition', 'disease', 'status', 'variantrule', 'sense', 'action', 'itemProperty', 'itemMastery'],
} as const satisfies Record<string, readonly EntryKind[]>

export type DataFileName = keyof typeof DATA_FILES
