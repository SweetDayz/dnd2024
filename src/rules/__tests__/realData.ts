/**
 * 測試用：直接讀 public/data/*.js（build-data 的輸出），做出 RulesData。
 * 資料檔不在 git 裡；沒建置過就回傳 undefined，相關測試會跳過。
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { EntryKind } from '@/data/ids'
import { DEFAULT_GROUP_ID, SOURCE_GROUPS } from '@/data/sourceGroups'
import { DATA_FILES, type DataFile, type Entry } from '@/data/types'
import { isVisible } from '@/data/visibility'
import type { RulesData } from '@/rules/data'

const DIR = resolve(__dirname, '../../../public/data')

export const hasRealData = existsSync(resolve(DIR, 'classes.js'))

let cache: { lists: Map<EntryKind, Entry[]>; index: Map<string, Entry> } | undefined

function loadAll() {
  if (cache) return cache
  const lists = new Map<EntryKind, Entry[]>()
  const index = new Map<string, Entry>()
  for (const file of Object.keys(DATA_FILES)) {
    let data: DataFile = {}
    const fake = { __DND__: { register: (_k: string, d: DataFile) => (data = d) } }
    new Function('window', readFileSync(resolve(DIR, `${file}.js`), 'utf8'))(fake)
    for (const [kind, list] of Object.entries(data) as [EntryKind, Entry[]][]) {
      lists.set(kind, list)
      for (const e of list) {
        index.set(e.id.toLowerCase(), e)
        for (const v of e.versions ?? []) index.set(v.id.toLowerCase(), v)
      }
    }
  }
  cache = { lists, index }
  return cache
}

export function realData(opts: { tceOptional?: boolean; showLegacy?: boolean } = {}): RulesData {
  const { lists, index } = loadAll()
  const enabled = new Set(SOURCE_GROUPS[DEFAULT_GROUP_ID]!.sources)
  const state = { enabled, showLegacy: opts.showLegacy ?? false, tceOptional: opts.tceOptional ?? false }
  return {
    get: (id) => index.get(id.toLowerCase()),
    list: (kind) => lists.get(kind) ?? [],
    visible: (e) => isVisible(e, state),
    tceOptional: state.tceOptional,
    sourceEnabled: (s) => enabled.has(s),
  }
}

/** 讀單一資料檔 register 的內容（sources、meta 這類不是條目清單的檔案） */
export function readRegistered<T>(file: string): T | undefined {
  const path = resolve(DIR, `${file}.js`)
  if (!existsSync(path)) return undefined
  let data: T | undefined
  const fake = { __DND__: { register: (_k: string, d: T) => (data = d) } }
  new Function('window', readFileSync(path, 'utf8'))(fake)
  return data
}
