/**
 * catalog store：負責載入 public/data/*.js 並建立查詢索引。
 *
 * 資料很大（數千筆、巢狀很深），如果交給 Vue 做「深層響應式」，每個物件都會被包一層 Proxy，
 * 又慢又吃記憶體。所以條目本身用 markRaw() 標記成「不追蹤」，只用一個 version 計數器
 * 讓畫面知道「有新資料進來了」。資料載入後不會再改，這樣做是安全的。
 */
import { defineStore } from 'pinia'
import { computed, markRaw, ref, shallowRef } from 'vue'
import { loadData } from '@/data/loader'
import type { EntryKind } from '@/data/ids'
import { DATA_FILES, type DataFile, type DataFileName, type Entry, type SourceInfo } from '@/data/types'

/** kind → 所在的資料檔 */
const FILE_OF_KIND = Object.fromEntries(
  Object.entries(DATA_FILES).flatMap(([file, kinds]) => kinds.map((k) => [k, file])),
) as Record<EntryKind, DataFileName>

export function fileOfKind(kind: EntryKind): DataFileName {
  return FILE_OF_KIND[kind]
}

/** 索引鍵：id 全部轉小寫（上游參照的來源代碼大小寫不一）。 */
export const indexKey = (kind: EntryKind, name: string, source: string, ...extra: (string | number)[]) =>
  [kind, name, source, ...extra].join('|').toLowerCase()

export const useCatalogStore = defineStore('catalog', () => {
  const sources = shallowRef<SourceInfo[]>([])
  const files = shallowRef<Partial<Record<DataFileName, DataFile>>>({})
  const errors = ref<string[]>([])
  /** 每載入一個檔案就 +1；依賴索引的 computed 會因此重算 */
  const version = ref(0)

  const index = new Map<string, Entry>()
  const pending = new Map<string, Promise<void>>()

  const sourceMap = computed(() => new Map(sources.value.map((s) => [s.source, s])))

  function addToIndex(data: DataFile) {
    for (const list of Object.values(data)) {
      for (const e of list ?? []) {
        index.set(e.id.toLowerCase(), e)
        // 版本也可以直接用 id 查到（背景的起源專長會直接參照「魔法学徒；牧师|xphb」）
        for (const v of e.versions ?? []) index.set(v.id.toLowerCase(), v)
        // {@subclass} 標籤用短名參照：subclass|短名|來源|職業|職業來源
        if (e.kind === 'subclass' && e.shortName && e.shortName !== e.name) {
          index.set(indexKey('subclass', String(e.shortName), e.source, String(e.className), String(e.classSource)), e)
        }
      }
    }
  }

  async function loadSources() {
    if (sources.value.length) return
    sources.value = markRaw(await loadData<SourceInfo[]>('sources'))
  }

  /** 載入一個資料檔（重複呼叫只會載一次）。 */
  function ensure(file: DataFileName): Promise<void> {
    let p = pending.get(file)
    if (!p) {
      p = loadData<DataFile>(file)
        .then((data) => {
          markRaw(data)
          addToIndex(data)
          files.value = { ...files.value, [file]: data }
          version.value++
        })
        .catch((err: unknown) => {
          pending.delete(file)
          errors.value = [...errors.value, err instanceof Error ? err.message : String(err)]
        })
      pending.set(file, p)
    }
    return p
  }

  function list(kind: EntryKind): Entry[] {
    // 讀 version 讓呼叫者（computed）在資料載入後重算
    void version.value
    return files.value[fileOfKind(kind)]?.[kind] ?? []
  }

  function get(key: string): Entry | undefined {
    void version.value
    return index.get(key.toLowerCase())
  }

  function isLoaded(file: DataFileName): boolean {
    return !!files.value[file]
  }

  return { sources, sourceMap, errors, version, loadSources, ensure, list, get, isLoaded }
})
