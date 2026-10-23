/**
 * 建置後資料（public/data/*.js）的型別。建置腳本與 app 共用，不可 import Vue。
 */

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
