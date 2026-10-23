/**
 * 按需載入第三方函式庫（classic script）。
 *
 * 為什麼不用 import('exceljs')？
 *   vite-plugin-singlefile 會把動態 import 也 inline 進 index.html，讓首頁多 860KB；
 *   而 file:// 下又不能載入獨立的 ES module。所以比照資料檔的做法：
 *   vite.config.ts 把 ExcelJS 的 UMD 版本複製成 dist/vendor/exceljs.min.js，
 *   這裡在第一次匯出時插入 <script src>，等它在 window 上掛好 ExcelJS 全域變數。
 */
import type * as ExcelJSNamespace from 'exceljs'

export type ExcelJSLib = typeof ExcelJSNamespace

declare global {
  interface Window {
    ExcelJS?: ExcelJSLib
  }
}

let pending: Promise<ExcelJSLib> | undefined

export function loadExcelJS(): Promise<ExcelJSLib> {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS)
  pending ??= new Promise<ExcelJSLib>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'vendor/exceljs.min.js'
    script.async = true
    script.addEventListener('load', () => {
      if (window.ExcelJS) resolve(window.ExcelJS)
      else reject(new Error('vendor/exceljs.min.js 已載入，但沒有 window.ExcelJS'))
    })
    script.addEventListener('error', () => {
      pending = undefined
      reject(new Error('無法載入 vendor/exceljs.min.js'))
    })
    document.head.appendChild(script)
  })
  return pending
}
