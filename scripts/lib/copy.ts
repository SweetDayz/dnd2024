// 解析 5etools 的 `_copy` / `_mod`（條目繼承另一筆條目，再套用修改）。
//
//   { name: '波尬', source: 'LFL', _copy: { name: '地精', source: 'MPMM', _mod: {...}, _preserve: {...} } }
//
// 規則（依上游資料實測，見 docs/data-notes.md §3）：
// 1. 以母條目的深拷貝為底，子條目自己的欄位覆蓋上去。
// 2. NON_INHERITED 裡的欄位不繼承，除非 `_preserve` 指定保留。
// 3. 再依 `_mod` 逐欄位套用修改。
// 4. 母條目本身也可能有 `_copy`（複製的複製），所以遞迴解析。
import type { Json } from './raw.ts'

/** 預設不從母條目繼承的欄位。 */
const NON_INHERITED = [
  'page',
  'srd',
  'srd52',
  'basicRules',
  'basicRules2024',
  'reprintedAs',
  'otherSources',
  'referenceSources',
  'additionalSources',
  'hasFluff',
  'hasFluffImages',
  '_versions',
]

const clone = <T>(v: T): T => structuredClone(v)

/** 判斷陣列元素是否就是 `replace` 指定的那一項（字串比對整段文字，物件比對 name）。 */
function matches(item: Json, target: Json, index: number): boolean {
  if (typeof target === 'object' && target !== null) {
    if (typeof target.index === 'number') return index === target.index
    if (typeof target.regex === 'string') {
      const text = typeof item === 'string' ? item : item?.name
      return typeof text === 'string' && new RegExp(target.regex, target.flags).test(text)
    }
    return false
  }
  return typeof item === 'string' ? item === target : item?.name === target
}

function replaceText(value: Json, re: RegExp, withText: string): Json {
  if (typeof value === 'string') return value.replace(re, withText)
  if (Array.isArray(value)) return value.map((v) => replaceText(v, re, withText))
  if (value && typeof value === 'object') {
    const out: Json = {}
    for (const [k, v] of Object.entries(value)) {
      // type、名稱以外的英文欄位不動；只改內文字串。
      out[k] = k === 'type' || k === 'ENG_name' ? v : replaceText(v, re, withText)
    }
    return out
  }
  return value
}

/** 對單一欄位套用一個 `_mod` 操作。未知的 mode 會丟例外，讓建置失敗而不是默默出錯。 */
export function applyMod(value: Json, mod: Json): Json {
  const items = mod.items === undefined ? [] : [].concat(clone(mod.items))
  const arr: Json[] = Array.isArray(value) ? [...value] : value === undefined ? [] : [value]
  switch (mod.mode) {
    case 'appendArr':
      return [...arr, ...items]
    case 'prependArr':
      return [...items, ...arr]
    case 'appendIfNotExistsArr':
      return [...arr, ...items.filter((it) => !arr.some((a) => JSON.stringify(a) === JSON.stringify(it)))]
    case 'insertArr':
      arr.splice(mod.index, 0, ...items)
      return arr
    case 'replaceArr': {
      const i = arr.findIndex((it, idx) => matches(it, mod.replace, idx))
      if (i < 0) throw new Error(`replaceArr 找不到要取代的項目：${JSON.stringify(mod.replace)}`)
      arr.splice(i, 1, ...items)
      return arr
    }
    case 'removeArr': {
      const names: Json[] = [].concat(mod.names ?? mod.items)
      return arr.filter((it, idx) => !names.some((n) => matches(it, n, idx)))
    }
    case 'replaceTxt':
      return replaceText(value, new RegExp(mod.replace, 'g' + (mod.flags ?? '')), mod.with)
    default:
      throw new Error(`未支援的 _mod mode：${mod.mode}`)
  }
}

export function applyMods(entry: Json, mods: Json): void {
  for (const [field, ops] of Object.entries(mods ?? {})) {
    const list = Array.isArray(ops) ? ops : [ops]
    for (const op of list) {
      if (typeof op === 'string') throw new Error(`未支援的 _mod 簡寫：${op}`)
      entry[field] = applyMod(entry[field], op)
    }
  }
}

/**
 * 解析一整個陣列裡的 `_copy`。
 * @param keyOf     條目本身的查找鍵
 * @param copyKeyOf `_copy` 物件指向的查找鍵（通常與 keyOf 用同一套欄位）
 * @returns 新陣列，順序不變；每筆都不再有 `_copy`
 */
export function resolveCopies(
  entries: Json[],
  keyOf: (e: Json) => string,
  copyKeyOf: (c: Json) => string = keyOf,
): Json[] {
  const byKey = new Map<string, Json>()
  for (const e of entries) byKey.set(keyOf(e), e)
  const done = new Map<Json, Json>()

  function resolve(e: Json, stack: Set<Json>): Json {
    if (!e._copy) return e
    const cached = done.get(e)
    if (cached) return cached
    if (stack.has(e)) throw new Error(`_copy 循環：${keyOf(e)}`)
    stack.add(e)

    const parentKey = copyKeyOf(e._copy)
    const parentRaw = byKey.get(parentKey)
    if (!parentRaw) throw new Error(`_copy 找不到母條目：${parentKey}（來自 ${keyOf(e)}）`)
    const parent = clone(resolve(parentRaw, stack))

    const preserve: Record<string, boolean> = e._copy._preserve ?? {}
    for (const f of NON_INHERITED) if (!preserve[f]) delete parent[f]

    const { _copy, ...own } = e
    const merged: Json = { ...parent, ...clone(own) }
    applyMods(merged, _copy._mod)
    done.set(e, merged)
    stack.delete(e)
    return merged
  }

  return entries.map((e) => resolve(e, new Set()))
}
