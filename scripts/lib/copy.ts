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
export function applyMod(value: Json, mod: Json, lenient = false): Json {
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
      if (i < 0 && lenient) {
        versionWarnings.push(`replaceArr 找不到「${JSON.stringify(mod.replace)}」，改為附加在最後`)
        return [...arr, ...items]
      }
      if (i < 0) throw new Error(`replaceArr 找不到要取代的項目：${JSON.stringify(mod.replace)}`)
      arr.splice(i, 1, ...items)
      return arr
    }
    case 'removeArr': {
      const names: Json[] = [].concat(mod.names ?? mod.items)
      if (lenient && !arr.some((it, idx) => names.some((n) => matches(it, n, idx)))) {
        versionWarnings.push(`removeArr 找不到「${JSON.stringify(names)}」`)
      }
      return arr.filter((it, idx) => !names.some((n) => matches(it, n, idx)))
    }
    case 'replaceTxt':
      return replaceText(value, new RegExp(mod.replace, 'g' + (mod.flags ?? '')), mod.with)
    default:
      throw new Error(`未支援的 _mod mode：${mod.mode}`)
  }
}

export function applyMods(entry: Json, mods: Json, lenient = false): void {
  for (const [path, ops] of Object.entries(mods ?? {})) {
    // 欄位可以是點路徑，例如 magicvariants 的 "inherits.entries"
    const keys = path.split('.')
    const field = keys.pop()!
    let target = entry
    for (const k of keys) target = target[k] = { ...target[k] }

    const list = Array.isArray(ops) ? ops : [ops]
    for (const op of list) {
      // 簡寫 "remove"：直接刪掉這個欄位
      if (op === 'remove') delete target[field]
      else if (typeof op === 'string') throw new Error(`未支援的 _mod 簡寫：${op}`)
      else if (op.mode === 'setProp') target[field] = clone(op.value)
      else target[field] = applyMod(target[field], op, lenient)
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

/**
 * 展開 _versions 時遇到的資料問題（上游翻譯時改了小標題名稱，導致 replaceArr 對不上）。
 * 版本只是「多一種選法」，不該讓整個建置失敗，所以寬鬆處理並收集警告，由 build-data 印出。
 */
export const versionWarnings: string[] = []

/** 把 `{{變數}}` 代入字串（_versions 的 _abstract 模板用）。 */
function fillVariables(value: Json, vars: Record<string, string>): Json {
  if (typeof value === 'string') return value.replace(/\{\{(\w+)\}\}/g, (m, k: string) => vars[k] ?? m)
  if (Array.isArray(value)) return value.map((v) => fillVariables(v, vars))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fillVariables(v, vars)]))
  }
  return value
}

/**
 * 展開 `_versions`（同一條目的幾種「版本」，例如侏儒的森林／岩侏儒血系、魔法學徒的牧師／法師版）。
 *
 * 兩種寫法：
 *   - 一般：`{ name, source, _mod, ...覆蓋欄位 }`
 *   - 模板：`{ _abstract: {name: "龍裔 ({{color}})", _mod}, _implementations: [{ _variables: {color: "黑"}, resist: [...] }] }`
 *
 * 每個版本 = 母條目（不含 _versions）＋版本自己的欄位，再套用 _mod。回傳完整的條目物件。
 */
export function expandVersions(entry: Json): Json[] {
  const { _versions, ...base } = entry
  if (!Array.isArray(_versions)) return []
  const out: Json[] = []
  const one = (spec: Json) => {
    const { _mod, ...own } = spec
    const merged: Json = { ...clone(base), ...clone(own) }
    const before = versionWarnings.length
    applyMods(merged, _mod, true)
    for (let i = before; i < versionWarnings.length; i++) versionWarnings[i] = `${merged.name}（${merged.source}）：${versionWarnings[i]}`
    out.push(merged)
  }
  for (const v of _versions) {
    if (v._abstract) {
      for (const impl of v._implementations ?? []) {
        const { _variables = {}, ...own } = impl
        one({ ...fillVariables(clone(v._abstract), _variables), ...own })
      }
    } else one(v)
  }
  return out
}
