/**
 * Classic-script 資料載入器。
 *
 * 為什麼不用 fetch 或 import()？
 *   使用者會直接雙擊 dist/index.html（file:// 協定），Chrome 在 file:// 下會擋 fetch 與
 *   ES module 載入。但「一般的 <script src>」不受限制，所以資料檔寫成：
 *
 *     window.__DND__.register('spells', { ... })
 *
 *   App 在需要時動態插入 <script src="data/spells.js">，等檔案呼叫 register() 後交出資料。
 */

export type DataKind = string

interface DndGlobal {
  register(kind: DataKind, data: unknown): void
}

declare global {
  interface Window {
    __DND__?: DndGlobal
  }
}

/** 已經 register 過的資料（資料檔可能比 loadData 呼叫更早執行，所以先存起來）。 */
const registered = new Map<DataKind, unknown>()
/** 正在等待某類資料的 resolve 函式。 */
const waiting = new Map<DataKind, (data: unknown) => void>()
/** 每類資料只載入一次；重複呼叫 loadData 會拿到同一個 Promise。 */
const pending = new Map<DataKind, Promise<unknown>>()

/** 確保 window.__DND__ 存在。資料檔執行前一定要先呼叫過。 */
export function installGlobal(): DndGlobal {
  if (!window.__DND__) {
    window.__DND__ = {
      register(kind, data) {
        registered.set(kind, data)
        waiting.get(kind)?.(data)
        waiting.delete(kind)
      },
    }
  }
  return window.__DND__
}

/** 資料檔的相對路徑。相對於 index.html，所以 dev server 與 file:// 都適用。 */
export function dataUrl(kind: DataKind): string {
  return `data/${kind}.js`
}

/**
 * 載入一類資料。回傳的 Promise 在資料檔呼叫 register(kind, ...) 後 resolve；
 * 檔案不存在、或檔案載入了卻沒有 register 這個 kind，就 reject。
 */
export function loadData<T>(kind: DataKind): Promise<T> {
  installGlobal()

  if (registered.has(kind)) return Promise.resolve(registered.get(kind) as T)

  let promise = pending.get(kind)
  if (!promise) {
    promise = new Promise<unknown>((resolve, reject) => {
      waiting.set(kind, resolve)

      const script = document.createElement('script')
      script.src = dataUrl(kind)
      script.async = true
      // 正常情況下，資料檔執行時就會呼叫 register 並 resolve；load 事件在那之後才觸發。
      script.addEventListener('load', () => {
        if (!registered.has(kind)) {
          waiting.delete(kind)
          reject(new Error(`資料檔 ${script.src} 已載入，但沒有註冊「${kind}」`))
        }
      })
      script.addEventListener('error', () => {
        waiting.delete(kind)
        reject(new Error(`無法載入資料檔 ${script.src}`))
      })
      document.head.appendChild(script)
    })
    // 失敗時清掉快取，讓之後可以重試。
    promise.catch(() => pending.delete(kind))
    pending.set(kind, promise)
  }
  return promise as Promise<T>
}

/** 只給測試用：清空所有快取與全域物件。 */
export function resetLoaderForTests(): void {
  registered.clear()
  waiting.clear()
  pending.clear()
  delete window.__DND__
  document.head.querySelectorAll('script[src^="data/"]').forEach((el) => el.remove())
}
