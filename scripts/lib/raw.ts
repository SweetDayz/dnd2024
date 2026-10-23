// 讀取 raw/ 底下的 JSON 的小工具。
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export const RAW_DIR = resolve('raw')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = any

export function readRaw(rel: string): Json {
  return JSON.parse(readFileSync(resolve(RAW_DIR, rel), 'utf8'))
}
