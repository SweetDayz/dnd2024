import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { viteSingleFile } from 'vite-plugin-singlefile'

// https://vite.dev/config/
export default defineConfig({
  // 用相對路徑產生資源連結，dist/ 放在任何資料夾（含 file://、GitHub Pages 子路徑）都能用。
  base: './',
  plugins: [
    vue(),
    vueDevTools(),
    // 把 app 的 JS 與 CSS 全部 inline 進 index.html。
    // file:// 下瀏覽器會擋 <script type="module" src="...">，inline 之後就沒有這個問題。
    viteSingleFile(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
