import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { viteSingleFile } from 'vite-plugin-singlefile'

/**
 * 只在需要時才載入的大型第三方函式庫（例如 ExcelJS，約 860KB）。
 * 不 inline 進 index.html，而是輸出成 dist/vendor/*.js 的 classic script，
 * 由 src/export/vendor.ts 在使用者按下按鈕時動態插入 <script> 載入（file:// 可用）。
 */
const VENDOR_FILES: Record<string, string> = {
  'vendor/exceljs.min.js': 'node_modules/exceljs/dist/exceljs.bare.min.js',
}

function vendorScripts(): Plugin {
  const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)))
  return {
    name: 'vendor-scripts',
    // dev server：直接從 node_modules 回傳
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split('?')[0]!.replace(/^\//, '')
        const src = VENDOR_FILES[path]
        if (!src) return next()
        res.setHeader('Content-Type', 'text/javascript')
        res.end(read(src))
      })
    },
    // build：複製成獨立檔案
    generateBundle() {
      for (const [fileName, src] of Object.entries(VENDOR_FILES)) {
        this.emitFile({ type: 'asset', fileName, source: read(src) })
      }
    },
  }
}

const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8')) as { version: string }

// https://vite.dev/config/
export default defineConfig({
  // 編譯期常數：程式裡的 __APP_VERSION__ 會被替換成字串（xlsx「關於」工作表用）
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  // 用相對路徑產生資源連結，dist/ 放在任何資料夾（含 file://、GitHub Pages 子路徑）都能用。
  base: './',
  plugins: [
    vue(),
    vueDevTools(),
    // 把 app 的 JS 與 CSS 全部 inline 進 index.html。
    // file:// 下瀏覽器會擋 <script type="module" src="...">，inline 之後就沒有這個問題。
    viteSingleFile(),
    vendorScripts(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
